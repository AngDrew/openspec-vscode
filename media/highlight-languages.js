// Syntax Highlighter for OpenSpec Chat
// Includes TypeScript, JavaScript, and JSON languages

(function() {
  'use strict';

  // Check if highlight.js is loaded
  if (typeof hljs === 'undefined') {
    console.error('highlight.js not loaded');
    return;
  }

  // JavaScript language definition (simplified for bundle)
  const javascript = function(hljs) {
    const IDENT_RE = '[A-Za-z$_][0-9A-Za-z$_]*';
    const KEYWORDS = [
      "as", // for exports
      "in",
      "of",
      "if",
      "for",
      "while",
      "finally",
      "var",
      "new",
      "function",
      "do",
      "return",
      "void",
      "else",
      "break",
      "catch",
      "instanceof",
      "with",
      "throw",
      "case",
      "default",
      "try",
      "switch",
      "continue",
      "typeof",
      "delete",
      "let",
      "yield",
      "const",
      "class",
      // JS handles these with a special rule
      // "get",
      // "set",
      "debugger",
      "async",
      "await",
      "static",
      "import",
      "from",
      "export",
      "extends"
    ];
    const LITERALS = [
      "true",
      "false",
      "null",
      "undefined",
      "NaN",
      "Infinity"
    ];

    const TYPES = [
      "Intl",
      "DataView",
      "Number",
      "Math",
      "Date",
      "String",
      "RegExp",
      "Object",
      "Function",
      "Boolean",
      "Error",
      "Symbol",
      "Set",
      "Map",
      "WeakSet",
      "WeakMap",
      "Proxy",
      "Reflect",
      "JSON",
      "Promise",
      "Float64Array",
      "Int16Array",
      "Int32Array",
      "Int8Array",
      "Uint16Array",
      "Uint32Array",
      "Float32Array",
      "Array",
      "Uint8Array",
      "Uint8ClampedArray",
      "ArrayBuffer",
      "BigInt64Array",
      "BigUint64Array",
      "BigInt"
    ];

    const ERROR_TYPES = [
      "EvalError",
      "InternalError",
      "RangeError",
      "ReferenceError",
      "SyntaxError",
      "TypeError",
      "URIError"
    ];

    const BUILT_IN_GLOBALS = [
      "setInterval",
      "setTimeout",
      "clearInterval",
      "clearTimeout",
      "require",
      "exports",
      "eval",
      "isFinite",
      "isNaN",
      "parseFloat",
      "parseInt",
      "decodeURI",
      "decodeURIComponent",
      "encodeURI",
      "encodeURIComponent",
      "escape",
      "unescape"
    ];

    const BUILT_IN_VARIABLES = [
      "arguments",
      "this",
      "super",
      "console",
      "window",
      "document",
      "localStorage",
      "sessionStorage",
      "module",
      "global"
    ];

    const BUILT_INS = [].concat(
      BUILT_IN_GLOBALS,
      TYPES,
      ERROR_TYPES
    );

    return {
      name: 'javascript',
      aliases: ['js', 'jsx', 'mjs', 'cjs'],
      keywords: {
        keyword: KEYWORDS,
        literal: LITERALS,
        built_in: BUILT_INS,
        "variable.language": BUILT_IN_VARIABLES
      },
      illegal: /#(?![$_A-z])/,
      contains: [
        hljs.COMMENT(
          '/\\*\\*',
          '\\*/',
          {
            relevance: 0,
            contains: [
              {
                begin: /\w+@/,
                relevance: 0
              },
              {
                className: 'doctag',
                begin: '@[A-Za-z_]+'
              }
            ]
          }
        ),
        hljs.C_COMMENT,
        hljs.C_BLOCK_COMMENT_MODE,
        hljs.APOS_STRING_MODE,
        hljs.QUOTE_STRING_MODE,
        hljs.BACKSLASH_ESCAPE,
        hljs.REGEXP_MODE,
        {
          begin: /`/, end: /`/,
          contains: [
            hljs.BACKSLASH_ESCAPE,
            {
              begin: /\$\{/,
              end: /\}/,
              contains: [
                'self'
              ]
            }
          ]
        },
        {
          begin: /\(/,
          end: /\)/,
          keywords: KEYWORDS,
          contains: ['self'].concat(hljs.REGEXP_MODE.contains)
        },
        {
          begin: /\[/,
          end: /\]/,
          keywords: KEYWORDS,
          contains: ['self'].concat(hljs.REGEXP_MODE.contains)
        },
        {
          begin: /\{/,
          end: /\}/,
          keywords: KEYWORDS,
          contains: ['self'].concat(hljs.REGEXP_MODE.contains)
        },
        {
          begin: /\d+\b/,
          relevance: 0
        },
        {
          begin: '\\.' + IDENT_RE,
          relevance: 0
        }
      ]
    };
  };

  // TypeScript language definition
  const typescript = function(hljs) {
    const IDENT_RE = '[A-Za-z$_][0-9A-Za-z$_]*';
    const KEYWORDS = [
      "any",
      "boolean",
      "number",
      "object",
      "string",
      "symbol",
      "unknown",
      "bigint",
      "abstract",
      "as",
      "asserts",
      "assert",
      "constructor",
      "declare",
      "enum",
      "from",
      "get",
      "global",
      "infer",
      "implements",
      "interface",
      "intrinsic",
      "is",
      "keyof",
      "module",
      "namespace",
      "of",
      "override",
      "private",
      "protected",
      "public",
      "readonly",
      "require",
      "satisfies",
      "set",
      "static",
      "type",
      "unique",
      "using"
    ];

    const TYPES = [
      "Array",
      "Function",
      "Promise",
      "any",
      "boolean",
      "never",
      "number",
      "string",
      "symbol",
      "bigint",
      "unknown",
      "void",
      "object"
    ];

    return {
      name: 'typescript',
      aliases: ['ts', 'tsx', 'mts', 'cts'],
      keywords: {
        keyword: KEYWORDS,
        type: TYPES
      },
      contains: [
        hljs.COMMENT(
          '/\\*\\*',
          '\\*/',
          {
            relevance: 0,
            contains: [
              {
                begin: /\w+@/,
                relevance: 0
              },
              {
                className: 'doctag',
                begin: '@[A-Za-z_]+'
              }
            ]
          }
        ),
        hljs.C_COMMENT,
        hljs.C_BLOCK_COMMENT_MODE,
        hljs.APOS_STRING_MODE,
        hljs.QUOTE_STRING_MODE,
        hljs.BACKSLASH_ESCAPE,
        hljs.REGEXP_MODE,
        {
          begin: /`/, end: /`/,
          contains: [
            hljs.BACKSLASH_ESCAPE,
            {
              begin: /\$\{/,
              end: /\}/,
              contains: [
                'self'
              ]
            }
          ]
        },
        {
          begin: /\(/,
          end: /\)/,
          keywords: KEYWORDS,
          contains: ['self'].concat(hljs.REGEXP_MODE.contains)
        },
        {
          begin: /\[/,
          end: /\]/,
          keywords: KEYWORDS,
          contains: ['self'].concat(hljs.REGEXP_MODE.contains)
        },
        {
          begin: /\{/,
          end: /\}/,
          keywords: KEYWORDS,
          contains: ['self'].concat(hljs.REGEXP_MODE.contains)
        },
        {
          begin: /\d+\b/,
          relevance: 0
        },
        {
          begin: '\\.' + IDENT_RE,
          relevance: 0
        },
        {
          className: 'type',
          begin: IDENT_RE + '\\s*:',
          relevance: 0
        },
        {
          className: 'type',
          begin: ':\s*' + IDENT_RE,
          relevance: 0
        },
        {
          className: 'type',
          begin: '<',
          end: '>',
          contains: [
            'self'
          ]
        }
      ]
    };
  };

  // JSON language definition
  const json = function(hljs) {
    const LITERALS = ["true", "false", "null"];
    const LITERALS_MODE = {
      scope: "literal",
      beginKeywords: LITERALS.join(" ")
    };

    return {
      name: "JSON",
      keywords: {
        literal: LITERALS
      },
      contains: [
        {
          className: "attr",
          begin: /"(?:\\.|[^\\"\r\n])*"(?=\s*:)/,
          relevance: 1.01
        },
        {
          match: /[{}[\],:]/,
          className: "punctuation",
          relevance: 0
        },
        hljs.QUOTE_STRING_MODE,
        LITERALS_MODE,
        hljs.C_NUMBER_MODE,
        hljs.C_LINE_COMMENT_MODE,
        hljs.C_BLOCK_COMMENT_MODE
      ],
      illegal: /\S/
    };
  };

  // Register languages
  hljs.registerLanguage('javascript', javascript);
  hljs.registerLanguage('typescript', typescript);
  hljs.registerLanguage('json', json);

  // Also register common aliases
  hljs.registerLanguage('js', javascript);
  hljs.registerLanguage('ts', typescript);

  console.log('OpenSpec Chat: Syntax highlighting languages registered');
})();
