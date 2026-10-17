// AST of the shared expression DSL (specs/12 §2.3 qty_expr + specs/13 §f.2 rule conditions).
export type Node =
  | { type: 'num'; value: string }
  | { type: 'str'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'null' }
  | { type: 'ident'; name: string }
  | { type: 'member'; object: Node; property: string }
  | { type: 'call'; callee: string; args: Node[] }
  | { type: 'list'; items: Node[] }
  | { type: 'unary'; op: '-' | 'not'; arg: Node }
  | { type: 'binary'; op: BinaryOp; left: Node; right: Node }
  | { type: 'in'; left: Node; right: Node; negated: boolean }
  | { type: 'isnull'; arg: Node; negated: boolean };

export type BinaryOp = '+' | '-' | '*' | '/' | '==' | '!=' | '<' | '<=' | '>' | '>=' | 'and' | 'or';
