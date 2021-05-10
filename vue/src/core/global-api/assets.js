/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

// 定义全局 api：Vue.component、Vue.filter、Vue.directive
// 主要逻辑就是：往 Vue.options 上存放对应的配置
// 例如：Vue.filter('myFilter', func)，结果就是 Vue.options.filters.myFilter = func
// 最后，在 new Vue 的时候，通过 mergeOptions 将全局注册的组件合并到每个组件的配置对象中
export function initAssetRegisters (Vue: GlobalAPI) {
  // 创建注册方法
  ASSET_TYPES.forEach(type => {
    Vue[type] = function (
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      if (!definition) {
        return this.options[type + 's'][id]
      } else {
        /* istanbul ignore if */
        if (process.env.NODE_ENV !== 'production' && type === 'component') {
          validateComponentName(id)
        }

        if (type === 'component' && isPlainObject(definition)) {
          // 组件名称设置：组件配置中有 name，使用组件配置中的 name，没有，使用 id
          definition.name = definition.name || id
          // 通过Vue.extend() 创建子组件，返回子类构造器
          definition = this.options._base.extend(definition)
        }

        if (type === 'directive' && typeof definition === 'function') {
          definition = { bind: definition, update: definition }
        }

        // this.options.compoments[id] = definition
        // this.options.directives[id] = definition
        // this.options.filters[id] = definition
        // 在 new Vue 时通过 mergeOptions 将全局注册的组件合并到每个组件的配置对象中
        this.options[type + 's'][id] = definition
        return definition
      }
    }
  })
}
