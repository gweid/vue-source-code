export default function (Vue) {
  // 获取 vue 的版本
  const version = Number(Vue.version.split('.')[0])

  if (version >= 2) {
    // 通过在每一个组件的 beforeCreate 生命周期混入 vuexInit
    // vuexInit 就是使每个 Vue 的实例对象，都有一个 $store 属性
    // 但是注意的是，这里只是将 vuexInit 初始化函数挂载到 beforeCreate 上
    // 真正开始执行 vuexInit 会是：
    //  1、new Vue({ el: '#app', store }) 挂载 vue 根 <App /> 的时候，执行 beforeCreate
    //  2、在每个组件实例化的时候，执行 beforeCreate
    Vue.mixin({
      beforeCreate: vuexInit
    })
  } else {
    // 兼容 vue1.x 版本（不用太过关注）
    // override init and inject vuex init procedure
    // for 1.x backwards compatibility.
    const _init = Vue.prototype._init
    Vue.prototype._init = function (options = {}) {
      options.init = options.init ? [vuexInit].concat(options.init) :
        vuexInit
      _init.call(this, options)
    }
  }

  /**
   * Vuex init hook, injected into each instances init hooks list.
   */
  // 最终每个 Vue 的实例对象，都有一个 $store 属性。且是同一个 Store 实例
  // 这也是为什么在每一个组件内部都可以通过 this.$store.xxx 调用的原因
  // 在进行根组件实例化的时候，通过 new Vue({ el: '#app', store }) 的方式将 store 对象放到 vue.$options 上
  function vuexInit() {
    // 这里的 this.$options 是当前组件实例的 options
    const options = this.$options
    // store injection
    // store 注入到 Vue 实例中
    // 下面两种做法都是：保证在任意组件访问 $store 属性都指向同一个 store 对象
    if (options.store) {
      // 若当前组件的 $options 上已存在 store，则将 $options.store 赋值给 this.$store
      // 这个是用于根组件的，因为根组件在 new Vue({ el: '#app', store }) 时会有 store 在 options 上
      this.$store = typeof options.store === 'function' ?
        options.store() :
        options.store
    } else if (options.parent && options.parent.$store) {
      // 当前组件的 $options 上没有 store，则获取父组件上的 $store，并将其赋值给 this.$store
      // 这个是用于子组件
      this.$store = options.parent.$store
    }
  }
}