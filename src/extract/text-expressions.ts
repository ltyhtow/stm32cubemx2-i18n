/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import ts from 'typescript';

/** 只有确定含字符串操作数的加法才按拼接读取，其余表达式作为一个未知值。 */
function isStringExpression(expression: ts.Expression, depth = 0): boolean {
  if (depth > 12) return false;
  const next = (node: ts.Expression) => isStringExpression(node, depth + 1);
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression) || ts.isTemplateExpression(expression)) return true;
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) return next(expression.expression);
  if (ts.isConditionalExpression(expression)) return next(expression.whenTrue) && next(expression.whenFalse);
  return ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken &&
    (next(expression.left) || next(expression.right));
}

/** 只读 AST 中的字面量与分支，未知值记为 {}。结果是审查线索，不执行表达式。 */
export function textShapes(expression: ts.Expression, depth = 0): string[] {
  if (depth > 12) return ['{}'];
  const next = (node: ts.Expression) => textShapes(node, depth + 1);
  const join = (left: string[], right: string[]) => {
    if (left.length * right.length > 32) return ['{}'];
    return [...new Set(left.flatMap(a => right.map(b => a + b)))];
  };
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return [expression.text];
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) return next(expression.expression);
  if (ts.isConditionalExpression(expression)) {
    const shapes = [...new Set([...next(expression.whenTrue), ...next(expression.whenFalse)])];
    return shapes.length <= 32 ? shapes : ['{}'];
  }
  if (ts.isTemplateExpression(expression)) {
    let shapes = [expression.head.text];
    for (const span of expression.templateSpans) shapes = join(shapes, next(span.expression)).map(shape => shape + span.literal.text);
    return shapes;
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken && isStringExpression(expression)) {
    return join(next(expression.left), next(expression.right));
  }
  return ['{}'];
}

/** 返回显示表达式中的模板/拼接部分，跳过函数调用、判断条件和其它代码。 */
export function composedExpressions(expression: ts.Expression): ts.Expression[] {
  if (ts.isTemplateExpression(expression)) return [expression];
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) return composedExpressions(expression.expression);
  if (ts.isConditionalExpression(expression)) return [...composedExpressions(expression.whenTrue), ...composedExpressions(expression.whenFalse)];
  if (ts.isBinaryExpression(expression)) {
    if (expression.operatorToken.kind === ts.SyntaxKind.PlusToken) return [expression];
    if ([ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(expression.operatorToken.kind)) {
      return [...composedExpressions(expression.left), ...composedExpressions(expression.right)];
    }
  }
  return [];
}
