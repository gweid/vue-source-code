import applyMixin from './mixin'
import devtoolPlugin from './plugins/devtool'
import ModuleCollection from './module/module-collection'
import { forEachValue, isObject, isPromise, assert, partial } from './util'

let Vue // bind on install

export class Store {
  constructor (options = {}) {
    // Auto install if it is not done yet and `window` has `Vue`.
    // To allow users to avoid auto-installation in some cases,
    // this code should be placed here. See #731
    // 如果是通过 script 标签的方式引入的 vuex，那么直接调用 install 安装，而不需要 Vue.use 安装
    if (!Vue && typeof window !== 'undefined' && window.Vue) {
      install(window.Vue)
    }

    // 开发环境的一些错误提示
    // export function assert (condition, msg) {
    //   if (!condition) throw new Error(`[vuex] ${msg}`)
    // }
    if (process.env.NODE_ENV !== 'production') {
      // 在创建 store 实例之前必须先安装 vuex
      assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`)
      // 当前环境不支持Promise，报错：vuex 需要 Promise polyfill
      assert(typeof Promise !== 'undefined', `vuex requires a Promise polyfill in this browser.`)
      // store 必须使用 new 进行实例化
      assert(this instanceof Store, `store must be called with the new operator.`)
    }

    const {
      plugins = [], // vuex 插件
      // 是否严格模式，默认 false
      // 如果是严格模式，无论何时发生了状态变更且不是由 mutation 函数引起的，都会抛出错误
      strict = false
    } = options

    // store internal state
    // 表示提交的状态，当通过 mutations 方法改变 state 时，该状态为 true，state 值改变完后，该状态变为 false; 
    // 在严格模式下会监听 state 值的改变，当改变时，_committing 为 false 时，会发出警告，state 值的改变没有经过 mutations
    // 也就是说，_committing 主要用来判断严格模式下 state 是否是通过 mutation 修改的 state
    this._committing = false
    // 用来存储 actions 方法名称(包括全局和命名空间内的)
    this._actions = Object.create(null)
    // 用来存储 actions 订阅函数
    this._actionSubscribers = []
    // 用来存储 mutations 方法名称(包括全局和命名空间内的)
    this._mutations = Object.create(null)
    // 用来存储 getters
    this._wrappedGetters = Object.create(null)
    // 根据传进来的 options 配置，注册各个模块，构造模块树形结构
    // 注意：此时只是构建好了各个模块的关系，定义了各个模块的 state 状态
    // 但 getter、mutation 等各个方法还没有注册
    this._modules = new ModuleCollection(options)
    // 存储定义了命名空间的模块
    this._modulesNamespaceMap = Object.create(null)
    // 存放 mutation 的订阅函数
    this._subscribers = []
    // 实例化一个 Vue，主要用 $watch 对 state、getters 进行监听
    this._watcherVM = new Vue()
    // getter 本地缓存
    this._makeLocalGettersCache = Object.create(null)

    // bind commit and dispatch to self
    // 改变 this 指向，将 dispatch 和 commit 方法绑定到 store 实例上
    // 避免后续使用 dispatch 或 commit 时改变了 this 指向
    const store = this
    const { dispatch, commit } = this
    this.dispatch = function boundDispatch (type, payload) {
      return dispatch.call(store, type, payload)
    }
    this.commit = function boundCommit (type, payload, options) {
      return commit.call(store, type, payload, options)
    }

    // strict mode
    // 严格模式，默认是 false
    // 在 vuex 中，建议所有的 state 的变化都必须经过 mutations 方法，这样才能被 devtool 所记录下来
    // 在严格模式下，未经过 mutations 而直接改变了 state，开发环境下会发出警告
    this.strict = strict

    // 获取 根模块 的 state 值
    const state = this._modules.root.state

    // init root module.
    // this also recursively registers all sub-modules
    // and collects all module getters inside this._wrappedGetters
    // 从根模块开始，递归完善各个模块的信息：
    installModule(this, state, [], this._modules.root)

    // initialize the store vm, which is responsible for the reactivity
    // (also registers _wrappedGetters as computed properties)
    // 实现数据的响应式
    // 通过 Vue 生成一个 _vm 实例，将 getter 和 state 交给 _vm 托管，作用：
    //  store.state 赋值给 _vm.data.$$state
    //  getter 通过转化后赋值给 _vm.computed
    //  这样一来，就实现了 state 的响应式，getters 实现了类似 computed 的功能
    // this：当前 store 实例； state：根模块的 state
    resetStoreVM(this, state)

    // apply plugins
    // 注册插件
    plugins.forEach(plugin => plugin(this))

    // 调试工具注册
    const useDevtools = options.devtools !== undefined ? options.devtools : Vue.config.devtools
    if (useDevtools) {
      devtoolPlugin(this)
    }
  }

  // 访问 state，实际上就是访问 store._vm.data.$$state
  // 在 resetStoreVM 响应式处理的时候会将 state 挂载到 store._vm.data.$$state
  get state () {
    return this._vm._data.$$state
  }

  // 警告不允许直接通过 store.state.xxx = aaa 的形式设置 state
  set state (v) {
    if (process.env.NODE_ENV !== 'production') {
      assert(false, `use store.replaceState() to explicit replace store state.`)
    }
  }

  // 主要用来调用 mutation，同步的，两种调用方式：
  //  1、this.$store.commit('mutation方法名', 值)
  //  2、this.$store.commit({ type: 'mutation方法名', amount: 10 })
  commit (_type, _payload, _options) {
    // check object-style commit
    // 主要就是处理兼容 commit 的两种调用方式
    const {
      type, // mutation 方法名
      payload, // 传入的参数
      options
    } = unifyObjectStyle(_type, _payload, _options)

    const mutation = { type, payload }

    // 取出 type 对应的 mutation 方法
    const entry = this._mutations[type]
    // 没找到 type 对应的 mutation 方法，报错
    if (!entry) {
      if (process.env.NODE_ENV !== 'production') {
        console.error(`[vuex] unknown mutation type: ${type}`)
      }
      return
    }

    // 之前说过，mutation 的 type 对应的方法是存储在一个数组中的
    // 因为子模块如果没有命名空间，会继承父模块的命名空间
    // 父子模块有同一个 mutation 方法名的时候，为了不让子模块的覆盖父模块的，所以加到数组后面
    // 所以现在就是将所有符合 type【mtation方法名】的函数拿出来，逐一执行
    // _withCommit 主要就是：执行 mutation 前，将 this._committing 设置为 true，说明是通过 mutation 操作 state
    //   结束后，将 this._committing 恢复原来状态
    this._withCommit(() => {
      entry.forEach(function commitIterator (handler) {
        handler(payload)
      })
    })

    // 调用 commit 更改 state 时，调用所有插件中订阅的方法
    //  执行订阅函数，这个主要是一些 before，after 钩子函数
    //  比如定义插件的过程中，常常需要监听多个 mutation，在 mutation 触发之后做一些公共的操作
    //  就可以利用这些订阅的钩子函数
    this._subscribers
      .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
      .forEach(sub => sub(mutation, this.state))

    if (
      process.env.NODE_ENV !== 'production' &&
      options && options.silent
    ) {
      console.warn(
        `[vuex] mutation type: ${type}. Silent option has been removed. ` +
        'Use the filter functionality in the vue-devtools'
      )
    }
  }

  // 主要用来调用 action，异步的，两种调用方式：
  //  1、this.$store.dispatch('action方法名', 值)
  //  2、this.$store.dispatch({ type: 'action方法名', amount: 10 })
  dispatch (_type, _payload) {
    // check object-style dispatch
    // 兼容处理两种 action 调用方法
    const { type, payload } = unifyObjectStyle(_type, _payload)

    const action = { type, payload }

    // 取出 type【action方法名】 对应的 actions 方法数组
    const entry = this._actions[type]
    // 没找到 type【action方法名】 对应的 actions 方法数组，报错
    if (!entry) {
      if (process.env.NODE_ENV !== 'production') {
        console.error(`[vuex] unknown action type: ${type}`)
      }
      return
    }

    try {
      this._actionSubscribers
        .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
        .filter(sub => sub.before)
        .forEach(sub => sub.before(action, this.state))
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[vuex] error in before action subscribers: `)
        console.error(e)
      }
    }

    // 判断 type【action方法名】 对应的 actions 方法数组长度
    // 大于1，使用 promise.all 执行所有方法
    // 否则，使用直接取出第一项执行
    const result = entry.length > 1
      ? Promise.all(entry.map(handler => handler(payload)))
      : entry[0](payload)

    // 现在 3.1.3 版本，是执行一下 result.then 后返回结果
    // 但是 3.4.0 及之后的版本，是会返回 promise 的，具体查看：https://github.com/vuejs/vuex/blob/v3.4.0/src/store.js#L152
    return result.then(res => {
      try {
        this._actionSubscribers
          .filter(sub => sub.after)
          .forEach(sub => sub.after(action, this.state))
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[vuex] error in after action subscribers: `)
          console.error(e)
        }
      }
      return res
    })
  }

  subscribe (fn) {
    return genericSubscribe(fn, this._subscribers)
  }

  subscribeAction (fn) {
    const subs = typeof fn === 'function' ? { before: fn } : fn
    return genericSubscribe(subs, this._actionSubscribers)
  }

  watch (getter, cb, options) {
    if (process.env.NODE_ENV !== 'production') {
      assert(typeof getter === 'function', `store.watch only accepts a function.`)
    }
    return this._watcherVM.$watch(() => getter(this.state, this.getters), cb, options)
  }

  replaceState (state) {
    this._withCommit(() => {
      this._vm._data.$$state = state
    })
  }

  registerModule (path, rawModule, options = {}) {
    if (typeof path === 'string') path = [path]

    if (process.env.NODE_ENV !== 'production') {
      assert(Array.isArray(path), `module path must be a string or an Array.`)
      assert(path.length > 0, 'cannot register the root module by using registerModule.')
    }

    this._modules.register(path, rawModule)
    installModule(this, this.state, path, this._modules.get(path), options.preserveState)
    // reset store to update getters...
    resetStoreVM(this, this.state)
  }

  unregisterModule (path) {
    if (typeof path === 'string') path = [path]

    if (process.env.NODE_ENV !== 'production') {
      assert(Array.isArray(path), `module path must be a string or an Array.`)
    }

    this._modules.unregister(path)
    this._withCommit(() => {
      const parentState = getNestedState(this.state, path.slice(0, -1))
      Vue.delete(parentState, path[path.length - 1])
    })
    resetStore(this)
  }

  hasModule (path) {
    if (typeof path === 'string') path = [path]

    if (process.env.NODE_ENV !== 'production') {
      assert(Array.isArray(path), `module path must be a string or an Array.`)
    }

    return this._modules.isRegistered(path)
  }

  hotUpdate (newOptions) {
    this._modules.update(newOptions)
    resetStore(this, true)
  }

  _withCommit (fn) {
    // 原来的 this._committing 存储一份 
    const committing = this._committing
    // this._committing 设置为 true
    this._committing = true
    // 执行传进来的函数
    fn()
    // 恢复 this._committing 状态
    this._committing = committing
  }
}

function genericSubscribe (fn, subs) {
  if (subs.indexOf(fn) < 0) {
    subs.push(fn)
  }
  return () => {
    const i = subs.indexOf(fn)
    if (i > -1) {
      subs.splice(i, 1)
    }
  }
}

function resetStore (store, hot) {
  store._actions = Object.create(null)
  store._mutations = Object.create(null)
  store._wrappedGetters = Object.create(null)
  store._modulesNamespaceMap = Object.create(null)
  const state = store.state
  // init all modules
  installModule(store, state, [], store._modules.root, true)
  // reset vm
  resetStoreVM(store, state, hot)
}

// 将 state、getter 转化为响应式
function resetStoreVM (store, state, hot) {
  // 保存一份老的 vm 实例
  const oldVm = store._vm

  // bind store public getters
  // 初始化 store 中的 getters【注意：之前模块注册时 getters 是存放在 store._wrappedGetters 中的】
  store.getters = {}
  // reset local getters cache
  // 重置本地 getters 缓存
  store._makeLocalGettersCache = Object.create(null)
  // 拿到模块注册时存储的 getters
  const wrappedGetters = store._wrappedGetters
  // 声明 计算属性 computed 对象
  const computed = {}
  // function forEachValue (obj, fn) {
  //   Object.keys(obj).forEach(key => fn(obj[key], key))
  // }
  // 遍历 wrappedGetters 中存储的 getters 
  forEachValue(wrappedGetters, (fn, key) => {
    // use computed to leverage its lazy-caching mechanism
    // direct inline function use will lead to closure preserving oldVm.
    // using partial to return function with only arguments preserved in closure environment.

    // function partial (fn, arg) {
    //   return function () {
    //     return fn(arg)
    //   }
    // }
    // 将 wrappedGetters 赋值到 computed 上
    // 后面会将这个 computed 对象挂到 vue 上
    computed[key] = partial(fn, store)

    // 将每一个 getter 方法注册到 store.getters，访问对应 getter 方法时触发 get 去 vm 上访问对应的 computed
    // vm 的 computed 在下面会被挂载
    Object.defineProperty(store.getters, key, {
      get: () => store._vm[key],
      enumerable: true // 可枚举
    })
  })

  // use a Vue instance to store the state tree
  // suppress warnings just in case the user has added
  // some funky global mixins
  const silent = Vue.config.silent
  Vue.config.silent = true

  // new 一个 Vue 实例对象，运用 Vue 内部的响应式实现注册 state 以及 computed
  // 所以 Vuex 和 Vue 是强绑定的
  // 通过构造 Vue 实例，将 store.state 属性设置为 data 数据，将 store.getter 集合设置为 computed 属性实现了响应式
  store._vm = new Vue({
    data: {
      $$state: state
    },
    computed
  })
  Vue.config.silent = silent

  // enable strict mode for new vm
  // 如果使用了严格模式，那么要求 state 只能通过 mutation 修改
  if (store.strict) {
    enableStrictMode(store)
  }

  // 如果存在旧的 vm 实例，销毁旧的 vm 实例：因为生成了新的 vm 实例
  if (oldVm) {
    if (hot) {
      // dispatch changes in all subscribed watchers
      // to force getter re-evaluation for hot reloading.
      // 卸载对 state 的引用
      store._withCommit(() => {
        oldVm._data.$$state = null
      })
    }
    // 销毁旧的 vm 实例
    Vue.nextTick(() => oldVm.$destroy())
  }
}

/**
 * @param {*} store store 实例
 * @param {*} rootState 根模块的 state
 * @param {*} path 路径
 * @param {*} module 模块
 * @param {*} hot 是否热重载
 */
function installModule (store, rootState, path, module, hot) {
  // 从 Store 构造函数中，我们可以看到 根模块 传入的 path 是一个空数组
  const isRoot = !path.length
  // 获取当前模块的命名空间
  // 如果子模块没有设置命名空间，子模块会继承父模块的命名空间
  const namespace = store._modules.getNamespace(path)

  // register in namespace map
  // 如果当前模块设置了namespaced 或 继承了父模块的namespaced
  // 则在 _modulesNamespaceMap 中存储一下当前模块，便于之后的辅助函数可以调用
  if (module.namespaced) {
    // 防止命名空间重复
    if (store._modulesNamespaceMap[namespace] && process.env.NODE_ENV !== 'production') {
      console.error(`[vuex] duplicate namespace ${namespace} for the namespaced module ${path.join('/')}`)
    }
    // 在 _modulesNamespaceMap 中存储 namespace - module【模块名】 键值对
    store._modulesNamespaceMap[namespace] = module
  }

  // 如果不是 根模块，那么将当前模块的 state 注册到父模块的 state 上
  if (!isRoot && !hot) {
    // 获取父模块的 state
    const parentState = getNestedState(rootState, path.slice(0, -1))
    // 当前模块名
    const moduleName = path[path.length - 1]

    store._withCommit(() => {
      if (process.env.NODE_ENV !== 'production') {
        if (moduleName in parentState) {
          console.warn(
            `[vuex] state field "${moduleName}" was overridden by a module with the same name at "${path.join('.')}"`
          )
        }
      }

      // 将当前模块的 state 注册在父模块的 state 上，并且使用的是 Vue.set，所以是响应式的，结果类似：
      // {
      //   state: {
      //     msg: 'xxx'
      //     moduleA: { // cart 模块下的 state
      //       items: []
      //     }
      //   }
      // }
      // 在后面响应式处理的时候，会将 state 挂载到 vue 上
      // 所以，既可以通过 this.$store.state.moduleA.items 访问到
      Vue.set(parentState, moduleName, module.state)
    })
  }

  // 设置当前模块的上下文 context
  // 根据命名空间为每个模块创建了一个属于该模块调用的上下文
  // 并将该上下文赋值了给了该模块的 context 属性
  // 该上下文中有当前模块的 dispatch、commit、getters、state
  const local = module.context = makeLocalContext(store, namespace, path)

  // 注册 mutation
  module.forEachMutation((mutation, key) => {
    // namespacedType = 命名空间加 mutation 方法名
    // 例如，有模块 user，下面有 mutation 方法 getName
    // 得到的 namespacedType 就是 user/getName
    const namespacedType = namespace + key

    // 调用 registerMutation 注册 mutations 方法
    registerMutation(store, namespacedType, mutation, local)
  })

  // 注册 action
  module.forEachAction((action, key) => {
    /**
     * action 有两种写法：
     *  actions: {
     *     setName(context, payload) {},
     *     setAge: {
     *       root: true,
     *       handler(context, payload) {}
     *     }
     *  }
     */
    // root = true，代表将这个 actions 方法注册到全局上，即前面不加上任何的命名空间前缀
    // 否则，得到的类似 moduleA/actionFunc，根模块的 namespace 是 ''，那么直接是 actionFunc
    const type = action.root ? key : namespace + key
    // 获取 actions 方法对应的函数
    const handler = action.handler || action

    // 调用 registerAction 注册 action
    registerAction(store, type, handler, local)
  })

  // 注册 getter
  module.forEachGetter((getter, key) => {
    // 得到 namespacedType 类似 moduleA/getterFunc；根模块的 namespace 是 ''，那么直接是 getterFunc
    const namespacedType = namespace + key

    // 调用 registerGetter 注册 getter
    registerGetter(store, namespacedType, getter, local)
  })

  // 递归处理子模块
  module.forEachChild((child, key) => {
    installModule(store, rootState, path.concat(key), child, hot)
  })
}

/**
 * make localized dispatch, commit, getters and state
 * if there is no namespace, just use root ones
 */
function makeLocalContext (store, namespace, path) {
  // 判断有没有使用命名空间
  const noNamespace = namespace === ''

  const local = {
    // 没有命名空间，直接使用根模块的 dispatch
    // 如果有命名空间，需要对 type 进行处理一下，因为有命名空间的 type 应该是 moduleA/xxxx 形式
    // 其实，本质上，最后都是调用的 根模块 的 store.dispatch，只是有命名空间的，需要处理一下 type
    //   store._mutations = {
    //     'mutationFun': [function handler() {...}],
    //     'ModuleA/mutationFun': [function handler() {...}, function handler() {...}],
    //     'ModuleA/ModuleB/mutationFun': [function handler() {...}]
    //   }
    dispatch: noNamespace ? store.dispatch : (_type, _payload, _options) => {
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args

      if (!options || !options.root) {
        type = namespace + type
        if (process.env.NODE_ENV !== 'production' && !store._actions[type]) {
          console.error(`[vuex] unknown local action type: ${args.type}, global type: ${type}`)
          return
        }
      }

      return store.dispatch(type, payload)
    },

    // 没有命名空间，直接使用根模块的 commit
    // 有命名空间，需要对 type 进行处理一下，才能拿到正确的
    // 本质也是调用的 根模块 的 store.commit
    //   store._actions = {
    //     'ationFun': [function handler() {...}],
    //     'ModuleA/ationFun': [function handler() {...}, function handler() {...}],
    //     'ModuleA/ModuleB/ationFun': [function handler() {...}]
    //   }
    commit: noNamespace ? store.commit : (_type, _payload, _options) => {
      const args = unifyObjectStyle(_type, _payload, _options)
      const { payload, options } = args
      let { type } = args

      if (!options || !options.root) {
        type = namespace + type
        if (process.env.NODE_ENV !== 'production' && !store._mutations[type]) {
          console.error(`[vuex] unknown local mutation type: ${args.type}, global type: ${type}`)
          return
        }
      }

      store.commit(type, payload, options)
    }
  }

  // getters and state object must be gotten lazily
  // because they will be changed by vm update
  // 通过 Object.defineProperties 方法对 local 的 getters 属性和 state 属性设置了一层获取代理
  // 等后续对其访问时，才会进行处理
  Object.defineProperties(local, {
    getters: {
      // 没有命名空间，直接读取 store.getters（store.getters 已经挂载到 vue 实例的 computed 上了）
      // 有命名空间，从本地缓存 _makeLocalGettersCache 中读取 getters
      get: noNamespace
        ? () => store.getters
        : () => makeLocalGetters(store, namespace)
    },
    state: {
      get: () => getNestedState(store.state, path)
    }
  })

  return local
}

function makeLocalGetters (store, namespace) {
  // 若缓存中没有指定的 getters，则创建一个新的 getters 缓存到 _makeLocalGettersCache 中
  if (!store._makeLocalGettersCache[namespace]) {
    const gettersProxy = {}
    const splitPos = namespace.length
    Object.keys(store.getters).forEach(type => {
      // skip if the target getter is not match this namespace
      if (type.slice(0, splitPos) !== namespace) return

      // extract local getter type
      const localType = type.slice(splitPos)

      // Add a port to the getters proxy.
      // Define as getter property because
      // we do not want to evaluate the getters in this time.
      // 对 getters 添加一层代理
      Object.defineProperty(gettersProxy, localType, {
        get: () => store.getters[type],
        enumerable: true
      })
    })
    // 把代理过的 getters 缓存到本地
    store._makeLocalGettersCache[namespace] = gettersProxy
  }

  // 若缓存中有指定的getters，直接返回
  return store._makeLocalGettersCache[namespace]
}

// 注册 mutation
function registerMutation (store, type, handler, local) {
  // 根据传入的 type 也就是 namespacedType 去 store._mutations 对象中寻找是否存在
  // 若存在则直接获取；否则就创建一个空数组用于存储 mutations 方法
  // 实际上类似：
  //   store._mutations = {
  //     'mutationFun': [function handler() {...}],
  //     'ModuleA/mutationFun': [function handler() {...}, function handler() {...}],
  //     'ModuleA/ModuleB/mutationFun': [function handler() {...}]
  //   }
  // 为什么使用数组存放？子模块没有设置命名空间，会继承父模块的命名空间。
  // 当父子模块都有一个 func 的 mutations 方法，那么为了保证父模块的 func 方法不被替换，就应该添加到数组的末尾。
  // 后续如果调用该 mutations 方法，会先获取到相应的数组，然后遍历执行
  // 所以，mutations 的方法名在同一模块内是可以重名的
  const entry = store._mutations[type] || (store._mutations[type] = [])

  // 将当前的 mutation 方法函数添加到数组末尾
  entry.push(function wrappedMutationHandler (payload) {
    handler.call(store, local.state, payload)
  })
}

// 注册 action
function registerAction (store, type, handler, local) {
  // 根据传入的 type 也就是 namespacedType 去 store._actions 对象中寻找是否存在
  // 若存在则直接获取；否则就创建一个空数组用于存储 actions 方法
  //   store._actions = {
  //     'ationFun': [function handler() {...}],
  //     'ModuleA/ationFun': [function handler() {...}, function handler() {...}],
  //     'ModuleA/ModuleB/ationFun': [function handler() {...}]
  //   }
  // 同样，actions 的方法名在同一模块内也是可以重名的，原理与 mutations 一致
  const entry = store._actions[type] || (store._actions[type] = [])

  entry.push(function wrappedActionHandler (payload) {
    let res = handler.call(store, {
      dispatch: local.dispatch,
      commit: local.commit,
      getters: local.getters,
      state: local.state,
      rootGetters: store.getters,
      rootState: store.state
    }, payload)

    // 判断 actions 返回值是不是 promise，不是，将结果包裹在 promise 返回
    // 因为 action 是异步的，那么也希望其返回值是一个 promise 对象，方便后续的操作
    if (!isPromise(res)) {
      res = Promise.resolve(res)
    }
    if (store._devtoolHook) {
      return res.catch(err => {
        store._devtoolHook.emit('vuex:error', err)
        throw err
      })
    } else {
      return res
    }
  })
}

// 注册 getter
function registerGetter (store, type, rawGetter, local) {
  // 判断 getter 在同一模块内不能重名
  if (store._wrappedGetters[type]) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[vuex] duplicate getter key: ${type}`)
    }
    return
  }

  // 在 store._wrappedGetters 中存储 getters
  store._wrappedGetters[type] = function wrappedGetter (store) {
    // rawGetter 就是每一个 getters 的方法函数
    return rawGetter(
      local.state, // local state 当前模块的 state
      local.getters, // local getters 当前模块的 getters
      store.state, // root state 根模块的 state
      store.getters // root getters 根模块的 getters
    )
  }
}

function enableStrictMode (store) {
  store._vm.$watch(function () { return this._data.$$state }, () => {
    if (process.env.NODE_ENV !== 'production') {
      assert(store._committing, `do not mutate vuex store state outside mutation handlers.`)
    }
  }, { deep: true, sync: true })
}

function getNestedState (state, path) {
  return path.reduce((state, key) => state[key], state)
}

function unifyObjectStyle (type, payload, options) {
  if (isObject(type) && type.type) {
    options = payload
    payload = type
    type = type.type
  }

  if (process.env.NODE_ENV !== 'production') {
    assert(typeof type === 'string', `expects string as the type, but found ${typeof type}.`)
  }

  return { type, payload, options }
}

// 暴露 install 方法，在 Vue.use(Vuex) 的时候，执行这里的 install 方法
export function install (_Vue) {
  // Vue 已经存在并且与传入的相等，说明已经使用 Vue.use 安装过 Vuex
  if (Vue && _Vue === Vue) {
    if (process.env.NODE_ENV !== 'production') {
      console.error(
        '[vuex] already installed. Vue.use(Vuex) should be called only once.'
      )
    }
    return
  }

  // 将 Vue.use(Vuex) 时传入的 Vue 赋值给 Vue，用于判断是否重复安装 vuex
  Vue = _Vue

  // 如果没有被注册过，调用 applyMixin
  // 执行 mixin 混入，将 $store 对象注入到到每个组件实例
  applyMixin(Vue)
}
