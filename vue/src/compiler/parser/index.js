/* @flow */

import he from 'he'
import { parseHTML } from './html-parser'
import { parseText } from './text-parser'
import { parseFilters } from './filter-parser'
import { genAssignmentCode } from '../directives/model'
import { extend, cached, no, camelize, hyphenate } from 'shared/util'
import { isIE, isEdge, isServerRendering } from 'core/util/env'

import {
  addProp,
  addAttr,
  baseWarn,
  addHandler,
  addDirective,
  getBindingAttr,
  getAndRemoveAttr,
  getRawBindingAttr,
  pluckModuleFunction,
  getAndRemoveAttrByRegex
} from '../helpers'

export const onRE = /^@|^v-on:/
export const dirRE = process.env.VBIND_PROP_SHORTHAND
  ? /^v-|^@|^:|^\.|^#/
  : /^v-|^@|^:|^#/
export const forAliasRE = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/
const stripParensRE = /^\(|\)$/g
const dynamicArgRE = /^\[.*\]$/

const argRE = /:(.*)$/
export const bindRE = /^:|^\.|^v-bind:/
const propBindRE = /^\./
const modifierRE = /\.[^.\]]+(?=[^\]]*$)/g

const slotRE = /^v-slot(:|$)|^#/

const lineBreakRE = /[\r\n]/
const whitespaceRE = /\s+/g

const invalidAttributeRE = /[\s"'<>\/=]/

const decodeHTMLCached = cached(he.decode)

export const emptySlotScopeToken = `_empty_`

// configurable state
export let warn: any
let delimiters
let transforms
let preTransforms
let postTransforms
let platformIsPreTag
let platformMustUseProp
let platformGetTagNamespace
let maybeComponent

/**
 * 为指定标签元素创建 ast 对象
 * @param {*} tag 元素标签
 * @param {*} attrs // attrs 属性数组，[{ name: 'id', value: 'app', start, end }, ...]
 * @param {*} parent 父元素 ast
 * @returns 
 */
export function createASTElement (
  tag: string,
  attrs: Array<ASTAttr>,
  parent: ASTElement | void
): ASTElement {
  return {
    type: 1, // 节点类型
    tag, // 标签名
    attrsList: attrs, // 标签属性数组 [{ name: 'id', value: 'app', start, end }, ...]
    attrsMap: makeAttrsMap(attrs), // 将属性数组转换为属性对象形式，{ id: 'app' }
    rawAttrsMap: {}, // 原始属性对象
    parent, // 父元素 ast
    children: [] // 子元素数组
  }
}

/**
 * 将 template 字符串模板转换为 ast
 * @param {*} template template 字符串模板
 * @param {*} options 编译配置
 * @returns 
 */
export function parse (template: string, options: CompilerOptions): ASTElement | void {
  warn = options.warn || baseWarn

  // 是否 pre 标签（no 是一个直接返回 false 的函数）
  platformIsPreTag = options.isPreTag || no
  // 是否必须要使用 props 进行绑定的属性
  platformMustUseProp = options.mustUseProp || no
  // 获取命名空间
  platformGetTagNamespace = options.getTagNamespace || no
  // 是否是保留标签（html + svg）
  const isReservedTag = options.isReservedTag || no
  // 是否是组件
  maybeComponent = (el: ASTElement) => !!el.component || !isReservedTag(el.tag)

  // 负责处理元素节点上的 class、style、v-model
  transforms = pluckModuleFunction(options.modules, 'transformNode')
  preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
  postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')
  delimiters = options.delimiters

  const stack = []
  const preserveWhitespace = options.preserveWhitespace !== false
  const whitespaceOption = options.whitespace
  // 根节点，处理后的节点都会按照层级挂载到 root 下，最后将 root 返回
  let root
  // 当前元素的父元素
  let currentParent
  let inVPre = false
  let inPre = false
  let warned = false

  function warnOnce (msg, range) {
    if (!warned) {
      warned = true
      warn(msg, range)
    }
  }

  //  如果元素没有被处理过，调用 processElement 方法处理节点上的众多属性
  //  让自己与父元素联系，将自己放到父元素的 children 数组中，并设置自己的 parent 属性为 currentParent
  //  设置自己的子元素，将自己所有非插槽的子元素放到自己的 children 数组中
  function closeElement (element) {
    trimEndingWhitespace(element)
    // 当前元素不在 pre 节点内，并且没有被处理过
    if (!inVPre && !element.processed) {
      // 分别调用不同方法处理元素节点的 key、ref、插槽、自闭合的 slot 标签、动态组件、class、style、v-bind、v-on、其它指令和一些原生属性
      element = processElement(element, options)
    }

    // tree management
    // 处理根节点上有 v-if、v-else-if、v-else 的情况
    // 如果根节点有 v-if，那么必须要有一个具有 v-else-if、v-else 的同级节点，防止根元素不存在
    if (!stack.length && element !== root) {
      // allow root elements with v-if, v-else-if and v-else
      if (root.if && (element.elseif || element.else)) {
        if (process.env.NODE_ENV !== 'production') {
          checkRootConstraints(element)
        }
        addIfCondition(root, {
          exp: element.elseif,
          block: element
        })
      } else if (process.env.NODE_ENV !== 'production') {
        warnOnce(
          `Component template should contain exactly one root element. ` +
          `If you are using v-if on multiple elements, ` +
          `use v-else-if to chain them instead.`,
          { start: element.start }
        )
      }
    }

    // 让自己与父元素联系
    // 将自己放到父元素的 children 数组中，然后设置自己的 parent 属性为 currentParent
    if (currentParent && !element.forbidden) {
      if (element.elseif || element.else) {
        processIfConditions(element, currentParent)
      } else {
        if (element.slotScope) {
          // scoped slot
          // keep it in the children list so that v-else(-if) conditions can
          // find it as the prev node.
          const name = element.slotTarget || '"default"'
          ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element
        }
        currentParent.children.push(element)
        element.parent = currentParent
      }
    }

    // final children cleanup
    // filter out scoped slots
    // 设置自己的子元素
    // 将自己的所有非插槽的子元素设置到 element.children 数组中
    element.children = element.children.filter(c => !(c: any).slotScope)
    // remove trailing whitespace node again
    trimEndingWhitespace(element)

    // check pre state
    if (element.pre) {
      inVPre = false
    }
    if (platformIsPreTag(element.tag)) {
      inPre = false
    }

    // apply post-transforms
    for (let i = 0; i < postTransforms.length; i++) {
      postTransforms[i](element, options)
    }
  }

  function trimEndingWhitespace (el) {
    // remove trailing whitespace node
    if (!inPre) {
      let lastNode
      while (
        (lastNode = el.children[el.children.length - 1]) &&
        lastNode.type === 3 &&
        lastNode.text === ' '
      ) {
        el.children.pop()
      }
    }
  }

  function checkRootConstraints (el) {
    if (el.tag === 'slot' || el.tag === 'template') {
      warnOnce(
        `Cannot use <${el.tag}> as component root element because it may ` +
        'contain multiple nodes.',
        { start: el.start }
      )
    }
    if (el.attrsMap.hasOwnProperty('v-for')) {
      warnOnce(
        'Cannot use v-for on stateful component root element because ' +
        'it renders multiple elements.',
        el.rawAttrsMap['v-for']
      )
    }
  }

  // 解析所有标签，处理标签以及标签上的属性
  parseHTML(template, {
    warn,
    expectHTML: options.expectHTML,
    isUnaryTag: options.isUnaryTag,
    canBeLeftOpenTag: options.canBeLeftOpenTag,
    shouldDecodeNewlines: options.shouldDecodeNewlines,
    shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
    shouldKeepComment: options.comments,
    outputSourceRange: options.outputSourceRange,

    /**
     * 真正将开始标签转换成 ast 的方法：
     *  创建 AST 对象
     *  处理存在 v-model 指令的 input 标签，分别处理 input 的 type 为 checkbox、radio、其它的情况
     *  处理标签上的一些指令，比如 v-pre、v-for、v-if、v-once
     *  如果根节点 root 不存在则设置当前元素为根节点
     *  如果当前元素为非自闭合标签则将自己 push 到 stack 数组，并记录 currentParent，在接下来处理子元素时用来告诉子元素自己的父节点是谁
     *  如果当前元素为自闭合标签，则表示该标签要处理结束了，让自己和父元素产生关系，以及设置自己的子元素
     * @param {*} tag 标签名
     * @param {*} attrs [{ name: 'id', value: 'app', start: 5, end: 13 }, ...] 形式的属性数组
     * @param {*} unary 是否自闭合标签，类似 <hr />
     * @param {*} start 开始索引
     * @param {*} end 结束索引
     */
    start (tag, attrs, unary, start, end) {
      // check namespace.
      // inherit parent ns if there is one
      // 检查命名空间，如果存在，则继承父命名空间
      const ns = (currentParent && currentParent.ns) || platformGetTagNamespace(tag)

      // handle IE svg bug
      /* istanbul ignore if */
      if (isIE && ns === 'svg') {
        attrs = guardIESVGBug(attrs)
      }

      // 通过 createASTElement 创建当前标签的 AST 对象
      let element: ASTElement = createASTElement(tag, attrs, currentParent)

      // 如果命名空间存在，设置命名空间
      if (ns) {
        element.ns = ns
      }

      if (process.env.NODE_ENV !== 'production') {
        // 非生产模式下，在 ast 对象 element 上记录一下标签开始和结束位置 start、end
        if (options.outputSourceRange) {
          element.start = start
          element.end = end
          element.rawAttrsMap = element.attrsList.reduce((cumulated, attr) => {
            cumulated[attr.name] = attr
            return cumulated
          }, {})
        }
        attrs.forEach(attr => {
          if (invalidAttributeRE.test(attr.name)) {
            warn(
              `Invalid dynamic argument expression: attribute names cannot contain ` +
              `spaces, quotes, <, >, / or =.`,
              {
                start: attr.start + attr.name.indexOf(`[`),
                end: attr.start + attr.name.length
              }
            )
          }
        })
      }

      if (isForbiddenTag(element) && !isServerRendering()) {
        // 非服务端渲染，在 ast 对象 element 标记 forbidden 为 true
        element.forbidden = true
        process.env.NODE_ENV !== 'production' && warn(
          'Templates should only be responsible for mapping the state to the ' +
          'UI. Avoid placing tags with side-effects in your templates, such as ' +
          `<${tag}>` + ', as they will not be parsed.',
          { start: element.start }
        )
      }

      // apply pre-transforms
      /**
       * 为 element 对象分别执行 class、style、model 模块中的 preTransforms 方法
       * 在 web 平台只有 model 模块有 preTransforms
       * 用来处理存在 v-model 的 input 标签，但没处理 v-model 属性
       * 分别处理了 input 的 type 为 checkbox、radio 及 其它的情况
       */
      for (let i = 0; i < preTransforms.length; i++) {
        element = preTransforms[i](element, options) || element
      }

      // ast 对象 element 是否存在 v-pre 指令，存在则设置 inVPre = true
      if (!inVPre) {
        processPre(element)
        if (element.pre) {
          inVPre = true
        }
      }

      // 如果是 pre 标签，设置 inPre = true，注意这里与上面 v-pre 的区别，这里是 inPre，上面是 inVPre
      if (platformIsPreTag(element.tag)) {
        inPre = true
      }

      if (inVPre) {
        // 代表标签上存在 v-pre 指令
        // 这样的节点只会渲染一次，将节点上的属性都设置到 el.attrs 数组对象中，作为静态属性，数据更新时不会渲染这部分内容
        processRawAttrs(element)
      } else if (!element.processed) {
        // 处理 v-for 指令
        // 例如: <div v-for="item in list">
        // 解析后得到：element.for="list"、element.alias="item"
        processFor(element)

        // 处理 v-if、v-else-if、v-else
        // 例如，<div v-if="msg">，处理后得到 element.if="msg"
        processIf(element)

        //  处理 v-once 指令，element.once=true
        processOnce(element)
      }

      // 如果根元素不存在，那么将当前元素设置为根元素
      if (!root) {
        root = element
        if (process.env.NODE_ENV !== 'production') {
          checkRootConstraints(root)
        }
      }

      if (!unary) {
        // 不是自闭合标签，用 currentParent 记录当前标签
        // 处理下一个元素时，可以知道自己的父元素是谁
        // 因为 ast 是一个树状结构，最终子元素是要挂在父元素的 children 上的
        currentParent = element

        // 将当前元素 ast 存到 stack 数组，将来处理到当前元素的闭合标签时再拿出来
        // 注意这里的 stack 数组，在调用 options.start 方法之前也发生过一次 push 操作
        // 那个 stack 数组与这个 stack 不是同一个
        stack.push(element)
      } else {
        // 如果当前元素为自闭合标签，例如 <hr />
        //   如果元素没有被处理过，即 el.processed 为 false，则调用 processElement 方法处理节点上的众多属性
        //   让自己和父元素产生关系，将自己放到父元素的 children 数组中，并设置自己的 parent 属性为 currentParent
        //   设置自己的子元素，将自己所有非插槽的子元素放到自己的 children 数组中
        closeElement(element)
      }
    },

    /**
     * 处理结束标签
     * @param {*} tag 结束标签名
     * @param {*} start 结束标签开始位置索引
     * @param {*} end 结束标签结束位置索引
     */
    end (tag, start, end) {
      // 取出 stack 中最后一个 开始标签 ast 对象
      // 这个 开始标签 ast 对象 对应的就是当前结束元素的开始标签
      const element = stack[stack.length - 1]
      // pop stack
      stack.length -= 1
      currentParent = stack[stack.length - 1]
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        element.end = end
      }

      // 处理这个标签（包含开始结束）的 ast
      //  如果元素没有被处理过，则调用 processElement 方法处理节点上的众多属性
      //  让自己和父元素产生关系，将自己放到父元素的 children 数组中，并设置自己的 parent 属性为 currentParent
      //  设置自己的子元素，将自己所有非插槽的子元素放到自己的 children 数组中
      closeElement(element)
    },

    /**
     * 处理文本：
     *  基于文本生成 ast，并且将这个 ast 放到父元素的 children 上
     * @param {*} text // 文本内容
     * @param {*} start // 文本开始位置索引
     * @param {*} end // 文本结束位置索引
     * @returns 
     */
    chars (text: string, start: number, end: number) {
      // currentParent 不存在，代表这段文本没有父元素，报错
      if (!currentParent) {
        if (process.env.NODE_ENV !== 'production') {
          if (text === template) {
            warnOnce(
              'Component template requires a root element, rather than just text.',
              { start }
            )
          } else if ((text = text.trim())) {
            warnOnce(
              `text "${text}" outside root element will be ignored.`,
              { start }
            )
          }
        }
        return
      }

      // IE textarea placeholder bug
      /* istanbul ignore if */
      if (isIE &&
        currentParent.tag === 'textarea' &&
        currentParent.attrsMap.placeholder === text
      ) {
        return
      }

      // 获取父元素的 children
      const children = currentParent.children

      // 对 text 进行一些处理，例如 trim 删除前后空格
      if (inPre || text.trim()) {
        text = isTextTag(currentParent) ? text : decodeHTMLCached(text)
      } else if (!children.length) {
        // remove the whitespace-only node right after an opening tag
        text = ''
      } else if (whitespaceOption) {
        if (whitespaceOption === 'condense') {
          // in condense mode, remove the whitespace node if it contains
          // line break, otherwise condense to a single space
          text = lineBreakRE.test(text) ? '' : ' '
        } else {
          text = ' '
        }
      } else {
        text = preserveWhitespace ? ' ' : ''
      }

      // 经过处理后，text 还存在，将 text 转换成 AST 对象 child
      if (text) {
        if (!inPre && whitespaceOption === 'condense') {
          // condense consecutive whitespaces into single space
          text = text.replace(whitespaceRE, ' ')
        }
        let res
        let child: ?ASTNode
        if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
          child = {
            type: 2,
            expression: res.expression,
            tokens: res.tokens,
            text
          }
        } else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') {
          child = {
            type: 3,
            text
          }
        }

        // 如果 AST 对象 child 存在，将其加入到父元素的 children 中
        if (child) {
          if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
            child.start = start
            child.end = end
          }
          children.push(child)
        }
      }
    },

    // 处理注释节点
    comment (text: string, start, end) {
      // adding anyting as a sibling to the root node is forbidden
      // comments should still be allowed, but ignored
      // 禁止将任何内容作为 root 同级进行添加，注释节点除外，但是会被忽略
      // currentParent 是父元素，父元素存在，代表注释与 root 不同级
      // 父元素不存在，代表代表注释与 root 同级，忽略
      if (currentParent) {
        // 创建注释节点 ast
        const child: ASTText = {
          type: 3, // 节点类型
          text, // 注释内容
          isComment: true // isComment=true 代表是注释节点
        }
        if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
          // 记录注释节点的开始和结束位置索引
          child.start = start
          child.end = end
        }

        // 将当前注释节点 ast 放到父元素的 children 中
        currentParent.children.push(child)
      }
    }
  })

  // 将生成的 ast 对象返回
  return root
}

function processPre (el) {
  if (getAndRemoveAttr(el, 'v-pre') != null) {
    el.pre = true
  }
}

function processRawAttrs (el) {
  const list = el.attrsList
  const len = list.length
  if (len) {
    const attrs: Array<ASTAttr> = el.attrs = new Array(len)
    for (let i = 0; i < len; i++) {
      attrs[i] = {
        name: list[i].name,
        value: JSON.stringify(list[i].value)
      }
      if (list[i].start != null) {
        attrs[i].start = list[i].start
        attrs[i].end = list[i].end
      }
    }
  } else if (!el.pre) {
    // non root node in pre blocks with no attributes
    el.plain = true
  }
}

/**
 * 调用不同的函数处理元素节点的 key、ref、插槽、自闭合的 slot 标签、动态组件、class、style、v-bind、v-on、其它指令和一些原生属性
 * 如果标签上有相应属性被处理，例如标签上有 key、ref、:class 这三个属性
 * 那么处理过后，会给 ast 添加上 key、ref、bindingClass 这三个属性
 * @param {*} element ast
 * @param {*} options 
 * @returns 
 */
export function processElement (
  element: ASTElement,
  options: CompilerOptions
) {
  // 处理 key，得到 element.key = xxx
  processKey(element)

  // determine whether this is a plain element after
  // removing structural attributes
  // 确定 element 是否为一个普通元素
  element.plain = (
    !element.key &&
    !element.scopedSlots &&
    !element.attrsList.length
  )

  // 处理 ref，得到 element.ref = xxx, element.refInFor = boolean
  processRef(element)

  // 处理作为插槽传递给组件的内容
  // 得到插槽名称、是否为动态插槽、作用域插槽的值，以及插槽中的所有子元素，子元素放到插槽对象的 children 属性中
  processSlotContent(element)
  processSlotOutlet(element)

  // 处理动态组件，<component :is="compoName">，得到 element.component = compName
  // 标记是否存在内联模版，element.inlineTemplate = boolean
  processComponent(element)

  // 为 ast 对象分别执行 class、style、model 模块中的 transformNode 方法，具体在：vue\src\platforms\web\compiler\modules 下
  // 不过 web 平台只有 class、style 模块有 transformNode 方法，分别用来处理 class 属性和 style 属性
  // 得到 element.staticStyle 存放静态 style 属性的值、 element.styleBinding 存放动态 style 属性的值
  // element.staticClass 存放静态 class 属性的值、element.classBinding 存放动态 class 属性的值
  for (let i = 0; i < transforms.length; i++) {
    element = transforms[i](element, options) || element
  }

  /**
   * 处理 v-bind、v-on、其他指令（例如 v-model 归入其他指令）
   * v-bind 指令变成：el.dynamicAttrs = [{ name, value, start, end, dynamic }, ...]，
   *                或者是使用 props 的属性，变成了 el.props = [{ name, value, start, end, dynamic }, ...]
   * v-on 指令变成：el.events = { eventName: { value, start, end, dynamic },  }
   * 其它指令：el.directives = [{name, rawName, value, arg, isDynamicArg, modifier, start, end }, ...]
   */
  processAttrs(element)
  return element
}

function processKey (el) {
  const exp = getBindingAttr(el, 'key')
  if (exp) {
    if (process.env.NODE_ENV !== 'production') {
      if (el.tag === 'template') {
        warn(
          `<template> cannot be keyed. Place the key on real elements instead.`,
          getRawBindingAttr(el, 'key')
        )
      }
      if (el.for) {
        const iterator = el.iterator2 || el.iterator1
        const parent = el.parent
        if (iterator && iterator === exp && parent && parent.tag === 'transition-group') {
          warn(
            `Do not use v-for index as key on <transition-group> children, ` +
            `this is the same as not using keys.`,
            getRawBindingAttr(el, 'key'),
            true /* tip */
          )
        }
      }
    }
    el.key = exp
  }
}

function processRef (el) {
  const ref = getBindingAttr(el, 'ref')
  if (ref) {
    el.ref = ref
    el.refInFor = checkInFor(el)
  }
}

export function processFor (el: ASTElement) {
  let exp
  if ((exp = getAndRemoveAttr(el, 'v-for'))) {
    const res = parseFor(exp)
    if (res) {
      extend(el, res)
    } else if (process.env.NODE_ENV !== 'production') {
      warn(
        `Invalid v-for expression: ${exp}`,
        el.rawAttrsMap['v-for']
      )
    }
  }
}

type ForParseResult = {
  for: string;
  alias: string;
  iterator1?: string;
  iterator2?: string;
};

export function parseFor (exp: string): ?ForParseResult {
  const inMatch = exp.match(forAliasRE)
  if (!inMatch) return
  const res = {}
  res.for = inMatch[2].trim()
  const alias = inMatch[1].trim().replace(stripParensRE, '')
  const iteratorMatch = alias.match(forIteratorRE)
  if (iteratorMatch) {
    res.alias = alias.replace(forIteratorRE, '').trim()
    res.iterator1 = iteratorMatch[1].trim()
    if (iteratorMatch[2]) {
      res.iterator2 = iteratorMatch[2].trim()
    }
  } else {
    res.alias = alias
  }
  return res
}

function processIf (el) {
  const exp = getAndRemoveAttr(el, 'v-if')
  if (exp) {
    el.if = exp
    addIfCondition(el, {
      exp: exp,
      block: el
    })
  } else {
    if (getAndRemoveAttr(el, 'v-else') != null) {
      el.else = true
    }
    const elseif = getAndRemoveAttr(el, 'v-else-if')
    if (elseif) {
      el.elseif = elseif
    }
  }
}

function processIfConditions (el, parent) {
  const prev = findPrevElement(parent.children)
  if (prev && prev.if) {
    addIfCondition(prev, {
      exp: el.elseif,
      block: el
    })
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `v-${el.elseif ? ('else-if="' + el.elseif + '"') : 'else'} ` +
      `used on element <${el.tag}> without corresponding v-if.`,
      el.rawAttrsMap[el.elseif ? 'v-else-if' : 'v-else']
    )
  }
}

function findPrevElement (children: Array<any>): ASTElement | void {
  let i = children.length
  while (i--) {
    if (children[i].type === 1) {
      return children[i]
    } else {
      if (process.env.NODE_ENV !== 'production' && children[i].text !== ' ') {
        warn(
          `text "${children[i].text.trim()}" between v-if and v-else(-if) ` +
          `will be ignored.`,
          children[i]
        )
      }
      children.pop()
    }
  }
}

export function addIfCondition (el: ASTElement, condition: ASTIfCondition) {
  if (!el.ifConditions) {
    el.ifConditions = []
  }
  el.ifConditions.push(condition)
}

function processOnce (el) {
  const once = getAndRemoveAttr(el, 'v-once')
  if (once != null) {
    el.once = true
  }
}

// handle content being passed to a component as slot,
// e.g. <template slot="xxx">, <div slot-scope="xxx">
function processSlotContent (el) {
  let slotScope
  if (el.tag === 'template') {
    slotScope = getAndRemoveAttr(el, 'scope')
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && slotScope) {
      warn(
        `the "scope" attribute for scoped slots have been deprecated and ` +
        `replaced by "slot-scope" since 2.5. The new "slot-scope" attribute ` +
        `can also be used on plain elements in addition to <template> to ` +
        `denote scoped slots.`,
        el.rawAttrsMap['scope'],
        true
      )
    }
    el.slotScope = slotScope || getAndRemoveAttr(el, 'slot-scope')
  } else if ((slotScope = getAndRemoveAttr(el, 'slot-scope'))) {
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && el.attrsMap['v-for']) {
      warn(
        `Ambiguous combined usage of slot-scope and v-for on <${el.tag}> ` +
        `(v-for takes higher priority). Use a wrapper <template> for the ` +
        `scoped slot to make it clearer.`,
        el.rawAttrsMap['slot-scope'],
        true
      )
    }
    el.slotScope = slotScope
  }

  // slot="xxx"
  const slotTarget = getBindingAttr(el, 'slot')
  if (slotTarget) {
    el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget
    el.slotTargetDynamic = !!(el.attrsMap[':slot'] || el.attrsMap['v-bind:slot'])
    // preserve slot as an attribute for native shadow DOM compat
    // only for non-scoped slots.
    if (el.tag !== 'template' && !el.slotScope) {
      addAttr(el, 'slot', slotTarget, getRawBindingAttr(el, 'slot'))
    }
  }

  // 2.6 v-slot syntax
  if (process.env.NEW_SLOT_SYNTAX) {
    if (el.tag === 'template') {
      // v-slot on <template>
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE)
      if (slotBinding) {
        if (process.env.NODE_ENV !== 'production') {
          if (el.slotTarget || el.slotScope) {
            warn(
              `Unexpected mixed usage of different slot syntaxes.`,
              el
            )
          }
          if (el.parent && !maybeComponent(el.parent)) {
            warn(
              `<template v-slot> can only appear at the root level inside ` +
              `the receiving component`,
              el
            )
          }
        }
        const { name, dynamic } = getSlotName(slotBinding)
        el.slotTarget = name
        el.slotTargetDynamic = dynamic
        el.slotScope = slotBinding.value || emptySlotScopeToken // force it into a scoped slot for perf
      }
    } else {
      // v-slot on component, denotes default slot
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE)
      if (slotBinding) {
        if (process.env.NODE_ENV !== 'production') {
          if (!maybeComponent(el)) {
            warn(
              `v-slot can only be used on components or <template>.`,
              slotBinding
            )
          }
          if (el.slotScope || el.slotTarget) {
            warn(
              `Unexpected mixed usage of different slot syntaxes.`,
              el
            )
          }
          if (el.scopedSlots) {
            warn(
              `To avoid scope ambiguity, the default slot should also use ` +
              `<template> syntax when there are other named slots.`,
              slotBinding
            )
          }
        }
        // add the component's children to its default slot
        const slots = el.scopedSlots || (el.scopedSlots = {})
        const { name, dynamic } = getSlotName(slotBinding)
        const slotContainer = slots[name] = createASTElement('template', [], el)
        slotContainer.slotTarget = name
        slotContainer.slotTargetDynamic = dynamic
        slotContainer.children = el.children.filter((c: any) => {
          if (!c.slotScope) {
            c.parent = slotContainer
            return true
          }
        })
        slotContainer.slotScope = slotBinding.value || emptySlotScopeToken
        // remove children as they are returned from scopedSlots now
        el.children = []
        // mark el non-plain so data gets generated
        el.plain = false
      }
    }
  }
}

function getSlotName (binding) {
  let name = binding.name.replace(slotRE, '')
  if (!name) {
    if (binding.name[0] !== '#') {
      name = 'default'
    } else if (process.env.NODE_ENV !== 'production') {
      warn(
        `v-slot shorthand syntax requires a slot name.`,
        binding
      )
    }
  }
  return dynamicArgRE.test(name)
    // dynamic [name]
    ? { name: name.slice(1, -1), dynamic: true }
    // static name
    : { name: `"${name}"`, dynamic: false }
}

// handle <slot/> outlets
function processSlotOutlet (el) {
  if (el.tag === 'slot') {
    el.slotName = getBindingAttr(el, 'name')
    if (process.env.NODE_ENV !== 'production' && el.key) {
      warn(
        `\`key\` does not work on <slot> because slots are abstract outlets ` +
        `and can possibly expand into multiple elements. ` +
        `Use the key on a wrapping element instead.`,
        getRawBindingAttr(el, 'key')
      )
    }
  }
}

function processComponent (el) {
  let binding
  if ((binding = getBindingAttr(el, 'is'))) {
    el.component = binding
  }
  if (getAndRemoveAttr(el, 'inline-template') != null) {
    el.inlineTemplate = true
  }
}

function processAttrs (el) {
  const list = el.attrsList
  let i, l, name, rawName, value, modifiers, syncGen, isDynamic
  for (i = 0, l = list.length; i < l; i++) {
    name = rawName = list[i].name
    value = list[i].value
    if (dirRE.test(name)) {
      // 匹配 [v-, @, :, #, .] 开头的指令
      // mark element as dynamic
      el.hasBindings = true
      // modifiers
      modifiers = parseModifiers(name.replace(dirRE, ''))
      // support .foo shorthand syntax for the .prop modifier
      if (process.env.VBIND_PROP_SHORTHAND && propBindRE.test(name)) {
        (modifiers || (modifiers = {})).prop = true
        name = `.` + name.slice(1).replace(modifierRE, '')
      } else if (modifiers) {
        name = name.replace(modifierRE, '')
      }
      if (bindRE.test(name)) { // v-bind、:(v-bind的简写)
        name = name.replace(bindRE, '')
        value = parseFilters(value)
        isDynamic = dynamicArgRE.test(name)
        if (isDynamic) {
          name = name.slice(1, -1)
        }
        if (
          process.env.NODE_ENV !== 'production' &&
          value.trim().length === 0
        ) {
          warn(
            `The value for a v-bind expression cannot be empty. Found in "v-bind:${name}"`
          )
        }
        if (modifiers) {
          if (modifiers.prop && !isDynamic) {
            name = camelize(name)
            if (name === 'innerHtml') name = 'innerHTML'
          }
          if (modifiers.camel && !isDynamic) {
            name = camelize(name)
          }
          if (modifiers.sync) {
            syncGen = genAssignmentCode(value, `$event`)
            if (!isDynamic) {
              addHandler(
                el,
                `update:${camelize(name)}`,
                syncGen,
                null,
                false,
                warn,
                list[i]
              )
              if (hyphenate(name) !== camelize(name)) {
                addHandler(
                  el,
                  `update:${hyphenate(name)}`,
                  syncGen,
                  null,
                  false,
                  warn,
                  list[i]
                )
              }
            } else {
              // handler w/ dynamic event name
              addHandler(
                el,
                `"update:"+(${name})`,
                syncGen,
                null,
                false,
                warn,
                list[i],
                true // dynamic
              )
            }
          }
        }
        if ((modifiers && modifiers.prop) || (
          !el.component && platformMustUseProp(el.tag, el.attrsMap.type, name)
        )) {
          addProp(el, name, value, list[i], isDynamic)
        } else {
          addAttr(el, name, value, list[i], isDynamic)
        }
      } else if (onRE.test(name)) { // v-on、@(v-on的简写)
        name = name.replace(onRE, '') // 拿到真正的事件click
        isDynamic = dynamicArgRE.test(name) // 动态事件绑定
        if (isDynamic) {
          name = name.slice(1, -1)
        }
        // 通过 addHandler 方法，为 AST 树添加事件相关的属性
        addHandler(el, name, value, modifiers, false, warn, list[i], isDynamic)
      } else { // normal directives
        // 其他指令
        name = name.replace(dirRE, '')
        // parse arg
        const argMatch = name.match(argRE)
        let arg = argMatch && argMatch[1]
        isDynamic = false
        if (arg) {
          name = name.slice(0, -(arg.length + 1))
          if (dynamicArgRE.test(arg)) {
            arg = arg.slice(1, -1)
            isDynamic = true
          }
        }
        addDirective(el, name, rawName, value, arg, isDynamic, modifiers, list[i])

        if (process.env.NODE_ENV !== 'production' && name === 'model') {
          checkForAliasModel(el, value)
        }
      }
    } else {
      // literal attribute
      if (process.env.NODE_ENV !== 'production') {
        const res = parseText(value, delimiters)
        if (res) {
          warn(
            `${name}="${value}": ` +
            'Interpolation inside attributes has been removed. ' +
            'Use v-bind or the colon shorthand instead. For example, ' +
            'instead of <div id="{{ val }}">, use <div :id="val">.',
            list[i]
          )
        }
      }
      addAttr(el, name, JSON.stringify(value), list[i])
      // #6887 firefox doesn't update muted state if set via attribute
      // even immediately after element creation
      if (!el.component &&
          name === 'muted' &&
          platformMustUseProp(el.tag, el.attrsMap.type, name)) {
        addProp(el, name, 'true', list[i])
      }
    }
  }
}

function checkInFor (el: ASTElement): boolean {
  let parent = el
  while (parent) {
    if (parent.for !== undefined) {
      return true
    }
    parent = parent.parent
  }
  return false
}

function parseModifiers (name: string): Object | void {
  const match = name.match(modifierRE)
  if (match) {
    const ret = {}
    match.forEach(m => { ret[m.slice(1)] = true })
    return ret
  }
}

function makeAttrsMap (attrs: Array<Object>): Object {
  const map = {}
  for (let i = 0, l = attrs.length; i < l; i++) {
    if (
      process.env.NODE_ENV !== 'production' &&
      map[attrs[i].name] && !isIE && !isEdge
    ) {
      warn('duplicate attribute: ' + attrs[i].name, attrs[i])
    }
    map[attrs[i].name] = attrs[i].value
  }
  return map
}

// for script (e.g. type="x/template") or style, do not decode content
function isTextTag (el): boolean {
  return el.tag === 'script' || el.tag === 'style'
}

function isForbiddenTag (el): boolean {
  return (
    el.tag === 'style' ||
    (el.tag === 'script' && (
      !el.attrsMap.type ||
      el.attrsMap.type === 'text/javascript'
    ))
  )
}

const ieNSBug = /^xmlns:NS\d+/
const ieNSPrefix = /^NS\d+:/

/* istanbul ignore next */
function guardIESVGBug (attrs) {
  const res = []
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]
    if (!ieNSBug.test(attr.name)) {
      attr.name = attr.name.replace(ieNSPrefix, '')
      res.push(attr)
    }
  }
  return res
}

function checkForAliasModel (el, value) {
  let _el = el
  while (_el) {
    if (_el.for && _el.alias === value) {
      warn(
        `<${el.tag} v-model="${value}">: ` +
        `You are binding v-model directly to a v-for iteration alias. ` +
        `This will not be able to modify the v-for source array because ` +
        `writing to the alias is like modifying a function local variable. ` +
        `Consider using an array of objects and use v-model on an object property instead.`,
        el.rawAttrsMap['v-model']
      )
    }
    _el = _el.parent
  }
}
