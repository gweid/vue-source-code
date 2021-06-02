/* @flow */

import type VueRouter from './index'
import { resolvePath } from './util/path'
import { assert, warn } from './util/warn'
import { createRoute } from './util/route'
import { fillParams } from './util/params'
import { createRouteMap } from './create-route-map'
import { normalizeLocation } from './util/location'

export type Matcher = {
  match: (raw: RawLocation, current?: Route, redirectedFrom?: Location) => Route;
  addRoutes: (routes: Array<RouteConfig>) => void;
};

export function createMatcher (routes: Array<RouteConfig>, router: VueRouter): Matcher {
  // 创建路由映射表
  const { pathList, pathMap, nameMap } = createRouteMap(routes)

  // 动态添加路由
  function addRoutes (routes) {
    createRouteMap(routes, pathList, pathMap, nameMap)
  }

  // 路由匹配
  function match (
    raw: RawLocation, // 目标 url
    currentRoute?: Route, // 当前 url 对应的 route 路由对象
    redirectedFrom?: Location // 代表从哪个地址重定向过来的
  ): Route {
    // 解析当前 url、路由对象，得到包含 hash、path、query 和 name 等信息对象 location
    const location = normalizeLocation(raw, currentRoute, false, router)
    const { name } = location

    // 如果是命名路由
    if (name) {
      // 获取路由记录
      const record = nameMap[name]
      if (process.env.NODE_ENV !== 'production') {
        warn(record, `Route with name '${name}' does not exist`)
      }
      // 找不到匹配的路由记录，创建一个没有路由记录的 Route 返回
      if (!record) return _createRoute(null, location)

      // 获取动态路由参数名
      const paramNames = record.regex.keys
        .filter(key => !key.optional)
        .map(key => key.name)

      // location 对象没有 params，创建，用来存储动态路由参数的值
      if (typeof location.params !== 'object') {
        location.params = {}
      }

      // 提取当前 Route 中符合动态路由参数名的值赋值给 location 的 params
      // currentRoute：当前 url 对应的 route 路由对象
      if (currentRoute && typeof currentRoute.params === 'object') {
        for (const key in currentRoute.params) {
          if (!(key in location.params) && paramNames.indexOf(key) > -1) {
            location.params[key] = currentRoute.params[key]
          }
        }
      }

      location.path = fillParams(record.path, location.params, `named route "${name}"`)

      // 创建 Route（注意与路由记录的差别），返回
      return _createRoute(record, location, redirectedFrom)
    } else if (location.path) {
      // 不是命名路由，而是路径模式
      location.params = {}
      // 这里会遍历 pathList，因此命名路由的 record 查找效率更高
      for (let i = 0; i < pathList.length; i++) {
        const path = pathList[i]
        const record = pathMap[path]
        if (matchRoute(record.regex, location.path, location.params)) {
          // 找到匹配的路由记录 record，生成对应 Route，返回
          return _createRoute(record, location, redirectedFrom)
        }
      }
    }

    // 没有匹配到的情况，创建一个没有路由记录的 Route 返回
    return _createRoute(null, location)
  }

  function redirect (
    record: RouteRecord,
    location: Location
  ): Route {
    const originalRedirect = record.redirect
    let redirect = typeof originalRedirect === 'function'
      ? originalRedirect(createRoute(record, location, null, router))
      : originalRedirect

    if (typeof redirect === 'string') {
      redirect = { path: redirect }
    }

    if (!redirect || typeof redirect !== 'object') {
      if (process.env.NODE_ENV !== 'production') {
        warn(
          false, `invalid redirect option: ${JSON.stringify(redirect)}`
        )
      }
      return _createRoute(null, location)
    }

    const re: Object = redirect
    const { name, path } = re
    let { query, hash, params } = location
    query = re.hasOwnProperty('query') ? re.query : query
    hash = re.hasOwnProperty('hash') ? re.hash : hash
    params = re.hasOwnProperty('params') ? re.params : params

    if (name) {
      // resolved named direct
      const targetRecord = nameMap[name]
      if (process.env.NODE_ENV !== 'production') {
        assert(targetRecord, `redirect failed: named route "${name}" not found.`)
      }
      return match({
        _normalized: true,
        name,
        query,
        hash,
        params
      }, undefined, location)
    } else if (path) {
      // 1. resolve relative redirect
      const rawPath = resolveRecordPath(path, record)
      // 2. resolve params
      const resolvedPath = fillParams(rawPath, params, `redirect route with path "${rawPath}"`)
      // 3. rematch with existing query and hash
      return match({
        _normalized: true,
        path: resolvedPath,
        query,
        hash
      }, undefined, location)
    } else {
      if (process.env.NODE_ENV !== 'production') {
        warn(false, `invalid redirect option: ${JSON.stringify(redirect)}`)
      }
      return _createRoute(null, location)
    }
  }

  function alias (
    record: RouteRecord,
    location: Location,
    matchAs: string
  ): Route {
    const aliasedPath = fillParams(matchAs, location.params, `aliased route with path "${matchAs}"`)
    const aliasedMatch = match({
      _normalized: true,
      path: aliasedPath
    })
    if (aliasedMatch) {
      const matched = aliasedMatch.matched
      const aliasedRecord = matched[matched.length - 1]
      location.params = aliasedMatch.params
      return _createRoute(aliasedRecord, location)
    }
    return _createRoute(null, location)
  }

  // _createRoute 根据 RouteRecord 执行相关的路由操作，最后返回Route对象
  function _createRoute (record: ?RouteRecord,location: Location,redirectedFrom?: Location): Route {
    // 处理重定向路由
    if (record && record.redirect) {
      return redirect(record, redirectedFrom || location)
    }
    // 处理别名路由
    if (record && record.matchAs) {
      return alias(record, location, record.matchAs)
    }
    // 其余的调用 createRoute 生成 Route 对象
    return createRoute(record, location, redirectedFrom, router)
  }

  return {
    match,
    addRoutes
  }
}

function matchRoute (
  regex: RouteRegExp,
  path: string,
  params: Object
): boolean {
  const m = path.match(regex)

  if (!m) {
    return false
  } else if (!params) {
    return true
  }

  for (let i = 1, len = m.length; i < len; ++i) {
    const key = regex.keys[i - 1]
    const val = typeof m[i] === 'string' ? decodeURIComponent(m[i]) : m[i]
    if (key) {
      // Fix #1994: using * with props: true generates a param named 0
      params[key.name || 'pathMatch'] = val
    }
  }

  return true
}

function resolveRecordPath (path: string, record: RouteRecord): string {
  return resolvePath(path, record.parent ? record.parent.path : '/', true)
}
