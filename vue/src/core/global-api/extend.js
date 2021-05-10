/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { defineComputed, proxy } from '../instance/state'
import { extend, mergeOptions, validateComponentName } from '../util/index'

export function initExtend (Vue: GlobalAPI) {
  /**
   * Each instance constructor, including Vue, has a unique
   * cid. This enables us to create wrapped "child
   * constructors" for prototypal inheritance and cache them.
   */
  // 每个构造函数（包括vue）都有一个唯一的 cid，可用于缓存
  Vue.cid = 0
  let cid = 1

  // 使用 Vue 构造器，创建一个“子类”，该子类同样支持进一步的扩展
  // 扩展时可以传递一些默认配置，就像 Vue 也会有一些默认配置
  // 默认配置如果和基类有冲突则会进行选项合并（mergeOptions)
  Vue.extend = function (extendOptions: Object): Function {
    extendOptions = extendOptions || {}
    const Super = this
    const SuperId = Super.cid

    // 判断缓存中有没有存在，有就直接使用
    // 比如：多次调用 Vue.extend 传入同一个配置项（extendOptions），这时就会启用该缓存
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId]
    }

    const name = extendOptions.name || Super.options.name
    if (process.env.NODE_ENV !== 'production' && name) {
      // 校验组件名
      validateComponentName(name)
    }

    // 定义 Sub 构造函数，和 Vue 构造函数一致
    const Sub = function VueComponent (options) {
      // 里面也是和 Vue 构造函数一样，使用 this._init 进行初始化
      this._init(options)
    }
    // 通过寄生组合继承 Vue
    Sub.prototype = Object.create(Super.prototype)
    Sub.prototype.constructor = Sub
    Sub.cid = cid++
    // 将 Vue 的配置合并到自己的配置里
    Sub.options = mergeOptions(
      Super.options,
      extendOptions
    )
    Sub['super'] = Super

    // 将 props 代理到 Sub.prototype._props 对象上
    // 在组件内可以通过 this._props 的方式访问
    if (Sub.options.props) {
      initProps(Sub)
    }
    // 将 computed 代理到 Sub.prototype 对象上
    // 在组件内可以通过 this.computed[key] 的方式访问
    if (Sub.options.computed) {
      initComputed(Sub)
    }

    // allow further extension/mixin/plugin usage
    // 定义组件的 extend、mixin、use，允许在 Sub 基础上再进一步构造子类
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // create asset registers, so extended classes
    // can have their private assets too.
    // 定义 component、filter、directive 三个静态方法
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })

    // enable recursive self-lookup
    // 如果组件设置了 name 属性，将自己注册到自己的 components 选项中，这也是递归组件的原理
    if (name) {
      Sub.options.components[name] = Sub
    }

    // keep a reference to the super options at extension time.
    // later at instantiation we can check if Super's options have
    // been updated.
    Sub.superOptions = Super.options
    Sub.extendOptions = extendOptions
    Sub.sealedOptions = extend({}, Sub.options)

    // cache constructor
    // 把继承后的 Sub 缓存，好处： 当下次创建 Sub 时，发现已有，就直接使用
    cachedCtors[SuperId] = Sub
    return Sub
  }
}

function initProps (Comp) {
  const props = Comp.options.props
  for (const key in props) {
    proxy(Comp.prototype, `_props`, key)
  }
}

function initComputed (Comp) {
  const computed = Comp.options.computed
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key])
  }
}
