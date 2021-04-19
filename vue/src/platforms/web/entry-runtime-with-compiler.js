/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

// 首先缓存了原型上的 $mount 方法，原型上的 $mount 最先在 `src/platform/web/runtime/index.js` 中定义
const mount = Vue.prototype.$mount

// 再重新定义 $mount
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  // 获取挂载元素
  // 通过 query 将 el 转化为 dom 对象
  // 这里的 el 可能是 string 类型，也可能是 element 类型
  // 如果是 string，那么通过 document.query(el) 转换为 element
  el = el && query(el)

  /* istanbul ignore if */
  // 对 el 做了限制，Vue 不能挂载在 body 、 html 这样的根节点上， 因为其会覆盖
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  const options = this.$options
  // resolve template/el and convert to render function

  // 如果有 render 函数，直接执行 mount.call(this, el, hydrating)
  // 没有 render，代表的是 template 模式，就编译 template，转化为 render 函数，再调用 mount
  if (!options.render) {
    // 没有 render 函数
    let template = options.template

    if (template) {
      // 如果 template 是 '#xxx'，那么根据 id 选择器获取 template 内容
      if (typeof template === 'string') {
        if (template.charAt(0) === '#') {
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) {
        // 如果 tempalte 是一个 nodeType，那么通过 template.innerHTML 得到 template
        template = template.innerHTML
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) {
      template = getOuterHTML(el)
    }
    if (template) {
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }
    
      // compileToFunctions 执行编译的函数（将 template 转化为 render）
      // compileToFunctions 方法会返回render函数方法，render 方法会保存到 vm.$options 下面
      const { render, staticRenderFns } = compileToFunctions(template, {
        outputSourceRange: process.env.NODE_ENV !== 'production',
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        delimiters: options.delimiters,
        comments: options.comments
      }, this)

      // render 方法保存到 options 中
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  // 无论是 template 模板还是手写 render 函数最终调用缓存的 $mount 方法
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML (el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

Vue.compile = compileToFunctions  // 将 createCompilerCreator 挂到 Vue 实例方法

export default Vue
