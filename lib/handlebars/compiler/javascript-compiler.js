import Exception from '#handlebars/exception';
import CodeGen from '#handlebars/compiler/code-gen';

class Literal {
  constructor(value) {
    this.value = value;
  }
}

class JavaScriptCompiler {
  // PUBLIC API: You can override these methods in a subclass to provide
  // alternative compiled forms for name lookup and buffering semantics
  nameLookup(parent, name /*,  type */) {
    return this.internalNameLookup(parent, name);
  }

  depthedLookup(name) {
    return [
      this.aliasable('container.lookup'),
      '(depths, ',
      JSON.stringify(name),
      ')'
    ];
  }

  appendToBuffer(source, location, explicit) {
    // Force a source as this simplifies the merge logic.
    if (!Array.isArray(source)) {
      source = [source];
    }
    source = this.source.wrap(source, location);

    if (this.environment.isSimple) {
      return ['return ', source, ';'];
    } else if (explicit) {
      // This is a case where the buffer operation occurs as a child of another
      // construct, generally braces. We have to explicitly output these buffer
      // operations to ensure that the emitted code goes in the correct location.
      return ['buffer += ', source, ';'];
    } 
      source.appendToBuffer = true;
      return source;
    
  }

  initializeBuffer() {
    return this.quotedString('');
  }

  // END PUBLIC API
  internalNameLookup(parent, name) {
    this.lookupPropertyFunctionIsUsed = true;
    return ['lookupProperty(', parent, ',', JSON.stringify(name), ')'];
  }

  lookupPropertyFunctionIsUsed = false;

  compile(environment, options, context, asObject) {
    this.environment = environment;
    this.options = options;
    this.stringParams = this.options.stringParams;
    this.trackIds = this.options.trackIds;
    this.precompile = !asObject;

    this.name = this.environment.name;
    this.isChild = !!context;
    this.context = context || {
      decorators: [],
      programs: [],
      environments: []
    };

    this.preamble();

    this.stackSlot = 0;
    this.stackVars = [];
    this.aliases = {};
    this.registers = { list: [] };
    this.hashes = [];
    this.compileStack = [];
    this.inlineStack = [];
    this.blockParams = [];

    this.compileChildren(environment, options);

    this.useDepths =
      this.useDepths ||
      environment.useDepths ||
      environment.useDecorators ||
      this.options.compat;
    this.useBlockParams = this.useBlockParams || environment.useBlockParams;

    let opcodes = environment.opcodes,
      opcode,
      firstLoc,
      i,
      l;

    for (i = 0, l = opcodes.length; i < l; i++) {
      opcode = opcodes[i];

      this.source.currentLocation = opcode.loc;
      firstLoc = firstLoc || opcode.loc;
      this[opcode.opcode].apply(this, opcode.args);
    }

    // Flush any trailing content that might be pending.
    this.source.currentLocation = firstLoc;
    this.pushSource('');

    if (this.stackSlot || this.inlineStack.length || this.compileStack.length) {
      throw new Exception('Compile completed with content left on stack');
    }

    if (!this.decorators.isEmpty()) {
      this.useDecorators = true;

      this.decorators.prepend([
        'var decorators = container.decorators, ',
        this.lookupPropertyFunctionVarDeclaration(),
        ';\n'
      ]);
      this.decorators.push('return fn;');

      if (asObject) {
        this.decorators = Function.apply(this, [
          'fn',
          'props',
          'container',
          'depth0',
          'data',
          'blockParams',
          'depths',
          this.decorators.merge()
        ]);
      } else {
        this.decorators.prepend(
          'function(fn, props, container, depth0, data, blockParams, depths) {\n'
        );
        this.decorators.push('}\n');
        this.decorators = this.decorators.merge();
      }
    } else {
      this.decorators = undefined;
    }

    let fn = this.createFunctionContext(asObject);
    if (!this.isChild) {
      let ret = {
        main: fn
      };

      if (this.decorators) {
        ret.main_d = this.decorators;
        ret.useDecorators = true;
      }

      const { programs, decorators } = this.context;
      for (i = 0, l = programs.length; i < l; i++) {
        if (programs[i]) {
          ret[i] = programs[i];
          if (decorators[i]) {
            ret[i + '_d'] = decorators[i];
            ret.useDecorators = true;
          }
        }
      }

      if (this.environment.usePartial) {
        ret.usePartial = true;
      }
      if (this.options.data) {
        ret.useData = true;
      }
      if (this.useDepths) {
        ret.useDepths = true;
      }
      if (this.useBlockParams) {
        ret.useBlockParams = true;
      }
      if (this.options.compat) {
        ret.compat = true;
      }

      if (!asObject) {
        ret.compiler = JSON.stringify(ret.compiler);

        this.source.currentLocation = { start: { line: 1, column: 0 } };
        ret = this.objectLiteral(ret);

        if (options.srcName) {
          ret = ret.toStringWithSourceMap({ file: options.destName });
          ret.map = ret.map && ret.map.toString();
        } else {
          ret = ret.toString();
        }
      } else {
        ret.compilerOptions = this.options;
      }

      return ret;
    } 
      return fn;
    
  }

  preamble() {
    // track the last context pushed into place to allow skipping the
    // getContext opcode when it would be a noop
    this.lastContext = 0;
    this.source = new CodeGen(this.options.srcName);
    this.decorators = new CodeGen(this.options.srcName);
  }

  createFunctionContext(asObject) {
    let varDeclarations = '';

    let locals = this.stackVars.concat(this.registers.list);
    if (locals.length > 0) {
      varDeclarations += ', ' + locals.join(', ');
    }

    // Generate minimizer alias mappings
    //
    // When using true SourceNodes, this will update all references to the given alias
    // as the source nodes are reused in situ. For the non-source node compilation mode,
    // aliases will not be used, but this case is already being run on the client and
    // we aren't concern about minimizing the template size.
    let aliasCount = 0;
    Object.keys(this.aliases).forEach(alias => {
      let node = this.aliases[alias];
      if (node.children && node.referenceCount > 1) {
        varDeclarations += ', alias' + ++aliasCount + '=' + alias;
        node.children[0] = 'alias' + aliasCount;
      }
    });

    if (this.lookupPropertyFunctionIsUsed) {
      varDeclarations += ', ' + this.lookupPropertyFunctionVarDeclaration();
    }

    let params = ['container', 'depth0', 'helpers', 'partials', 'data'];

    if (this.useBlockParams || this.useDepths) {
      params.push('blockParams');
    }
    if (this.useDepths) {
      params.push('depths');
    }

    // Perform a second pass over the output to merge content when possible
    let source = this.mergeSource(varDeclarations);

    if (asObject) {
      params.push(source);

      return Function.apply(this, params);
    } 
      return this.source.wrap([
        'function(',
        params.join(','),
        ') {\n  ',
        source,
        '}'
      ]);
    
  }

  mergeSource(varDeclarations) {
    let isSimple = this.environment.isSimple,
      appendOnly = !this.forceBuffer,
      appendFirst,
      sourceSeen,
      bufferStart,
      bufferEnd;
    this.source.each(line => {
      if (line.appendToBuffer) {
        if (bufferStart) {
          line.prepend('  + ');
        } else {
          bufferStart = line;
        }
        bufferEnd = line;
      } else {
        if (bufferStart) {
          if (!sourceSeen) {
            appendFirst = true;
          } else {
            bufferStart.prepend('buffer += ');
          }
          bufferEnd.add(';');
          bufferStart = bufferEnd = undefined;
        }

        sourceSeen = true;
        if (!isSimple) {
          appendOnly = false;
        }
      }
    });

    if (appendOnly) {
      if (bufferStart) {
        bufferStart.prepend('return ');
        bufferEnd.add(';');
      } else if (!sourceSeen) {
        this.source.push('return "";');
      }
    } else {
      varDeclarations +=
        ', buffer = ' + (appendFirst ? '' : this.initializeBuffer());

      if (bufferStart) {
        bufferStart.prepend('return buffer + ');
        bufferEnd.add(';');
      } else {
        this.source.push('return buffer;');
      }
    }

    if (varDeclarations) {
      this.source.prepend(
        'var ' + varDeclarations.substring(2) + (appendFirst ? '' : ';\n')
      );
    }

    return this.source.merge();
  }

  lookupPropertyFunctionVarDeclaration() {
    return `
      lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.hasOwn(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    }
    `.trim();
  }

  // [blockValue]
  //
  // On stack, before: hash, inverse, program, value
  // On stack, after: return value of blockHelperMissing
  //
  // The purpose of this opcode is to take a block of the form
  // `{{#this.foo}}...{{/this.foo}}`, resolve the value of `foo`, and
  // replace it on the stack with the result of properly
  // invoking blockHelperMissing.
  blockValue(name) {
    let blockHelperMissing = this.aliasable(
        'container.hooks.blockHelperMissing'
      ),
      params = [this.contextName(0)];
    this.setupHelperArgs(name, 0, params);

    let blockName = this.popStack();
    params.splice(1, 0, blockName);

    this.push(this.source.functionCall(blockHelperMissing, 'call', params));
  }

  // [ambiguousBlockValue]
  //
  // On stack, before: hash, inverse, program, value
  // Compiler value, before: lastHelper=value of last found helper, if any
  // On stack, after, if no lastHelper: same as [blockValue]
  // On stack, after, if lastHelper: value
  ambiguousBlockValue() {
    // We're being a bit cheeky and reusing the options value from the prior exec
    let blockHelperMissing = this.aliasable(
        'container.hooks.blockHelperMissing'
      ),
      params = [this.contextName(0)];
    this.setupHelperArgs('', 0, params, true);

    this.flushInline();

    let current = this.topStack();
    params.splice(1, 0, current);

    this.pushSource([
      'if (!',
      this.lastHelper,
      ') { ',
      current,
      ' = ',
      this.source.functionCall(blockHelperMissing, 'call', params),
      '}'
    ]);
  }

  // [appendContent]
  //
  // On stack, before: ...
  // On stack, after: ...
  //
  // Appends the string value of `content` to the current buffer
  appendContent(content) {
    if (this.pendingContent) {
      content = this.pendingContent + content;
    } else {
      this.pendingLocation = this.source.currentLocation;
    }

    this.pendingContent = content;
  }

  // [append]
  //
  // On stack, before: value, ...
  // On stack, after: ...
  //
  // Coerces `value` to a String and appends it to the current buffer.
  //
  // If `value` is truthy, or 0, it is coerced into a string and appended
  // Otherwise, the empty string is appended
  append() {
    if (this.isInline()) {
      this.replaceStack(current => [' != null ? ', current, ' : ""']);

      this.pushSource(this.appendToBuffer(this.popStack()));
    } else {
      let local = this.popStack();
      this.pushSource([
        'if (',
        local,
        ' != null) { ',
        this.appendToBuffer(local, undefined, true),
        ' }'
      ]);
      if (this.environment.isSimple) {
        this.pushSource([
          'else { ',
          this.appendToBuffer("''", undefined, true),
          ' }'
        ]);
      }
    }
  }

  // [appendEscaped]
  //
  // On stack, before: value, ...
  // On stack, after: ...
  //
  // Escape `value` and append it to the buffer
  appendEscaped() {
    this.pushSource(
      this.appendToBuffer([
        this.aliasable('container.escapeExpression'),
        '(',
        this.popStack(),
        ')'
      ])
    );
  }

  // [getContext]
  //
  // On stack, before: ...
  // On stack, after: ...
  // Compiler value, after: lastContext=depth
  //
  // Set the value of the `lastContext` compiler value to the depth
  getContext(depth) {
    this.lastContext = depth;
  }

  // [pushContext]
  //
  // On stack, before: ...
  // On stack, after: currentContext, ...
  //
  // Pushes the value of the current context onto the stack.
  pushContext() {
    this.pushStackLiteral(this.contextName(this.lastContext));
  }

  // [lookupOnContext]
  //
  // On stack, before: ...
  // On stack, after: currentContext[name], ...
  //
  // Looks up the value of `name` on the current context and pushes
  // it onto the stack.
  lookupOnContext(parts, falsy, strict, scoped) {
    let i = 0;

    if (!scoped && this.options.compat && !this.lastContext) {
      // The depthed query is expected to handle the undefined logic for the root level that
      // is implemented below, so we evaluate that directly in compat mode
      this.push(this.depthedLookup(parts[i++]));
    } else {
      this.pushContext();
    }

    this.resolvePath('context', parts, i, falsy, strict);
  }

  // [lookupBlockParam]
  //
  // On stack, before: ...
  // On stack, after: blockParam[name], ...
  //
  // Looks up the value of `parts` on the given block param and pushes
  // it onto the stack.
  lookupBlockParam(blockParamId, parts) {
    this.useBlockParams = true;

    this.push(['blockParams[', blockParamId[0], '][', blockParamId[1], ']']);
    this.resolvePath('context', parts, 1);
  }

  // [lookupData]
  //
  // On stack, before: ...
  // On stack, after: data, ...
  //
  // Push the data lookup operator
  lookupData(depth, parts, strict) {
    if (!depth) {
      this.pushStackLiteral('data');
    } else {
      this.pushStackLiteral('container.data(data, ' + depth + ')');
    }

    this.resolvePath('data', parts, 0, true, strict);
  }

  resolvePath(type, parts, i, falsy, strict) {
    if (this.options.strict || this.options.assumeObjects) {
      this.push(
        strictLookup(this.options.strict && strict, this, parts, i, type)
      );
      return;
    }

    let len = parts.length;
    for (; i < len; i++) {
      this.replaceStack(current => {
        let lookup = this.nameLookup(current, parts[i], type);
        // We want to ensure that zero and false are handled properly if the context (falsy flag)
        // needs to have the special handling for these values.
        if (!falsy) {
          return [' != null ? ', lookup, ' : ', current];
        } 
          // Otherwise we can use generic falsy handling
          return [' && ', lookup];
        
      });
    }
  }

  // [resolvePossibleLambda]
  //
  // On stack, before: value, ...
  // On stack, after: resolved value, ...
  //
  // If the `value` is a lambda, replace it on the stack by
  // the return value of the lambda
  resolvePossibleLambda() {
    this.push([
      this.aliasable('container.lambda'),
      '(',
      this.popStack(),
      ', ',
      this.contextName(0),
      ')'
    ]);
  }

  // [pushStringParam]
  //
  // On stack, before: ...
  // On stack, after: string, currentContext, ...
  //
  // This opcode is designed for use in string mode, which
  // provides the string value of a parameter along with its
  // depth rather than resolving it immediately.
  pushStringParam(string, type, idType, idName, idChild) {
    this.pushContext();
    this.pushString(type);
    if (idType != null) {
      this.pushId(idType, idName, idChild);
    }

    // If it's a subexpression, the string result
    // will be pushed after this opcode.
    if (type !== 'SubExpression') {
      if (typeof string === 'string') {
        this.pushString(string);
      } else {
        this.pushStackLiteral(string);
      }
    }
  }

  emptyHash(omitEmpty) {
    if (this.stringParams) {
      this.push('{}'); // hashContexts
      this.push('{}'); // hashTypes
    }
    if (this.trackIds) {
      this.push('{}'); // hashIds
    }
    this.pushStackLiteral(omitEmpty ? 'undefined' : '{}');
  }

  pushHash() {
    if (this.hash) {
      this.hashes.push(this.hash);
    }
    this.hash = { values: {}, types: [], contexts: [], ids: [] };
  }

  popHash() {
    let hash = this.hash;
    this.hash = this.hashes.pop();

    if (this.stringParams) {
      this.push(this.objectLiteral(hash.contexts));
      this.push(this.objectLiteral(hash.types));
    }
    if (this.trackIds) {
      this.push(this.objectLiteral(hash.ids));
    }

    this.push(this.objectLiteral(hash.values));
  }

  // [pushString]
  //
  // On stack, before: ...
  // On stack, after: quotedString(string), ...
  //
  // Push a quoted version of `string` onto the stack
  pushString(string) {
    this.pushStackLiteral(this.quotedString(string));
  }

  // [pushLiteral]
  //
  // On stack, before: ...
  // On stack, after: value, ...
  //
  // Pushes a value onto the stack. This operation prevents
  // the compiler from creating a temporary variable to hold
  // it.
  pushLiteral(value) {
    this.pushStackLiteral(value);
  }

  // [pushProgram]
  //
  // On stack, before: ...
  // On stack, after: program(guid), ...
  //
  // Push a program expression onto the stack. This takes
  // a compile-time guid and converts it into a runtime-accessible
  // expression.
  pushProgram(guid) {
    if (guid != null) {
      this.pushStackLiteral(this.programExpression(guid));
    } else {
      this.pushStackLiteral(null);
    }
  }

  // [registerDecorator]
  //
  // On stack, before: hash, program, params..., ...
  // On stack, after: ...
  //
  // Pops off the decorator's parameters, invokes the decorator,
  // and inserts the decorator into the decorators list.
  registerDecorator(paramSize, name) {
    let foundDecorator = this.nameLookup('decorators', name, 'decorator'),
      options = this.setupHelperArgs(name, paramSize);

    this.decorators.push([
      'fn = ',
      this.decorators.functionCall(foundDecorator, '', [
        'fn',
        'props',
        'container',
        options
      ]),
      ' || fn;'
    ]);
  }

  // [invokeHelper]
  //
  // On stack, before: hash, inverse, program, params..., ...
  // On stack, after: result of helper invocation
  //
  // Pops off the helper's parameters, invokes the helper,
  // and pushes the helper's return value onto the stack.
  //
  // If the helper is not found, `helperMissing` is called.
  invokeHelper(paramSize, name, isSimple) {
    let nonHelper = this.popStack(),
      helper = this.setupHelper(paramSize, name);

    let possibleFunctionCalls = [];

    if (isSimple) {
      // direct call to helper
      possibleFunctionCalls.push(helper.name);
    }
    // call a function from the input object
    possibleFunctionCalls.push(nonHelper);
    if (!this.options.strict) {
      possibleFunctionCalls.push(
        this.aliasable('container.hooks.helperMissing')
      );
    }

    let functionLookupCode = [
      '(',
      this.itemsSeparatedBy(possibleFunctionCalls, '||'),
      ')'
    ];
    let functionCall = this.source.functionCall(
      functionLookupCode,
      'call',
      helper.callParams
    );
    this.push(functionCall);
  }

  itemsSeparatedBy(items, separator) {
    let result = [];
    result.push(items[0]);
    for (let i = 1; i < items.length; i++) {
      result.push(separator, items[i]);
    }
    return result;
  }

  // [invokeKnownHelper]
  //
  // On stack, before: hash, inverse, program, params..., ...
  // On stack, after: result of helper invocation
  //
  // This operation is used when the helper is known to exist,
  // so a `helperMissing` fallback is not required.
  invokeKnownHelper(paramSize, name) {
    let helper = this.setupHelper(paramSize, name);
    this.push(this.source.functionCall(helper.name, 'call', helper.callParams));
  }

  // [invokeAmbiguous]
  //
  // On stack, before: hash, inverse, program, params..., ...
  // On stack, after: result of disambiguation
  //
  // This operation is used when an expression like `{{foo}}`
  // is provided, but we don't know at compile-time whether it
  // is a helper or a path.
  //
  // This operation emits more code than the other options,
  // and can be avoided by passing the `knownHelpers` and
  // `knownHelpersOnly` flags at compile-time.
  invokeAmbiguous(name, helperCall) {
    this.useRegister('helper');

    let nonHelper = this.popStack();

    this.emptyHash();
    let helper = this.setupHelper(0, name, helperCall);

    let helperName = this.lastHelper = this.nameLookup(
      'helpers',
      name,
      'helper'
    );

    let lookup = ['(', '(helper = ', helperName, ' || ', nonHelper, ')'];
    if (!this.options.strict) {
      lookup[0] = '(helper = ';
      lookup.push(
        ' != null ? helper : ',
        this.aliasable('container.hooks.helperMissing')
      );
    }

    this.push([
      '(',
      lookup,
      helper.paramsInit ? ['),(', helper.paramsInit] : [],
      '),',
      '(typeof helper === ',
      this.aliasable('"function"'),
      ' ? ',
      this.source.functionCall('helper', 'call', helper.callParams),
      ' : helper))'
    ]);
  }

  // [invokePartial]
  //
  // On stack, before: context, ...
  // On stack after: result of partial invocation
  //
  // This operation pops off a context, invokes a partial with that context,
  // and pushes the result of the invocation back.
  invokePartial(isDynamic, name, indent) {
    let params = [],
      options = this.setupParams(name, 1, params);

    if (isDynamic) {
      name = this.popStack();
      delete options.name;
    }

    if (indent) {
      options.indent = JSON.stringify(indent);
    }
    options.helpers = 'helpers';
    options.partials = 'partials';
    options.decorators = 'container.decorators';

    if (!isDynamic) {
      params.unshift(this.nameLookup('partials', name, 'partial'));
    } else {
      params.unshift(name);
    }

    if (this.options.compat) {
      options.depths = 'depths';
    }
    options = this.objectLiteral(options);
    params.push(options);

    this.push(this.source.functionCall('container.invokePartial', '', params));
  }

  // [assignToHash]
  //
  // On stack, before: value, ..., hash, ...
  // On stack, after: ..., hash, ...
  //
  // Pops a value off the stack and assigns it to the current hash
  assignToHash(key) {
    let value = this.popStack(),
      context,
      type,
      id;

    if (this.trackIds) {
      id = this.popStack();
    }
    if (this.stringParams) {
      type = this.popStack();
      context = this.popStack();
    }

    let hash = this.hash;
    if (context) {
      hash.contexts[key] = context;
    }
    if (type) {
      hash.types[key] = type;
    }
    if (id) {
      hash.ids[key] = id;
    }
    hash.values[key] = value;
  }

  pushId(type, name, child) {
    if (type === 'BlockParam') {
      this.pushStackLiteral(
        'blockParams[' +
          name[0] +
          '].path[' +
          name[1] +
          ']' +
          (child ? ' + ' + JSON.stringify('.' + child) : '')
      );
    } else if (type === 'PathExpression') {
      this.pushString(name);
    } else if (type === 'SubExpression') {
      this.pushStackLiteral('true');
    } else {
      this.pushStackLiteral('null');
    }
  }

  // HELPERS

  compileChildren(environment, options) {
    let children = environment.children,
      child,
      compiler;

    for (let i = 0, l = children.length; i < l; i++) {
      child = children[i];
      compiler = new JavaScriptCompiler();

      let existing = this.matchExistingProgram(child);

      if (existing == null) {
        this.context.programs.push(''); // Placeholder to prevent name conflicts for nested children
        let index = this.context.programs.length;
        child.index = index;
        child.name = 'program' + index;
        this.context.programs[index] = compiler.compile(
          child,
          options,
          this.context,
          !this.precompile
        );
        this.context.decorators[index] = compiler.decorators;
        this.context.environments[index] = child;

        this.useDepths = this.useDepths || compiler.useDepths;
        this.useBlockParams = this.useBlockParams || compiler.useBlockParams;
        child.useDepths = this.useDepths;
        child.useBlockParams = this.useBlockParams;
      } else {
        child.index = existing.index;
        child.name = 'program' + existing.index;

        this.useDepths = this.useDepths || existing.useDepths;
        this.useBlockParams = this.useBlockParams || existing.useBlockParams;
      }
    }
  }

  matchExistingProgram(child) {
    for (let i = 0, len = this.context.environments.length; i < len; i++) {
      let environment = this.context.environments[i];
      if (environment && environment.equals(child)) {
        return environment;
      }
    }
  }

  programExpression(guid) {
    let child = this.environment.children[guid],
      programParams = [child.index, 'data', child.blockParams];

    if (this.useBlockParams || this.useDepths) {
      programParams.push('blockParams');
    }
    if (this.useDepths) {
      programParams.push('depths');
    }

    return 'container.program(' + programParams.join(', ') + ')';
  }

  useRegister(name) {
    if (!this.registers[name]) {
      this.registers[name] = true;
      this.registers.list.push(name);
    }
  }

  push(expr) {
    if (!(expr instanceof Literal)) {
      expr = this.source.wrap(expr);
    }

    this.inlineStack.push(expr);
    return expr;
  }

  pushStackLiteral(item) {
    this.push(new Literal(item));
  }

  pushSource(source) {
    if (this.pendingContent) {
      this.source.push(
        this.appendToBuffer(
          this.source.quotedString(this.pendingContent),
          this.pendingLocation
        )
      );
      this.pendingContent = undefined;
    }

    if (source) {
      this.source.push(source);
    }
  }

  replaceStack(callback) {
    let prefix = ['('],
      stack,
      createdStack,
      usedLiteral;

    if (!this.isInline()) {
      throw new Exception('replaceStack on non-inline');
    }

    // We want to merge the inline statement into the replacement statement via ','
    let top = this.popStack(true);

    if (top instanceof Literal) {
      // Literals do not need to be inlined
      stack = [top.value];
      prefix = ['(', stack];
      usedLiteral = true;
    } else {
      // Get or create the current stack name for use by the inline
      createdStack = true;
      let name = this.incrStack();

      prefix = ['((', this.push(name), ' = ', top, ')'];
      stack = this.topStack();
    }

    let item = callback.call(this, stack);

    if (!usedLiteral) {
      this.popStack();
    }
    if (createdStack) {
      this.stackSlot--;
    }
    this.push(prefix.concat(item, ')'));
  }

  incrStack() {
    this.stackSlot++;
    if (this.stackSlot > this.stackVars.length) {
      this.stackVars.push('stack' + this.stackSlot);
    }
    return this.topStackName();
  }

  topStackName() {
    return 'stack' + this.stackSlot;
  }

  flushInline() {
    let inlineStack = this.inlineStack;
    this.inlineStack = [];
    for (let i = 0, len = inlineStack.length; i < len; i++) {
      let entry = inlineStack[i];
      if (entry instanceof Literal) {
        this.compileStack.push(entry);
      } else {
        let stack = this.incrStack();
        this.pushSource([stack, ' = ', entry, ';']);
        this.compileStack.push(stack);
      }
    }
  }

  isInline() {
    return this.inlineStack.length;
  }

  popStack(wrapped) {
    let inline = this.isInline(),
      item = (inline ? this.inlineStack : this.compileStack).pop();

    if (!wrapped && item instanceof Literal) {
      return item.value;
    } 
      if (!inline) {
        if (!this.stackSlot) {
          throw new Exception('Invalid stack pop');
        }
        this.stackSlot--;
      }
      return item;
    
  }

  topStack() {
    let stack = this.isInline() ? this.inlineStack : this.compileStack,
      item = stack[stack.length - 1];

    if (item instanceof Literal) {
      return item.value;
    } 
      return item;
    
  }

  contextName(context) {
    if (this.useDepths && context) {
      return 'depths[' + context + ']';
    } 
      return 'depth' + context;
    
  }

  quotedString(str) {
    return this.source.quotedString(str);
  }

  objectLiteral(obj) {
    return this.source.objectLiteral(obj);
  }

  aliasable(name) {
    let ret = this.aliases[name];
    if (ret) {
      ret.referenceCount++;
      return ret;
    }

    ret = this.aliases[name] = this.source.wrap(name);
    ret.aliasable = true;
    ret.referenceCount = 1;

    return ret;
  }

  setupHelper(paramSize, name, blockHelper) {
    let params = [],
      paramsInit = this.setupHelperArgs(name, paramSize, params, blockHelper);
    let foundHelper = this.nameLookup('helpers', name, 'helper'),
      callContext = this.aliasable(
        `${this.contextName(0)} != null ? ${this.contextName(
          0
        )} : (container.nullContext || {})`
      );

    return {
      params: params,
      paramsInit: paramsInit,
      name: foundHelper,
      callParams: [callContext].concat(params)
    };
  }

  setupParams(helper, paramSize, params) {
    let options = {},
      contexts = [],
      types = [],
      ids = [],
      objectArgs = !params,
      param;

    if (objectArgs) {
      params = [];
    }

    options.name = this.quotedString(helper);
    options.hash = this.popStack();

    if (this.trackIds) {
      options.hashIds = this.popStack();
    }
    if (this.stringParams) {
      options.hashTypes = this.popStack();
      options.hashContexts = this.popStack();
    }

    let inverse = this.popStack(),
      program = this.popStack();

    // Avoid setting fn and inverse if neither are set. This allows
    // helpers to do a check for `if (options.fn)`
    if (program || inverse) {
      options.fn = program || 'container.noop';
      options.inverse = inverse || 'container.noop';
    }

    // The parameters go on to the stack in order (making sure that they are evaluated in order)
    // so we need to pop them off the stack in reverse order
    let i = paramSize;
    while (i--) {
      param = this.popStack();
      params[i] = param;

      if (this.trackIds) {
        ids[i] = this.popStack();
      }
      if (this.stringParams) {
        types[i] = this.popStack();
        contexts[i] = this.popStack();
      }
    }

    if (objectArgs) {
      options.args = this.source.generateArray(params);
    }

    if (this.trackIds) {
      options.ids = this.source.generateArray(ids);
    }
    if (this.stringParams) {
      options.types = this.source.generateArray(types);
      options.contexts = this.source.generateArray(contexts);
    }

    if (this.options.data) {
      options.data = 'data';
      options.partialName = 'data && data.partialName';
    }
    if (this.useBlockParams) {
      options.blockParams = 'blockParams';
    }
    return options;
  }

  setupHelperArgs(helper, paramSize, params, useRegister) {
    let options = this.setupParams(helper, paramSize, params);
    options.loc = serializeLocation(this.source.currentLocation);
    options = this.objectLiteral(options);
    if (useRegister) {
      this.useRegister('options');
      params.push('options');
      return ['options=', options];
    } else if (params) {
      params.push(options);
      return '';
    } 
      return options;
    
  }
}

function strictLookup(requireTerminal, compiler, parts, i, type) {
  let stack = compiler.popStack(),
    len = parts.length;
  if (requireTerminal) {
    len--;
  }

  for (; i < len; i++) {
    stack = compiler.nameLookup(stack, parts[i], type);
  }

  if (requireTerminal) {
    return [
      compiler.aliasable('container.strict'),
      '(',
      stack,
      ', ',
      compiler.quotedString(parts[i]),
      ', ',
      serializeLocation(compiler.source.currentLocation),
      ' )'
    ];
  } 
    return stack;
  
}

function serializeLocation(location) {
  return location ? JSON.stringify(location) : 'undefined';
}

export default JavaScriptCompiler;
