/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, {
  pushTarget,
  popTarget
} from '../observer/dep'
import {
  isUpdatingChildComponent
} from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

// 设置代理，将 key 代理到 target 上
// 例如：对于 data 来讲，target 是 vm，sourceKey 是 data 本身 _data，key 就是 data 的每一个 key
// 这样做的好处就是访问 this.xxx 的时候可以直接访问到 this[data].xxx
export function proxy(target: Object, sourceKey: string, key: string) {
  // target: vm  sourceKey: _data  key: key
  sharedPropertyDefinition.get = function proxyGetter() {
    return this[sourceKey][key] // vm['_data'].key
  }
  sharedPropertyDefinition.set = function proxySetter(val) {
    this[sourceKey][key] = val
  }
  // 这实际就是把 data 或者 props 等里面的 key 全部挂载到 vm 上
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// 这里面分别调用不同的函数处理了 props、methods、data、computed、watch
export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options

  // 初始化 props，将 props 对象上的每个属性转换为响应式，并代理到 vm
  if (opts.props) initProps(vm, opts.props)

  // 初始化 methods:
  //   校验每个属性的值是否为函数
  //   metheds 里面的每一个 key 不能和 props 中的有冲突
  //   最后得到 vm[key] = methods[key]
  if (opts.methods) initMethods(vm, opts.methods)

  if (opts.data) {
    // initData 做了：
    //   data 对象上的属性不能和 props、methods 对象上的属性相同
    //   将 data 代理到 vm 上
    //   将 data 的每个属性转换为响应式
    initData(vm)
  } else {
    // 用户没有传 data 的情况下，在 vm 上挂载 vm._data 默认值为空对象 {}
    observe(vm._data = {}, true /* asRootData */ )
  }

  // 初始化 computed:
  //   遍历 computed 对象为每一个 computed 添加一个计算 watcher(计算 watcher 的标志是有一个 lazy)
  //   将每个 compulted 代理到 vm 上并转换为响应式
  //   compulted 中的键 key 不能和 data、props 重复
  if (opts.computed) initComputed(vm, opts.computed)

  // 初始化 wathcer:
  //   遍历 watch 对象，为每个 watch 添加一个 user watch 
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

function initProps(vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {}
  const props = vm._props = {}
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  // 定义一个 keys，去缓存 props 中的每个 key 属性，为了性能优化
  const keys = vm.$options._propKeys = []
  const isRoot = !vm.$parent
  // root instance props should be converted
  if (!isRoot) {
    toggleObserving(false)
  }
  // 遍历 props 对象
  for (const key in propsOptions) {
    // 将每一个 key 添加到 keys 中缓存
    keys.push(key)
    // 获取每一个 prop 的默认值
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) ||
        config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      // 主要就是把 props 变成响应式的
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      // 对 props 做了 proxy 处理，这样一来，访问 this.xxx 时实际上就相当于访问了this._props.xxx
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

// data
function initData(vm: Component) {
  let data = vm.$options.data
  // 判断 data 是函数还是对象，data 在跟实例上是对象，在组件实例上是function
  // 是函数，调用 getData 将 data 转换为对象
  // 并把 vm.$options.data 挂到 vm._data 上
  data = vm._data = typeof data === 'function' ?
    getData(data, vm) :
    data || {}
  // 处理过的 data 不是 object 类型，就报警告
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  // 循环
  while (i--) {
    const key = keys[i]
    // 循环做一个对比，data 里面定义的属性名不能跟 props 与 method 中的一样
    if (process.env.NODE_ENV !== 'production') {
      // data 的 key 不能跟 method 中的一样
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    // data 的 key 不能跟 props 中的一样
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      // 对 vm 下的 key 逐个代理
      // 对 data 做了 proxy 处理，这样一来，访问 this.xxx 时实际上就相当于访问了this._data.xxx
      proxy(vm, `_data`, key)
    }
  }
  // 响应式数据的处理
  // observe data
  observe(data, true /* asRootData */ )
}

export function getData(data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    // 如果 data 是一个函数，简单的调用一下，返回对象
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

// 定义 computed watcher 标志，lazy 属性为 true
const computedWatcherOptions = { lazy: true }

function initComputed(vm: Component, computed: Object) {
  // $flow-disable-line
  // 定义一个 watchers 为空对象
  // 并且为 vm 实例上也定义 _computedWatchers 为空对象，用于存储 计算watcher
  // 这使得 watchers 和 vm._computedWatchers 指向同一个对象
  // 也就是说，修改 watchers 和 vm._computedWatchers 的任意一个都会对另外一个造成同样的影响
  const watchers = vm._computedWatchers = Object.create(null)

  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  // 遍历 computed 中的每一个属性值，为每一个属性值实例化一个计算 watcher
  for (const key in computed) {
    // 获取 key 的值，也就是 getter 函数
    const userDef = computed[key]
    
    // 用于传给 new Watcher 作为第二个参数
    // computed 可以是函数形式，也可以是对象形式，对象形式的 getter 函数是里面的 get
    // computed: { getName(){} } | computed: { getPrice: { get(){}, set() {} } }
    const getter = typeof userDef === 'function' ? userDef : userDef.get

    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) {
      // create internal watcher for the computed property.
      // 为每一个 computed 添加上 计算watcher；lazy 为 true 的 watcher 代表 计算watcher
      // 在 new watcher 里面会执行 this.dirty = this.lazy; 所以刚开始 dirty 就是 true
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions  // const computedWatcherOptions = { lazy: true }
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    if (!(key in vm)) {
      // 将 computed 属性代理到 vm 上，使得可以直接 vm.xxx 的方式访问 computed 的属性
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      // 在非生产环境会判重，computed 的属性不能和 data、props 中的属性重复
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

// 将 computed 的 key 代理到 vm 实例上
export function defineComputed(
  target: any,
  key: string,
  userDef: Object | Function
) {
  // shouldCache 用来判断是客户还是服务端渲染，客户端需要缓存
  const shouldCache = !isServerRendering()

  // 如果是客户端，使用 createComputedGetter 创建 getter
  // 如果是服务端，使用 createGetterInvoker 创建 getter
  // 两者有很大的不同，服务端渲染不会对计算属性缓存，而是直接求值
  if (typeof userDef === 'function') {
    // computed 是函数形式
    sharedPropertyDefinition.get = shouldCache ?
      createComputedGetter(key) :
      createGetterInvoker(userDef)
    sharedPropertyDefinition.set = noop
  } else {
    // 如果 computed 是对象形式
    sharedPropertyDefinition.get = userDef.get ?
      shouldCache && userDef.cache !== false ?
      createComputedGetter(key) :
      createGetterInvoker(userDef.get) :
      noop
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (process.env.NODE_ENV !== 'production' &&
    sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }

  // 拦截对 computed 的 key 访问，代理到 vm 上
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// 用于创建客户端的 conputed 的 getter
// 由于 computed 被代理了，所以当访问到 computed 的时候，会触发这个 getter
function createComputedGetter(key) {
  // 返回一个函数 computedGetter 作为 computed 的 getter 函数
  return function computedGetter() {
    // 得到当前 key 对应的 watcher
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      // dirty 是标志是否已经执行过计算结果；dirty=true，需要重新计算
      // 如果执行过则不会执行 watcher.evaluate 重复计算，这也是缓存的原理
      // 在 watcher.evaluate 中，会先调用 watcher.get 进行求值，然后将 dirty 置为 false
      if (watcher.dirty) {
        watcher.evaluate()
      }
      if (Dep.target) {
        // 进行依赖收集
        watcher.depend()
      }

      // 返回结果
      return watcher.value
    }
  }
}

// 用于创建服务端的 computed 的 getter
function createGetterInvoker(fn) {
  return function computedGetter() {
    // 不会进行缓存，直接求值
    return fn.call(this, this)
  }
}

function initMethods(vm: Component, methods: Object) {
  const props = vm.$options.props
  // 遍历 methods
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      // 判断 metheds 里面的每个方法是否都是函数
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      // metheds 里面的每一个 key 不能和 props 中的有冲突
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      // methods 中的方法与 Vue 实例上已有的内置方法不能重叠
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    // 将每一个 method 挂到 vm 上，即 vm[key] = methods[key]
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

function initWatch(vm: Component, watch: Object) {
  // 遍历 watch 对象
  for (const key in watch) {
    // 获取 handler = watch[key]
    const handler = watch[key]
    // handler可以是数组的形式，执行多个回调
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}


function createWatcher(
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options ? : Object
) {
  // 如果 handler(watch[key]) 是一个对象，那么获取其中的 handler 方法
  // watch: {
  //   a: {
  //     handler(newName, oldName) {
  //       console.log('obj.a changed');
  //     },
  //     immediate: true, // 立即执行一次 handler
  //     // deep: true
  //   }
  // }
  if (isPlainObject(handler)) {
    // 如果是对象，那么 options 就是 watch[key]
    options = handler
    // handler 是 watch[key].handler
    handler = handler.handler
  }

  // watch 也可以是字符串形式
  // methods: {
  //   userNameChange() {}
  // },
  // watch: {
  //   userName: 'userNameChange'
  // }
  // 如果 handler(watch[key]) 是字符串类型
  if (typeof handler === 'string') {
    // 找到 vm 实例上的 handler
    handler = vm[handler]
  }

  // handler(watch[key]) 不是对象也不是字符串，那么不需要处理 handler，直接执行 vm.$watch
  // 例如：watch: { a(newName, oldName) {} }
  /**
   * expOrFn: 就是每一个 watch 的名字(key 值)
   * handler: watch[key]
   * options: 如果是对象形式，options 有值，不是，可能是 undefined
   */
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin(Vue: Class < Component > ) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () {
    return this._data
  }
  const propsDef = {}
  propsDef.get = function () {
    return this._props
  }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  /**
   * expOrFn: key，也就是 watch 名字
   * cb: handler 回调函数
   * options: 配置项，当 watch 是对象时，或者直接调用 $watch 都可能存在，其他情况可能是 undefined
   */
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options ? : Object
  ): Function {
    const vm: Component = this

    // 先判断一下 handler 会不会是对象，是对象，继续调用 createWatcher 处理
    // 这里是因为有这种情况：this.$watch('msg', { handler: () => {} })
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }

    // 如果 options 是 undefined，将 options 赋值为空对象 {}
    options = options || {}

    // options.user 这个是用户定义 watcher 的标志
    options.user = true

    // 创建一个user watcher
    // 在实例化 user watcher 的时候会执行一次 getter 求值，这时，user watcher 会作为依赖被数据所收集
    const watcher = new Watcher(vm, expOrFn, cb, options)

    // 如果有 immediate，立即执行回调函数 handler
    if (options.immediate) {
      try {
        cb.call(vm, watcher.value)
      } catch (error) {
        handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
      }
    }

    // 返回 unwatch 函数，用于取消 watch 监听
    return function unwatchFn() {
      watcher.teardown()
    }
  }
}
