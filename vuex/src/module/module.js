import { forEachValue } from '../util'

// Base data struct for store's module, package with some attribute and method
export default class Module {
  // rawModule = { state:{}, getters:{}, mutations:{}, actions:{}, modules:{} }
  constructor (rawModule, runtime) {
    this.runtime = runtime
    // Store some children item
    // 创建一个 _children 对象，用来存储当前模块的子模块
    this._children = Object.create(null)
    // Store the origin module object which passed by programmer
    // 当前模块对象：{ state:{}, getters:{}, mutations:{}, actions:{}, modules:{} }
    this._rawModule = rawModule

    const rawState = rawModule.state

    // Store the origin module's state
    // 存储当前模块的 state 状态：1. 函数类型 => 返回一个obj对象; 2. 直接获取到obj对象
    this.state = (typeof rawState === 'function' ? rawState() : rawState) || {}
  }

  // 是否开启了命名空间，是，返回 true
  get namespaced () {
    return !!this._rawModule.namespaced
  }

  // 往当前模块添加子模块
  addChild (key, module) {
    this._children[key] = module
  }

  // 根据 key 移除子模块
  removeChild (key) {
    delete this._children[key]
  }

  // 根据 key 获取子模块
  getChild (key) {
    return this._children[key]
  }

  // 根据 key 判断是否存在子模块
  hasChild (key) {
    return key in this._children
  }

  // 将当前模块的命名空间更新到指定模块的命名空间中
  // 并更新 actions、mutations、getters 的调用来源
  update (rawModule) {
    this._rawModule.namespaced = rawModule.namespaced
    if (rawModule.actions) {
      this._rawModule.actions = rawModule.actions
    }
    if (rawModule.mutations) {
      this._rawModule.mutations = rawModule.mutations
    }
    if (rawModule.getters) {
      this._rawModule.getters = rawModule.getters
    }
  }

  // 遍历当前模块的所有子模块，并执行回调函数
  forEachChild (fn) {
    forEachValue(this._children, fn)
  }

  // 遍历当前模块所有的 getters，并执行回调函数
  forEachGetter (fn) {
    if (this._rawModule.getters) {
      forEachValue(this._rawModule.getters, fn)
    }
  }

  // 遍历当前模块所有的 actions，并执行回调函数
  forEachAction (fn) {
    if (this._rawModule.actions) {
      forEachValue(this._rawModule.actions, fn)
    }
  }

  // 遍历当前模块所有的 mutations，并执行回调函数
  forEachMutation (fn) {
    if (this._rawModule.mutations) {
      forEachValue(this._rawModule.mutations, fn)
    }
  }
}
