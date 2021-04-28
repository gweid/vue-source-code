/* @flow */

/**
 * unicode letters used for parsing html tags, component names and property paths.
 * using https://www.w3.org/TR/html53/semantics-scripting.html#potentialcustomelementname
 * skipping \u10000-\uEFFFF due to it freezing up PhantomJS
 */
export const unicodeRegExp = /a-zA-Z\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD/

/**
 * Check if a string starts with $ or _
 */
export function isReserved(str: string): boolean {
  const c = (str + '').charCodeAt(0)
  return c === 0x24 || c === 0x5F
}

/**
 * Define a property.
 */
export function def(obj: Object, key: string, val: any, enumerable ? : boolean) {
  Object.defineProperty(obj, key, {
    value: val,
    enumerable: !!enumerable, // 两个取反, 如果不传，那么就会是 !!undefined = false, 代表不可枚举
    writable: true,
    configurable: true
  })
}

/**
 * Parse simple path.
 */
const bailRE = new RegExp(`[^${unicodeRegExp.source}.$_\\d]`)
export function parsePath(path: string): any {
  if (bailRE.test(path)) {
    return
  }
  // 这里为什么要用 path.split('.') 呢？
  // data() {
  //   return {
  //     msg: '',
  //     info: { size: '' }
  //   }
  // }
  // watch: {
  //   msg() {},
  //   'info.size'() {}
  // }
  // 如果是 msg，那么 'msg'.split('.') 返回 ['msg']
  // 如果是 info.size，那么 'info.size'.split('.') 返回 ['info', 'size']
  const segments = path.split('.')

  // 在调用的时候，传入的是 obj 是 vm
  return function (obj) {
    for (let i = 0; i < segments.length; i++) {
      if (!obj) return
      // 如果是 ['msg']，那么这里就是 obj = vm[[msg][0]]
      // 这就相当于访问了 data 的 msg，那么就会触发 data 的 getter 进行依赖收集

      // 如果是 ['info', 'size'], 那么就分两次
      //  1、obj = vm[['info', 'size'][0]]，得到 obj = vm['info']，相当于访问了 data 的 info
      //  2、obj = vm['info'][['info', 'size'][1]]，相当于访问了 info['size']
      // 上面一次访问 data 的 info 以及第二次访问的 info.size 都会触发 data 的 getter 进行依赖收集

      // 并且，收集的依赖是 user watcher，区别于 渲染watcher
      obj = obj[segments[i]]
    }
    // 将 info['size'] 返回
    return obj
  }
}
