/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson (MPL-1.1 OR Apache-2.0 OR GPL-2.0-or-later)
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'
import { unicodeRegExp } from 'core/util/lang'

// Regular Expressions for parsing tags and attributes
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
const dynamicArgAttribute = /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*`
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
const startTagOpen = new RegExp(`^<${qnameCapture}`)
const startTagClose = /^\s*(\/?)>/
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
const doctype = /^<!DOCTYPE [^>]+>/i
// #7298: escape - to avoid being passed as HTML comment when inlined in page
const comment = /^<!\--/
const conditionalComment = /^<!\[/

// Special Elements (can contain anything)
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t',
  '&#39;': "'"
}
const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g

// #5992
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

function decodeAttr (value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

/**
 * 遍历 template 模版字符串（遍历字符串），处理各个标签及标签上的属性
 * @param {*} html html 模板（就是 template）
 * @param {*} options parseHTMLOptions
 */
export function parseHTML (html, options) {
  const stack = []
  const expectHTML = options.expectHTML
  // 是否是自闭合标签
  const isUnaryTag = options.isUnaryTag || no
  // 是否可以只有开始标签
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  // 记录当前在原始 html 字符串中的开始位置索引，一开始为0
  let index = 0
  let last, lastTag
  while (html) {
    last = html
    // Make sure we're not in a plaintext content element like script/style
    // 确保不是在 <script> 或者 <style> 标签中
    if (!lastTag || !isPlainTextElement(lastTag)) {
      // 找 "<" 字符的索引
      let textEnd = html.indexOf('<')
      // textEnd === 0 ，代表模板的第一个字符是 "<"，分下面几种情况：
      // 每处理完一种情况，就会中断这一轮（continue）循环
      // 并且利用函数 advance 重置 html 字符串，将处理过的标签截掉，下一次循环处理剩余的 html 字符串
      if (textEnd === 0) {
        // 如果是注释标签  <!--xx-->
        // const comment = /^<!\--/
        if (comment.test(html)) {
          // 找到注释文字结束位置索引
          // 注意，这里是注释文字的结束位置索引，不是注释标签的，注释标签的结束索引需要在这个基础上加3
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) {
            // 如果需要保留注释
            if (options.shouldKeepComment) {
              // 调用 parseHTMLOptions 的 comment 函数，得到注释内容、注释节点开始索引和结束索引
              options.comment(html.substring(4, commentEnd), index, index + commentEnd + 3)
            }
            // 调整 html 字符串（将处理过的标签截掉）和 index 位置
            advance(commentEnd + 3)
            // 中断这一轮循环
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        // 如果是条件注释标签：<!--[if IE]>
        // const conditionalComment = /^<!\[/
        if (conditionalComment.test(html)) {
          // 找到条件注释标签结束位置索引
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) {
            // 调整 html 字符串（将处理过的标签截掉）和 index 位置
            advance(conditionalEnd + 2)
            // 中断这一轮循环
            continue
          }
        }

        // 如果是 Doctype 标签：<!DOCTYPE html>
        // const doctype = /^<!DOCTYPE [^>]+>/i
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // 接下来是处理结束标签和开始标签，这才是 parseHTML 核心部分，上面的是处理一些边界

        // 处理结束标签，例如：</div>、</p> 等
        const endTagMatch = html.match(endTag) // 结果类似 ['</div>', 'div']
        if (endTagMatch) {
          const curIndex = index

          // 调整 html 字符串（将处理过的标签截掉）和 index 位置
          advance(endTagMatch[0].length)

          // 调用 parseEndTag 处理结束标签
          // endTagMatch=['</div>', 'div']，那么 endTagMatch[1]=div
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // 处理开始标签：
        const startTagMatch = parseStartTag()
        if (startTagMatch) {
          // 拿到经过 parseStartTag 解析后的 match 对象，进一步处理
          // 这里面调用 parseHTMLOptions.start 真正进行标签解析
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1)
          }
          continue
        }
      }

      let text, rest, next
      if (textEnd >= 0) {
        rest = html.slice(textEnd)
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
          next = rest.indexOf('<', 1)
          if (next < 0) break
          textEnd += next
          rest = html.slice(textEnd)
        }
        text = html.substring(0, textEnd)
      }

      if (textEnd < 0) {
        text = html
      }

      if (text) {
        advance(text.length)
      }

      if (options.chars && text) {
        options.chars(text, index - text.length, index)
      }
    } else {
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      index += html.length - rest.length
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`, { start: index + html.length })
      }
      break
    }
  }

  // Clean up any remaining tags
  parseEndTag()

  // 主要用来重置 html，html 为从索引 n 位置开始的向后的所有字符，通过 substring 截取
  // 并使用 index 记录下一次处理 html 字符的开始位置
  function advance (n) {
    index += n
    html = html.substring(n)
  }

  // 解析开始标签
  function parseStartTag () {
    // 比如刚开始的标签 <div id="app">，start=['<div', 'div']
    const start = html.match(startTagOpen)
    if (start) {
      const match = {
        tagName: start[1], // 标签名
        attrs: [], // 属性
        start: index // 标签的开始索引
      }

      // 调整 html 字符串（将处理过的标签截掉）和 index 位置
      advance(start[0].length)

      let end, attr
      // 处理 开始标签 内的各个属性，并将这些属性放到 match.attrs 数组中
      // 例如：<div id="app"> 里面的 id="app"
      while (!(end = html.match(startTagClose)) && (attr = html.match(dynamicArgAttribute) || html.match(attribute))) {
        attr.start = index

        // 调整 html 字符串（将处理过的标签截掉）和 index 位置
        advance(attr[0].length)
        attr.end = index
        match.attrs.push(attr)
      }
      // 开始标签的结束符，例如：'>' 或者 '/>'
      if (end) {
        match.unarySlash = end[1]

        // 调整 html 字符串（将处理过的标签截掉）和 index 位置
        advance(end[0].length)
        match.end = index

        // 最后将 match 对象返回，包括标签名、属性和标签开始索引
        return match
      }
    }
  }

  /**
   * 进一步处理 match 对象
   *  
   * @param {*} match 
   */
  function handleStartTag (match) {
    const tagName = match.tagName // 标签名
    const unarySlash = match.unarySlash

    if (expectHTML) {
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    // 是否一元标签，例如 <hr />
    const unary = isUnaryTag(tagName) || !!unarySlash

    const l = match.attrs.length
    const attrs = new Array(l)
    // 遍历处理 attrs，得到更完整的描述信息:
    // arrts = [{ name: 'xx', value: 'xx', start: xx, end: xx }, ...]
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      const value = args[3] || args[4] || args[5] || ''
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
        ? options.shouldDecodeNewlinesForHref
        : options.shouldDecodeNewlines
      attrs[i] = {
        name: args[1],
        value: decodeAttr(value, shouldDecodeNewlines)
      }
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length
        attrs[i].end = args.end
      }
    }

    // 如果不是一元标签，那么讲这些标签放进 stack 数组，例如 <div>、<p> 之类的
    // 
    if (!unary) {
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs, start: match.start, end: match.end })
      lastTag = tagName
    }

    /**
   * 调用 parseHTMLOptions 的 start 方法，主要做了以下 6 件事情:
   *   1、创建 AST 对象
   *   2、处理存在 v-model 指令的 input 标签，分别处理 input 为 checkbox、radio、其它的情况
   *   3、处理标签上的众多指令，比如 v-pre、v-for、v-if、v-once
   *   4、如果根节点 root 不存在则设置当前元素为根节点
   *   5、如果当前元素为非自闭合标签则将自己 push 到 stack 数组，并记录 currentParent，在接下来处理子元素时用来告诉子元素自己的父节点是谁
   *   6、如果当前元素为自闭合标签，则表示该标签要处理结束了，让自己和父元素产生关系，以及设置自己的子元素
   */
    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }

  /**
   * 处理结束标签：
   *  处理 stack 数组，从 stack 中找到当前结束标签对应的开始标签，然后调用 parseHTMLOptions 的 end 函数处理结束标签
   *  处理完结束标签之后调整 stack 数组，保证在正常情况下 stack 数组中的最后一个是下一个结束标签对应的开始标签
   * @param {*} tagName 结束标签名，例如：div
   * @param {*} start 结束标签的开始索引
   * @param {*} end 结束标签的结束索引
   */
  function parseEndTag (tagName, start, end) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    // Find the closest opened tag of the same type
    // 倒序遍历 stack 数组，找到第一个和当前结束标签相同的标签，该标签就是结束标签对应的开始标签
    // 没有异常情况下，stack 数组中的最后一个元素就是当前结束标签的开始标签
    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase()
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      pos = 0
    }

    if (pos >= 0) {
      // Close all the open elements, up the stack
      // 假设 stack = ['div', 'p', 'span']，当前处理的结束标签 tagName='p'
      // 那么匹配到的索引是 1，并不是最后一位，代表 span 没有关闭标签，那么发出警告
      for (let i = stack.length - 1; i >= pos; i--) {
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          options.warn(
            `tag <${stack[i].tag}> has no matching end tag.`,
            { start: stack[i].start, end: stack[i].end }
          )
        }

        // 调用 parseHTMLOptions 的 end 函数处理结束标签
        if (options.end) {
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      // 从 stack 中移除处理过的标签，保证数组的最后一个是下一个结束标签对应的开始标签
      stack.length = pos
      // 记录 stack 中未处理的最后一个开始标签
      lastTag = pos && stack[pos - 1].tag
    } else if (lowerCasedTagName === 'br') {
      // 处理 <br /> 标签
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
    } else if (lowerCasedTagName === 'p') {
      if (options.start) {
        // 处理 <p> 标签
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        // 处理 </p> 标签
        options.end(tagName, start, end)
      }
    }
  }
}
