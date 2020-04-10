import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

// Vue 本质： 实际就是一个 Function 实现的类
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
initMixin(Vue)        // 添加了 Vue.prototype._init, 初始化 Vue
stateMixin(Vue)       // Vue.prototype.$set 等
eventsMixin(Vue)      // 添加了 eventBus 相关的
lifecycleMixin(Vue)   // 添加了与生命周期相关的
renderMixin(Vue)      // render、nextTick... 

export default Vue
