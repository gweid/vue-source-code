import View from './components/view'
import Link from './components/link'

export let _Vue

export function install (Vue) {
  // 如果是多次注册，就会 return 不会进行重复的注册
  if (install.installed && _Vue === Vue) return
  // install.installed = true 代表已经注册过
  install.installed = true

  // 因为在上面通过 export let _Vue 将 Vue 导出，使 vue-router 在任何时候都能访问到 Vue，所以将 Vue 保存到 _Vue
  _Vue = Vue

  const isDef = v => v !== undefined

  const registerInstance = (vm, callVal) => {
    let i = vm.$options._parentVnode
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      i(vm, callVal)
    }
  }

  /**
   * 通过 Vue.mixin 去做全局混入，通过全局混入使得每一个组件执行 beforeCreate、destroyed 都会执行这里的 
   * beforeCreate、destroyed 定义的逻辑
   */
  Vue.mixin({
    beforeCreate () {
      // 判断是否在 new Vue 的时候是否把 router 传入
      // new Vue({ el: 'app', router })
      if (isDef(this.$options.router)) {
        this._routerRoot = this  // 将 Vue 赋值给 this._routerRoot 
        this._router = this.$options.router // 将传入的 router 赋值给 this._router
        this._router.init(this)
        // 将 _route 变成响应式的
        Vue.util.defineReactive(this, '_route', this._router.history.current)
      } else {
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }
      registerInstance(this, this)
    },
    destroyed () {
      registerInstance(this)
    }
  })

  // 定义了原型上的 $router 实例
  Object.defineProperty(Vue.prototype, '$router', {
    get () { return this._routerRoot._router }
  })

  // // 定义了原型上的 $route 参数
  Object.defineProperty(Vue.prototype, '$route', {
    get () { return this._routerRoot._route }
  })

  // 注册 router-view 和 router-link 这两个组件
  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)

  const strats = Vue.config.optionMergeStrategies
  // use the same hook merging strategy for route hooks
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}
