/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {

  // parse 过程：将 html 转换为 ast 树
  // 每个节点的 ast 树都设置了元素的所有信息：标签信息、属性信息、插槽信息、父节点、子节点等
  const ast = parse(template.trim(), options)

  // optimize：遍历 ast，当遇到静态节点打上静态节点标记，然后进一步标记出静态根节点
  // 这样在后续更新进行 dom diff 比对的时候就可以跳过这些静态节点
  // 标记静态根节点：在生成渲染函数阶段，生成静态根节点的渲染函数
  if (options.optimize !== false) {
    optimize(ast, options)
  }

  // generate: 将 ast 生成 render 代码串、staticRenderFns 静态根节点代码串
  // 比如：
  //  <div id="app">
  //    <div>{{msg}}</div>
  //    <div>
  //      <p>静态节点</p>
  //    </div>
  //  </div>
  // 经过编译后的 code 是：
  //   code = {
  //     render: 'with(this){return _c('div',{attrs:{\"id\":\"app\"}},[_c('div',[_v(_s(msg))]),_v(\" \"),_m(0)])}',
  //     staticRenderFns: ['with(this){return _c('div',[_c('p',[_v(\"静态节点\")])])}']
  //   }
  const code = generate(ast, options)

  // 将 ast、render 代码串、staticRenderFns 静态根节点代码串
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
