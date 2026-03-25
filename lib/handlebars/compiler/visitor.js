import Exception from '#handlebars/exception';

/**
 * Visits a mustache-like node with a path, params, and hash.
 *
 * @this {Visitor}
 * @param {{ path?: object, params: object[], hash?: object }} mustache
 * @returns {void}
 */
function visitSubExpression(mustache) {
  this.acceptRequired(mustache, 'path');
  this.acceptArray(mustache.params);
  this.acceptKey(mustache, 'hash');
}

/**
 * Visits a block-like node including its nested programs.
 *
 * @this {Visitor}
 * @param {{ program?: object, inverse?: object }} block
 * @returns {void}
 */
function visitBlock(block) {
  visitSubExpression.call(this, block);
  this.acceptKey(block, 'program');
  this.acceptKey(block, 'inverse');
}

/**
 * Visits a partial-like node.
 *
 * @this {Visitor}
 * @param {{ name?: object, params: object[], hash?: object }} partial
 * @returns {void}
 */
function visitPartial(partial) {
  this.acceptRequired(partial, 'name');
  this.acceptArray(partial.params);
  this.acceptKey(partial, 'hash');
}

/**
 * Generic AST visitor used by the compiler and whitespace-control passes.
 */
export default class Visitor {
  parents = [];
  mutating = false;

  /**
   * Visits a named child property and writes back mutations when enabled.
   *
   * @param {Record<string, unknown>} node
   * @param {string | number} name
   * @returns {void}
   */
  acceptKey(node, name) {
    const value = this.accept(node[name]);
    if (this.mutating) {
      if (value && !(value.type in Visitor.prototype)) {
        throw new Exception(
          `Unexpected node type "${value.type}" found when accepting ${name} on ${node.type}`
        );
      }
      node[name] = value;
    }
  }

  /**
   * Visits a required child property and throws when it is missing.
   *
   * @param {Record<string, unknown>} node
   * @param {string | number} name
   * @returns {void}
   */
  acceptRequired(node, name) {
    this.acceptKey(node, name);

    if (!node[name]) {
      throw new Exception(`${node.type} requires ${name}`);
    }
  }

  /**
   * Visits every entry in an array, removing falsy results in mutating mode.
   *
   * @param {unknown[]} array
   * @returns {void}
   */
  acceptArray(array) {
    for (let i = 0; i < array.length; i++) {
      this.acceptKey(array, i);

      if (!array[i]) {
        array.splice(i, 1);
        i--;
      }
    }
  }

  /**
   * Dispatches a node to the matching visitor handler.
   *
   * @param {{ type?: string }} object
   * @returns {unknown}
   */
  accept(object) {
    if (!object) {
      return;
    }

    if (!this[object.type]) {
      throw new Exception(`Unknown type: ${object.type}`, object);
    }

    if (this.current) {
      this.parents.unshift(this.current);
    }

    this.current = object;
    const result = this[object.type](object);
    this.current = this.parents.shift();

    if (!this.mutating || result) {
      return result;
    }

    if (result !== false) {
      return object;
    }
  }

  /**
   * Visits a `Program` node.
   *
   * @param {{ body: unknown[] }} program
   * @returns {void}
   */
  Program(program) {
    this.acceptArray(program.body);
  }

  MustacheStatement = visitSubExpression;
  Decorator = visitSubExpression;
  BlockStatement = visitBlock;
  DecoratorBlock = visitBlock;
  PartialStatement = visitPartial;
  SubExpression = visitSubExpression;

  /**
   * Visits a partial block node and its nested program.
   *
   * @param {object} partial
   * @returns {void}
   */
  PartialBlockStatement(partial) {
    visitPartial.call(this, partial);
    this.acceptKey(partial, 'program');
  }

  ContentStatement() {}
  CommentStatement() {}
  PathExpression() {}
  StringLiteral() {}
  NumberLiteral() {}
  BooleanLiteral() {}
  UndefinedLiteral() {}
  NullLiteral() {}

  /**
   * Visits a hash node.
   *
   * @param {{ pairs: unknown[] }} hash
   * @returns {void}
   */
  Hash(hash) {
    this.acceptArray(hash.pairs);
  }

  /**
   * Visits a hash pair node.
   *
   * @param {object} pair
   * @returns {void}
   */
  HashPair(pair) {
    this.acceptRequired(pair, 'value');
  }
}
