/* @flow */

import Regexp from 'path-to-regexp'
import { cleanPath } from './util/path'
import { assert, warn } from './util/warn'

export function createRouteMap (
  routes: Array<RouteConfig>,
  oldPathList?: Array<string>,
  oldPathMap?: Dictionary<RouteRecord>,
  oldNameMap?: Dictionary<RouteRecord>
): {
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>
} {

  // 若旧的路由相关映射列表及 map 存在，则使用旧的初始化（借此实现添加路由功能）
  // the path list is used to control path matching priority
  // 用于存储 routes 所有的 path
  const pathList: Array<string> = oldPathList || []
  // $flow-disable-line
  // 维护 path 与路由记录 RouteRecord 的映射
  const pathMap: Dictionary<RouteRecord> = oldPathMap || Object.create(null)
  // $flow-disable-line
  // 维护 name 与路由记录 RouteRecord 的映射
  const nameMap: Dictionary<RouteRecord> = oldNameMap || Object.create(null)

  // 遍历路由对象，通过 addRouteRecord 创建路由记录并更新 pathList、pathMap、nameMap
  routes.forEach(route => {
    addRouteRecord(pathList, pathMap, nameMap, route)
  })

  // ensure wildcard routes are always at the end
  // 确保通配路由在末尾，即 path: * 永远在在最后
  for (let i = 0, l = pathList.length; i < l; i++) {
    if (pathList[i] === '*') {
      pathList.push(pathList.splice(i, 1)[0])
      l--
      i--
    }
  }

  // 开发环境，提示非嵌套路由的 path 必须以 / 或者 * 开头
  if (process.env.NODE_ENV === 'development') {
    // warn if routes do not include leading slashes
    const found = pathList
    // check for missing leading slash
      .filter(path => path && path.charAt(0) !== '*' && path.charAt(0) !== '/')

    if (found.length > 0) {
      const pathNames = found.map(path => `- ${path}`).join('\n')
      warn(false, `Non-nested routes must include a leading slash character. Fix the following routes: \n${pathNames}`)
    }
  }

  return {
    pathList,
    pathMap,
    nameMap
  }
}

// interface RouteConfig = {
//   path: string,
//   component?: Component,
//   name?: string, // 命名路由
//   components?: { [name: string]: Component }, // 命名视图组件
//   redirect?: string | Location | Function,
//   props?: boolean | Object | Function,
//   alias?: string | Array<string>,
//   children?: Array<RouteConfig>, // 嵌套路由
//   beforeEnter?: (to: Route, from: Route, next: Function) => void,
//   meta?: any,

//   // 2.6.0+
//   caseSensitive?: boolean, // 匹配规则是否大小写敏感？(默认值：false)
//   pathToRegexpOptions?: Object // 编译正则的选项
// }
// routes = [{name: 'xx', path: 'xx/yy', meta: {}, component: Home}]
// routes = [{path: 'xx/yy', component: import(/* webpackChunkName: "mine" */ '../mine.vue') )}]
// 添加路由记录，并更新对应的 pathList、pathMap、nameMap
function addRouteRecord (
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>,
  route: RouteConfig,
  parent?: RouteRecord,
  matchAs?: string
) {
  // 拿到路由的路径和路由名
  // routes = [{name: 'xxx', path: '/xx/yy'}]
  const { path, name } = route

  if (process.env.NODE_ENV !== 'production') {
    assert(path != null, `"path" is required in a route configuration.`)
    assert(
      typeof route.component !== 'string',
      `route config "component" for path: ${String(
        path || name
      )} cannot be a ` + `string id. Use an actual component instead.`
    )
  }

  const pathToRegexpOptions: PathToRegexpOptions =
    route.pathToRegexpOptions || {}

  // 生成格式化后的 path，子路由会拼接上父路由的 path
  const normalizedPath = normalizePath(path, parent, pathToRegexpOptions.strict)

  // 匹配规则是否大小写敏感？(默认值：false)
  if (typeof route.caseSensitive === 'boolean') {
    pathToRegexpOptions.sensitive = route.caseSensitive
  }

  // 创建一条路由记录对象
  const record: RouteRecord = {
    path: normalizedPath, // 规范化后的路径
    // 利用 path-to-regexp 包生成用来匹配 path 的增强正则对象，可以用来匹配动态路由
    regex: compileRouteRegex(normalizedPath, pathToRegexpOptions),
    components: route.components || { default: route.component },
    instances: {}, // 保存router-view实例
    name,
    parent,
    matchAs,
    redirect: route.redirect, // 重定向的路由配置对象
    beforeEnter: route.beforeEnter, // 路由独享守卫
    meta: route.meta || {}, // 路由元信息
    props:
      route.props == null
        ? {}
        : route.components
          ? route.props
          : { default: route.props }
  }

  // 如果有子路由，递归子路由调用 addRouteRecord
  if (route.children) {
    // Warn if route is named, does not redirect and has a default child route.
    // If users navigate to this route by name, the default child will
    // not be rendered (GH Issue #629)
    if (process.env.NODE_ENV !== 'production') {
      if (
        route.name &&
        !route.redirect &&
        route.children.some(child => /^\/?$/.test(child.path))
      ) {
        warn(
          false,
          `Named Route '${route.name}' has a default child route. ` +
            `When navigating to this named route (:to="{name: '${
              route.name
            }'"), ` +
            `the default child route will not be rendered. Remove the name from ` +
            `this route and use the name of the default child route for named ` +
            `links instead.`
        )
      }
    }
    route.children.forEach(child => {
      const childMatchAs = matchAs
        ? cleanPath(`${matchAs}/${child.path}`)
        : undefined
      addRouteRecord(pathList, pathMap, nameMap, child, record, childMatchAs)
    })
  }

  // pathMap 中不存在当前路径，更新 pathList 和 pathMap
  if (!pathMap[record.path]) {
    // 将路径添加到 pathList 末尾
    pathList.push(record.path)
    // 将路由记录 record 加到 pathMap
    pathMap[record.path] = record
  }

  // 处理路由别名
  if (route.alias !== undefined) {
    // 路由别名支持单别名和多别名
    //   { path: '/root', component: Root, alias: '/root-alias' }
    //   { path: '/root', component: Root, alias: ['/root-alias', 'root'] }
    // 统一转换成数组形式
    const aliases = Array.isArray(route.alias) ? route.alias : [route.alias]

    // 遍历路由别名数组
    for (let i = 0; i < aliases.length; ++i) {
      const alias = aliases[i]

      // 检查别名和 path 是否重复
      if (process.env.NODE_ENV !== 'production' && alias === path) {
        warn(
          false,
          `Found an alias with the same value as the path: "${path}". You have to remove that alias. It will be ignored in development.`
        )
        // skip in dev to make it work
        continue
      }

      // 生成别名路由配置对象
      const aliasRoute = {
        path: alias,
        children: route.children
      }

      // 添加别名路由记录
      // 这里是对别名路由单独生成一份路由对象，也就是说：
      // 一旦配置了别名，路由会有两份路由对象，一份是正常的，一份是带有别名的
      addRouteRecord(
        pathList,
        pathMap,
        nameMap,
        aliasRoute,
        parent,
        record.path || '/' // matchAs
      )
    }
  }

  // 处理命名路由
  if (name) {
    if (!nameMap[name]) {
      // 更新 nameMap
      nameMap[name] = record
    } else if (process.env.NODE_ENV !== 'production' && !matchAs) {
      warn(
        false,
        `Duplicate named routes definition: ` +
          `{ name: "${name}", path: "${record.path}" }`
      )
    }
  }
}

function compileRouteRegex (
  path: string,
  pathToRegexpOptions: PathToRegexpOptions
): RouteRegExp {
  const regex = Regexp(path, [], pathToRegexpOptions)
  if (process.env.NODE_ENV !== 'production') {
    const keys: any = Object.create(null)
    regex.keys.forEach(key => {
      warn(
        !keys[key.name],
        `Duplicate param keys in route with path: "${path}"`
      )
      keys[key.name] = true
    })
  }
  return regex
}

function normalizePath (
  path: string,
  parent?: RouteRecord,
  strict?: boolean
): string {
  if (!strict) path = path.replace(/\/$/, '')
  if (path[0] === '/') return path
  if (parent == null) return path
  return cleanPath(`${parent.path}/${path}`)
}
