/* @flow */

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'

let isStaticKey
let isPlatformReservedTag

const genStaticKeysCached = cached(genStaticKeys)

/**
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 *
 * Once we detect these sub-trees, we can:
 *
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 * 2. Completely skip them in the patching process.
 */
export function optimize (root: ?ASTElement, options: CompilerOptions) {
  // 不存在 ast，直接退出
  if (!root) return

  isStaticKey = genStaticKeysCached(options.staticKeys || '')

  // 是否是平台保留标签
  isPlatformReservedTag = options.isReservedTag || no

  // 第一步：递归所有节点，为节点添加 static 属性
  // static=flase 代表动态节点； static=true 代表静态节点
  markStatic(root)

  // 第二步：标记静态根，一个节点要成为静态根节点需要的条件：
  //  节点本身是静态节点，并且有子节点，并且子节点不是文本节点，则标记为静态根
  //   例子：<div>hello</div>，这种就不符合 子节点不是文本节点 的条件，div 不会被标记为静态根
  //   例子：<div><p>hello</p></div> 这种符合，标记 div 为静态根
  markStaticRoots(root, false)
}

function genStaticKeys (keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' +
    (keys ? ',' + keys : '')
  )
}

/**
 * 递归 ast，为所有节点添加 static 属性，static=false 代表动态节点，static=true 代表静态节点
 *  如果有子节点为动态节点，父节点也会被改为动态节点
 * @param {*} node 
 * @returns 
 */
function markStatic (node: ASTNode) {
  // 通过 node.static 来标识节点是否为 静态节点
  // isStatic 函数返回 boolean
  node.static = isStatic(node)

  // node 的 type=1 说明是 元素节点
  if (node.type === 1) {

    // 不要将组件的插槽内容设置为静态节点，这样可以避免：
    //  1、组件不能改变插槽节点
    //  2、静态插槽内容在热重载时失败
    if (
      !isPlatformReservedTag(node.tag) &&
      node.tag !== 'slot' &&
      node.attrsMap['inline-template'] == null
    ) {
      // 不是平台保留标签(div、p 这些是浏览器平台标签)、不是 slot 插槽标签、不是内联模板 uinline-template
      // 结束递归
      return
    }

    // 遍历子节点，递归调用 markStatic 标记子节点的 static 属性
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      markStatic(child)

      // 如果字节点是非静态节点，那么父节点更改为非静态节点
      if (!child.static) {
        node.static = false
      }
    }

    // 如果节点存在 v-if、v-else-if、v-else 这些指令
    // 则标记 node.ifConditions 中 block 中节点的 static=false
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}

/**
 * 标记静态根节点，静态根节点的条件：
 *   节点本身是静态节点，并且有子节点，并且子节点不是文本节点，则标记为静态根
 *   其实还有隐藏条件：子节点必须是静态节点，但是在上面标记静态节点的时候
 *   如果字节点存在动态节点，当前节点会被更新为动态节点
 *     例子：<div>hello</div>，这种就不符合 子节点不是文本节点 的条件，div 不会被标记为静态根
 *     例子：<div><p>hello</p></div> 这种符合，标记 div 为静态根
 * @param {*} node ast
 * @param {*} isInFor 当前节点是否被包裹在 v-for 指令所在的节点内
 * @returns 
 */
function markStaticRoots (node: ASTNode, isInFor: boolean) {
  // 如果是元素节点
  if (node.type === 1) {
    if (node.static || node.once) {
      // 节点是静态的 或者 节点上有 v-once 指令，标记 node.staticInFor = true or false
      node.staticInFor = isInFor
    }

    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.
    // 节点本身是静态节点，并且有子节点，并且子节点不是文本节点，则标记为静态根
    //  例子：<div>hello</div>，这种就不符合 '子节点不是文本节点' 的条件，div 不会被标记为静态根
    //  例子：<div><p>hello</p></div> 这种符合，标记 div 为静态根
    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) {
      // 标记为静态根
      node.staticRoot = true
      // 退出当前函数
      return
    } else {
      node.staticRoot = false
    }

    // 当前节点不是静态根是，递归子节点，查找子节点是否有符合静态根条件的节点
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }

    // 如果节点存在 v-if、v-else-if、v-else 指令，则为 block 节点标记静态根
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

/**
 * 判断节点是否为静态节点：
 *  通过 node.type 来判断，type=2: 表达式{{msg}}，那么为动态；type=3: 纯文本，静态
 *  凡是有 v-bind、v-if、v-for 等指令的都属于动态节点
 *  组件为动态节点
 *  父节点为含有 v-for 指令的 template 标签，则为动态节点
 * @param {*} node 
 * @returns boolean
 */
function isStatic (node: ASTNode): boolean {
  // 如果是表达式，返回 false，代表是动态节点
  // 例如 {{ msg }}
  if (node.type === 2) { // expression
    return false
  }

  // 如果是文本节点，返回 true，代表是静态节点
  // 例如：hello world
  if (node.type === 3) { // text
    return true
  }
  return !!(node.pre || (
    !node.hasBindings && // no dynamic bindings
    !node.if && !node.for && // not v-if or v-for or v-else
    !isBuiltInTag(node.tag) && // not a built-in
    isPlatformReservedTag(node.tag) && // not a component
    !isDirectChildOfTemplateFor(node) &&
    Object.keys(node).every(isStaticKey)
  ))
}

function isDirectChildOfTemplateFor (node: ASTElement): boolean {
  while (node.parent) {
    node = node.parent
    if (node.tag !== 'template') {
      return false
    }
    if (node.for) {
      return true
    }
  }
  return false
}
