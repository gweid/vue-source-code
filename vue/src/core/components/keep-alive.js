/* @flow */

import {
  isRegExp,
  remove
} from 'shared/util'
import {
  getFirstComponentChild
} from 'core/vdom/helpers/index'

type VNodeCache = {
  [key: string]: ? VNode
};

function getComponentName(opts: ? VNodeComponentOptions): ? string {
  return opts && (opts.Ctor.options.name || opts.tag)
}

function matches(pattern: string | RegExp | Array < string > , name: string) : boolean {
  if (Array.isArray(pattern)) {
    return pattern.indexOf(name) > -1
  } else if (typeof pattern === 'string') {
    return pattern.split(',').indexOf(name) > -1
  } else if (isRegExp(pattern)) {
    return pattern.test(name)
  }
  /* istanbul ignore next */
  return false
}

function pruneCache(keepAliveInstance: any, filter: Function) {
  const {
    cache,
    keys,
    _vnode
  } = keepAliveInstance
  for (const key in cache) {
    const cachedNode: ? VNode = cache[key]
    if (cachedNode) {
      const name: ? string = getComponentName(cachedNode.componentOptions)
      if (name && !filter(name)) {
        pruneCacheEntry(cache, key, keys, _vnode)
      }
    }
  }
}

function pruneCacheEntry(
  cache: VNodeCache,
  key: string,
  keys: Array < string > ,
  current ? : VNode
) {
  const cached = cache[key]
  if (cached && (!current || cached.tag !== current.tag)) {
    cached.componentInstance.$destroy()
  }
  cache[key] = null
  remove(keys, key)
}

const patternTypes: Array < Function > = [String, RegExp, Array]

export default {
  name: 'keep-alive',
  // 标记为抽象组件
  // 抽象组件：只对包裹的子组件做处理，并不会和子组件建立父子关系，也不会作为节点渲染到页面上
  abstract: true,

  props: {
    include: patternTypes, // 哪些需要缓存
    exclude: patternTypes, // 哪些不需要缓存
    max: [String, Number] // 缓存的数量上限，缓存的是vnode对象，它也会持有DOM，当我们缓存很多的时候，会比较占用内存，所以该配置允许我们指定缓存大小
  },

  created() {
    // 缓存组件 VNode
    this.cache = Object.create(null)
    // 缓存组件名
    this.keys = []
  },

  destroyed() {
    // 销毁所有 cache 中的组件实例
    for (const key in this.cache) {
      pruneCacheEntry(this.cache, key, this.keys)
    }
  },

  mounted() {
    // 监听 include exclude，在变化的时候重新调整 cache 中的内容
    // 其实就是对 cache 做遍历，发现缓存的节点名称和新的规则没有匹配上的时候，就把这个缓存节点从缓存中摘除
    this.$watch('include', val => {
      pruneCache(this, name => matches(val, name))
    })
    this.$watch('exclude', val => {
      pruneCache(this, name => !matches(val, name))
    })
  },

  // keep-alive 的渲染函数
  render() {
    // keep-alive 插槽的值
    const slot = this.$slots.default
    // 第一个 VNode 节点
    const vnode: VNode = getFirstComponentChild(slot)
    // 拿到第一个子组件实例
    // <keep-alive> 只处理第一个子元素，所以一般和它搭配使用的是 component 动态组件或者是 router-view
    const componentOptions: ? VNodeComponentOptions = vnode && vnode.componentOptions
    // 第一个子组件实例
    if (componentOptions) {
      // check pattern
      // 第一个 VNode 节点的 name
      const name: ? string = getComponentName(componentOptions)

      const { include, exclude } = this

      // 判断子组件是否符合缓存条件
      // 组件名与 include 不匹配或与 exclude 匹配都会直接退出并返回 VNode，不走缓存机制
      if (
        // not included
        (include && (!name || !matches(include, name))) ||
        // excluded
        (exclude && name && matches(exclude, name))
      ) {
        return vnode
      }

      const { cache, keys } = this
      const key: ? string = vnode.key == null
        // same constructor may get registered as different local components
        // so cid alone is not enough (#3269)
        ?
        componentOptions.Ctor.cid + (componentOptions.tag ? `::${componentOptions.tag}` : '') :
        vnode.key

      if (cache[key]) {
        // 再次命中缓存，直接取出缓存组件
        vnode.componentInstance = cache[key].componentInstance
        // make current key freshest
        // keys 命中的组件名移到数组末端，这里使用 LRU 缓存策略
        remove(keys, key)
        keys.push(key)
      } else {
        // 初次渲染时，将 VNode 缓存
        cache[key] = vnode
        keys.push(key)
        // prune oldest entry
        // 配置了 max 并且缓存的长度超过了 this.max，则从缓存中删除第一个，即 keys[0]
        // 并调用 $destroy 销毁组件实例
        if (this.max && keys.length > parseInt(this.max)) {
          pruneCacheEntry(cache, keys[0], keys, this._vnode)
        }
      }

      // 为被 keep-alive 包裹的缓存组件打上标志
      vnode.data.keepAlive = true
    }

    // 将渲染的vnode返回
    return vnode || (slot && slot[0])
  }
}
