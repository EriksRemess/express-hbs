import Exception from '#handlebars/exception';

function visitSubExpression(mustache) {
  this.acceptRequired(mustache, 'path');
  this.acceptArray(mustache.params);
  this.acceptKey(mustache, 'hash');
}

function visitBlock(block) {
  visitSubExpression.call(this, block);
  this.acceptKey(block, 'program');
  this.acceptKey(block, 'inverse');
}

function visitPartial(partial) {
  this.acceptRequired(partial, 'name');
  this.acceptArray(partial.params);
  this.acceptKey(partial, 'hash');
}

export default class Visitor {
  parents = [];
  mutating = false;

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

  acceptRequired(node, name) {
    this.acceptKey(node, name);

    if (!node[name]) {
      throw new Exception(`${node.type} requires ${name}`);
    }
  }

  acceptArray(array) {
    for (let i = 0; i < array.length; i++) {
      this.acceptKey(array, i);

      if (!array[i]) {
        array.splice(i, 1);
        i--;
      }
    }
  }

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

  Program(program) {
    this.acceptArray(program.body);
  }

  MustacheStatement = visitSubExpression;
  Decorator = visitSubExpression;
  BlockStatement = visitBlock;
  DecoratorBlock = visitBlock;
  PartialStatement = visitPartial;
  SubExpression = visitSubExpression;

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

  Hash(hash) {
    this.acceptArray(hash.pairs);
  }

  HashPair(pair) {
    this.acceptRequired(pair, 'value');
  }
}
