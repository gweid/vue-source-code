import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

// Vue 本质： 实际就是一个 Function 实现的类
// 通过 new Vue({ el: '#app', data: { msg: 'Hello Vue' } }]) // 初始化
// options 就是 new Vue 时传进来的参数
function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    // 判断如果不是通过 new 的方式调用，则抛出警告
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  // 初始化 Vue
  // options = {
  //   el: "#app",
  //   data: {},
  //   methods: {},
  //   ...
  // }
  this._init(options)
}

// 这些函数以 Vue 为参数传入，主要就是给 Vue 的原型 prototype 上扩展方法 
// 思想：把 Vue 原型挂载不同方法拆分成不同文件去实现，使代码层次分明

// 定义了 Vue.prototype._init, 初始化 Vue，实际上 new Vue 就是执行的这个方法
initMixin(Vue)

// Vue.prototype.$set Vue.prototype.$watch 等
stateMixin(Vue)

// 在 Vue 原型上，定义 $on, $once, $off, $emit 事件方法，并返回 vm
eventsMixin(Vue)

// 在 Vue.prototype 上定义 _update, $forceUpdate, $destroy 方法
lifecycleMixin(Vue)   // 添加了与生命周期相关的

// 在 Vue 原型上，定义 $nextTick 方法
// Vue原型上，定义 _render 方法
// _render方法会调用 vm.$createElement 创建虚拟 DOM，如果返回值 vnode 不是虚拟 DOM 类型，将创建一个空的虚拟 DOM
renderMixin(Vue)

export default Vue
