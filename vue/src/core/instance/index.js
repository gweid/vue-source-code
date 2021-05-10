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

// 定义了：
//  Vue.prototype.$data、Vue.prototype.$props
//  Vue.prototype.$set、Vue.prototype.$delete、Vue.prototype.$watch
stateMixin(Vue)

// 定义了事件播报相关方法：
//  Vue.prototype.$on, Vue.prototype.$once、Vue.prototype.$off、Vue.prototype.$emit
eventsMixin(Vue)

// 定义了：
//  Vue.prototype._update、Vue.prototype.$forceUpdate、Vue.prototype.$destroy
lifecycleMixin(Vue)

// 定义了：Vue.prototype.$nextTick、Vue.prototype._render
// _render方法会调用 vm.$createElement 创建虚拟 DOM，如果返回值 vnode 不是虚拟 DOM 类型，将创建一个空的虚拟 DOM
renderMixin(Vue)

export default Vue
