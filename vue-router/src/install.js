import View from './components/view'
import Link from './components/link'

// 保存 Vue 的局部变量，并导出，使 vue-router 在任何地方都能访问到 Vue
export let _Vue

export function install (Vue) {
  // 如果是多次注册，就会 return 不会进行重复的注册
  if (install.installed && _Vue === Vue) return
  // install.installed = true 代表已经注册过
  install.installed = true

  // 因为在上面通过 export let _Vue 将 Vue 导出，使 vue-router 在任何时候都能访问到 Vue
  // 好处: 在其它模块中，可以导入这个 _Vue，这样既能访问到 Vue，又避免了将 Vue 做为依赖打包
  _Vue = Vue

  const isDef = v => v !== undefined

  const registerInstance = (vm, callVal) => {
    let i = vm.$options._parentVnode
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      i(vm, callVal)
    }
  }

  // 通过 Vue.mixin 去做全局混入，通过全局混入使得每一个组件
  // 当组件实例化执行到 beforeCreate、destroyed 钩子时都会执行这里定义的逻辑
  Vue.mixin({
    beforeCreate () {
      // 判断是否在 new Vue 的时候是否把 router 传入
      // 传进来了，会在 Vue.$options 上挂载有 router
      // new Vue({ el: 'app', router })
      if (isDef(this.$options.router)) {
        // 将 Vue 赋值给 this._routerRoot 
        this._routerRoot = this
        // 将传入的 router 赋值给 this._router
        this._router = this.$options.router 
        // 传入的 router 是通过 new VueRouter({mode: '', routes: [{}]}) 出来的
        // VueRouter 类身上有 init 方法，主要是进行 VueRouter 的初始化
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

  // 通过 Object.defineProperty 代理的方式往 Vue 原型上加入 $router 实例
  // 这样在使用的时候可以通过 this.$router 访问
  Object.defineProperty(Vue.prototype, '$router', {
    get () { return this._routerRoot._router }
  })

  // 通过 Object.defineProperty 代理的方式往 Vue 原型上加入 $route
  // 这样在使用的时候可以通过 this.$route 访问
  Object.defineProperty(Vue.prototype, '$route', {
    get () { return this._routerRoot._route }
  })

  // 全局注册 router-view 和 router-link 这两个组件
  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)

  // 设置路由组件的 beforeRouteEnter、beforeRouteLeave、beforeRouteUpdate 守卫的合并策略
  const strats = Vue.config.optionMergeStrategies
  // use the same hook merging strategy for route hooks
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}
