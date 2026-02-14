import globals from 'globals';

export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: Object.assign( {}, globals.node, {
        describe: 'readonly',
        beforeEach: 'readonly',
        it: 'readonly'
      } )
    },
    rules: {
      'brace-style': [1, '1tbs'],
      'curly': [0, 'multi'],
      'eqeqeq': [1, 'smart'],
      'max-depth': [1, 4],
      'max-params': [1, 5],
      'new-cap': 2,
      'new-parens': 0,
      'no-constant-condition': 0,
      'no-div-regex': 1,
      'no-else-return': 1,
      'no-extra-parens': 1,
      'no-floating-decimal': 2,
      'no-inner-declarations': 2,
      'no-lonely-if': 1,
      'no-multi-str': 0,
      'no-nested-ternary': 2,
      'no-new-object': 0,
      'no-new-func': 0,
      'no-shadow': 0,
      'no-underscore-dangle': 0,
      'no-unused-vars': 2,
      'quotes': [2, 'single', 'avoid-escape'],
      'radix': 2,
      'keyword-spacing': 'error',
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never'],
      'strict': [2, 'never'],
      'wrap-iife': 2
    }
  }
];
