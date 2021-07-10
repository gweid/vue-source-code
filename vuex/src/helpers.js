import { isObject } from './util'

/**
 * Reduce the code which written in Vue.js for getting the state.
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} states # Object's item can be a function which accept state and getters for param, you can do something for state and getters in it.
 * @param {Object}
 */
// normalizeNamespace 统一命名空间
export const mapState = normalizeNamespace((namespace, states) => {
  const res = {}

  // states 必须是数组或者是对象
  // ...mapState('moduleA', ['xx']) 或者 ...mapState('moduleA', { xx: 'xxy' })
  if (process.env.NODE_ENV !== 'production' && !isValidMap(states)) {
    console.error('[vuex] mapState: mapper parameter must be either an Array or an Object')
  }

  // 先将 states 标准化为:
  // normalizeMap([1, 2, 3]) => [ { key: 1, val: 1 }, { key: 2, val: 2 }, { key: 3, val: 3 } ]
  // normalizeMap({a: 1, b: 2, c: 3}) => [ { key: 'a', val: 1 }, { key: 'b', val: 2 }, { key: 'c', val: 3 } ]
  // 遍历标准化后的 state 数组
  normalizeMap(states).forEach(({ key, val }) => {
    // 将遍历到的每一个对象经过处理后存放在 res 中
    res[key] = function mappedState () {
      // 先获取根模块的 state 和 getters
      let state = this.$store.state
      let getters = this.$store.getters

      // 如果有设置命名空间
      if (namespace) {
        // 获取到 namespace 对应的模块 module
        const module = getModuleByNamespace(this.$store, 'mapState', namespace)
        // 没找到模块，不进行后续操作
        if (!module) {
          return
        }
        // state 是对应的模块中的 state
        state = module.context.state
        // getters 也是对应模块中的 getters
        getters = module.context.getters
      }
      // 最后就可以将找到的 state 中对应的值返回了，这里还做了一层处理，兼容写法：
      // mapState({
      //   foo: state => state.foo,
      //   bar: 'bar'
      // })
      return typeof val === 'function'
        ? val.call(this, state, getters)
        : state[val]
    }
    // mark vuex getter for devtools
    res[key].vuex = true
  })
  return res
})

/**
 * Reduce the code which written in Vue.js for committing the mutation
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} mutations # Object's item can be a function which accept `commit` function as the first param, it can accept anthor params. You can commit mutation and do any other things in this function. specially, You need to pass anthor params from the mapped function.
 * @return {Object}
 */
// normalizeNamespace 统一命名空间
export const mapMutations = normalizeNamespace((namespace, mutations) => {
  const res = {}

  // mutations 必须是数组或者是对象
  if (process.env.NODE_ENV !== 'production' && !isValidMap(mutations)) {
    console.error('[vuex] mapMutations: mapper parameter must be either an Array or an Object')
  }

  // 标准化 mutations 数组
  // normalizeMap([1, 2, 3]) => [ { key: 1, val: 1 }, { key: 2, val: 2 }, { key: 3, val: 3 } ]
  // normalizeMap({a: 1, b: 2, c: 3}) => [ { key: 'a', val: 1 }, { key: 'b', val: 2 }, { key: 'c', val: 3 } ]
  normalizeMap(mutations).forEach(({ key, val }) => {
    res[key] = function mappedMutation (...args) {
      // Get the commit method from store
      // 先获取根模块的 commit
      let commit = this.$store.commit
      // 如果有命名空间
      if (namespace) {
        // 根据命名空间找到对应的模块
        const module = getModuleByNamespace(this.$store, 'mapMutations', namespace)
        if (!module) {
          return
        }
        // 拿到对应模块的 commit
        commit = module.context.commit
      }

      // 调用 commit 执行 mutation，会做兼容处理
      // mapMutations({
      //   foo: (commit, num) => {
      //     commit('foo', num)
      //   },
      //   bar: 'bar'
      // })
      return typeof val === 'function'
        ? val.apply(this, [commit].concat(args))
        : commit.apply(this.$store, [val].concat(args))
    }
  })
  return res
})

/**
 * Reduce the code which written in Vue.js for getting the getters
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} getters
 * @return {Object}
 */
export const mapGetters = normalizeNamespace((namespace, getters) => {
  const res = {}
  if (process.env.NODE_ENV !== 'production' && !isValidMap(getters)) {
    console.error('[vuex] mapGetters: mapper parameter must be either an Array or an Object')
  }
  normalizeMap(getters).forEach(({ key, val }) => {
    // The namespace has been mutated by normalizeNamespace
    val = namespace + val
    res[key] = function mappedGetter () {
      if (namespace && !getModuleByNamespace(this.$store, 'mapGetters', namespace)) {
        return
      }
      if (process.env.NODE_ENV !== 'production' && !(val in this.$store.getters)) {
        console.error(`[vuex] unknown getter: ${val}`)
        return
      }
      return this.$store.getters[val]
    }
    // mark vuex getter for devtools
    res[key].vuex = true
  })
  return res
})

/**
 * Reduce the code which written in Vue.js for dispatch the action
 * @param {String} [namespace] - Module's namespace
 * @param {Object|Array} actions # Object's item can be a function which accept `dispatch` function as the first param, it can accept anthor params. You can dispatch action and do any other things in this function. specially, You need to pass anthor params from the mapped function.
 * @return {Object}
 */
export const mapActions = normalizeNamespace((namespace, actions) => {
  const res = {}
  if (process.env.NODE_ENV !== 'production' && !isValidMap(actions)) {
    console.error('[vuex] mapActions: mapper parameter must be either an Array or an Object')
  }
  normalizeMap(actions).forEach(({ key, val }) => {
    res[key] = function mappedAction (...args) {
      // get dispatch function from store
      let dispatch = this.$store.dispatch
      if (namespace) {
        const module = getModuleByNamespace(this.$store, 'mapActions', namespace)
        if (!module) {
          return
        }
        dispatch = module.context.dispatch
      }
      return typeof val === 'function'
        ? val.apply(this, [dispatch].concat(args))
        : dispatch.apply(this.$store, [val].concat(args))
    }
  })
  return res
})

/**
 * Rebinding namespace param for mapXXX function in special scoped, and return them by simple object
 * @param {String} namespace
 * @return {Object}
 */
export const createNamespacedHelpers = (namespace) => ({
  mapState: mapState.bind(null, namespace),
  mapGetters: mapGetters.bind(null, namespace),
  mapMutations: mapMutations.bind(null, namespace),
  mapActions: mapActions.bind(null, namespace)
})

/**
 * 标准化统一 map，最终返回的是数组
 * normalizeMap([1, 2, 3]) => [ { key: 1, val: 1 }, { key: 2, val: 2 }, { key: 3, val: 3 } ]
 * normalizeMap({a: 1, b: 2, c: 3}) => [ { key: 'a', val: 1 }, { key: 'b', val: 2 }, { key: 'c', val: 3 } ]
 * @param {Array|Object} map
 * @return {Object}
 */
function normalizeMap (map) {
  if (!isValidMap(map)) {
    return []
  }
  return Array.isArray(map)
    ? map.map(key => ({ key, val: key }))
    : Object.keys(map).map(key => ({ key, val: map[key] }))
}

/**
 * Validate whether given map is valid or not
 * @param {*} map
 * @return {Boolean}
 */
// 校验是数组或者是对象
function isValidMap (map) {
  return Array.isArray(map) || isObject(map)
}

/**
 * Return a function expect two param contains namespace and map. it will normalize the namespace and then the param's function will handle the new namespace and the map.
 * @param {Function} fn
 * @return {Function}
 */
// 作用：统一命名空间
function normalizeNamespace (fn) {
  // 闭包与作用域链特性，可以访问到外层的 namespace, map
  // 比如：normalizeNamespace((namespace, states) => {})
  return (namespace, map) => {
    // 如果第一项不是字符串格式，代表没传命名空间，也就是根模块
    // 例如：...mapState(['xxx'])、...mapActions(['xxx']) 等
    if (typeof namespace !== 'string') {
      // 那么此时第一项就是方法数组
      map = namespace
      // 命名空间为空串 ''
      namespace = ''
    } else if (namespace.charAt(namespace.length - 1) !== '/') {
      // 如果第一项是字符串，说明有传命名空间，指的是模块下的
      // 例如：......mapState('moduleA', ['xxx'])、...mapActions('moduleA', ['xxx']) 等
      // 那么将 namespace 加上 '/'，即 'moduleA/'
      namespace += '/'
    }
    return fn(namespace, map)
  }
}

/**
 * Search a special module from store by namespace. if module not exist, print error message.
 * @param {Object} store
 * @param {String} helper
 * @param {String} namespace
 * @return {Object}
 */
function getModuleByNamespace (store, helper, namespace) {
  // 从 store._modulesNamespaceMap 中找到命名空间对应的 模块
  // 这个 store._modulesNamespaceMap 是在 installModule 的时候设置的
  const module = store._modulesNamespaceMap[namespace]
  // 找不到模块，报错
  if (process.env.NODE_ENV !== 'production' && !module) {
    console.error(`[vuex] module namespace not found in ${helper}(): ${namespace}`)
  }
  // 将找到的模块返回
  return module
}
