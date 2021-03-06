/* @flow */

import Dep from "./dep";
import VNode from "../vdom/vnode";
import {
  arrayMethods
} from "./array";
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering,
} from "../util/index";

const arrayKeys = Object.getOwnPropertyNames(arrayMethods);

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true;

export function toggleObserving(value: boolean) {
  shouldObserve = value;
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor(value: any) {
    this.value = value;
    // 实例化一个 Dep
    this.dep = new Dep();
    this.vmCount = 0;

    // 在 value 对象上设置 __ob__ 属性
    // 代表当前 value 已经存在观察者实例，已经被观察
    def(value, "__ob__", this);

    if (Array.isArray(value)) {
      // 如果是数组

      // 当支持 __proto__ 时，执行 protoAugment 会将当前数组的原型指向新的数组类 arrayMethods,
      // 如果不支持 __proto__，则通过 copyAugment 代理设置，在访问数组方法时代理访问新数组 arrayMethods 中的数组方法
      // 通过上面两步，接下来在实例内部调用 push, unshift 等数组的方法时，会执行 arrayMethods 类的方法
      // 这也是数组进行依赖收集和派发更新的前提
      if (hasProto) { // export const hasProto = '__proto__' in {}
        // hasProto 用来判断当前环境下是否支持 __proto__ 属性
        // protoAugment 是通过原型指向的方式，将数组指定的七个方法指向 arrayMethods
        protoAugment(value, arrayMethods);
      } else {
        // copyAugment 通过数据代理的方式, 将数组指定的七个方法指向 arrayMethods
        copyAugment(value, arrayMethods, arrayKeys);
      }

      // 调用 this.observeArray 遍历数组，为数组的每一项设置观察，处理数组元素为对象的情况
      this.observeArray(value);
    } else {
      // 如果是对象
      this.walk(value);
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  // 调用 defineReactive 实现 Object.defineProperty 对 value 进行劫持
  walk(obj: Object) {
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i]);
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray(items: Array < any > ) {
    // 遍历数组，对里面的的每一个元素进行观察
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i]);
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
// 通过更改原型指向的方式
function protoAugment(target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src;
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
// 通过 Object.defineProperty 代理的方式
function copyAugment(target: Object, src: Object, keys: Array < string > ) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i];
    def(target, key, src[key]);
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
// 为对象创建一个观察者实例
// 如果该对象已经被观察，那么返回已有的观察者实例，否则创建新的观察者实例
export function observe(value: any, asRootData: ? boolean): Observer | void {
  // 必须是 object 类型，还有不能是 VNode
  // 也就是说非对象、VNode类型都不做响应式处理
  if (!isObject(value) || value instanceof VNode) {
    return;
  }

  let ob: Observer | void;

  if (hasOwn(value, "__ob__") && value.__ob__ instanceof Observer) {
    // 如果 value 对象存在观察者实例 __ob__ ，表示已经被观察，直接返回观察者实例 __ob__
    ob = value.__ob__;
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    // 通过 new Observer 创建观察者实例
    // new Observer 的时候会执行 Observer 类的构造函数 constructor
    // Observer 构造函数里面会执行 Observer.walk 调用 defineReactive 执行 Object.defineProperty 进行数据劫持
    ob = new Observer(value);
  }
  if (asRootData && ob) {
    ob.vmCount++;
  }
  return ob;
}

/**
 * Define a reactive property on an Object.
 */
/**
 * 拦截 obj[key] 的读取和设置操作：
 *   1、在第一次读取时收集依赖，比如执行 render 函数生成虚拟 DOM 时会有读取操作
 *   2、在更新时设置新值并通知依赖更新
 */
export function defineReactive(
  obj: Object,
  key: string,
  val: any,
  customSetter ? : ? Function,
  shallow ? : boolean
) {
  // 创建一个 dep 实例
  const dep = new Dep();

  // obj[key] 的属性描述符，发现它是不可配置对象的话直接 return
  // js 对象属性 configurable = false 表示不可通过 delete 删除
  const property = Object.getOwnPropertyDescriptor(obj, key);
  if (property && property.configurable === false) {
    return;
  }

  // 保存记录 getter 和 setter，获取值 val
  const getter = property && property.get;
  const setter = property && property.set;
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key];
  }

  // 当 val 即 obj[key] 的值为对象的情况，递归调用 observe，保证对象中的所有 key 都被观察
  let childOb = !shallow && observe(val);

  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    // get 拦截 obj[key] 读取操作，做依赖收集
    get: function reactiveGetter() {
      // 先获取值，如果已经收集过依赖，那么就不需要再重复收集，在最后直接返回即可
      const value = getter ? getter.call(obj) : val;

      // Dep.target 是 Dep 的一个静态属性，值是 watcher，在 new Watcher 的时候设置
      // 在 new Watcher 时会执行回调函数 updateComponent
      // 回调函数中如果有 vm.key 的读取行为，会触发这里进行读取拦截，收集依赖
      // 回调函数执行完以后又会将 Dep.target 设置为 null，避免这里重复收集依赖
      // 也就是说，data 只有在首次渲染的时候才会去收集依赖 watcher
      if (Dep.target) {
        // 依赖收集，在 dep 中添加 watcher
        // 一个组件一个 watcher，如果用户手动创建 watcher 比如 watch 选 this.$watch
        dep.depend();
        if (childOb) {
          // 对象中嵌套对象的观察者对象，如果存在也对其进行依赖收集
          childOb.dep.depend();
          if (Array.isArray(value)) {
            // 如果数组元素是数组或者对象，递归去为内部的元素收集相关的依赖
            dependArray(value);
          }
        }
      }
      return value;
    },
    // 主要做派发更新
    set: function reactiveSetter(newVal) {
      // 先获取旧的值
      const value = getter ? getter.call(obj) : val;
      /* eslint-disable no-self-compare */
      // 如果新值和旧值一样时，return，不会触发响应式更新
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return;
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== "production" && customSetter) {
        customSetter();
      }

      // setter 不存在说明该属性是一个只读属性，直接 return
      if (getter && !setter) return;
      // 设置新值
      if (setter) {
        setter.call(obj, newVal);
      } else {
        val = newVal;
      }
      // 对新值进行观察，让新值也是响应式的
      childOb = !shallow && observe(newVal);
      // 依赖派发，通知更新
      dep.notify();
    },
  });
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
// 通过 Vue.set 或 this.$set 设置 target[key] = val
export function set(target: Array < any > | Object, key: any, val: any): any {
  if (
    process.env.NODE_ENV !== "production" &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(
      `Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`
    );
  }

  // 如果 target 是数组，利用数组的 splice 变异方法触发响应式
  // Vue.set([1,2,3], 1, 5)
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 修改数组的长度, 避免数组索引 key 大于数组长度导致 splcie() 执行有误
    target.length = Math.max(target.length, key);

    target.splice(key, 1, val);
    return val;
  }

  // 如果 key 已经存在 target 中，更新 target[key] 的值为 val
  if (key in target && !(key in Object.prototype)) {
    target[key] = val;
    return val;
  }

  // 读取一下 target.__ob__，这个主要用来判断 target 是否是响应式对象
  const ob = (target: any).__ob__;

  // 需要操作的目标对象不能是 Vue 实例或 Vue 实例的根数据对象
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== "production" &&
      warn(
        "Avoid adding reactive properties to a Vue instance or its root $data " +
        "at runtime - declare it upfront in the data option."
      );
    return val;
  }

  // 当 target 不是响应式对象，并且对象本身不存在这个新属性 key
  // 新属性会被设置，但是不会做响应式处理
  if (!ob) {
    target[key] = val;
    return val;
  }

  // target 是响应式对象，并且对象本身不存在这个新属性 key
  // 给对象定义新属性，通过 defineReactive 方法将新属性设置为响应式
  // ob.dep.notify 通知更新
  defineReactive(ob.value, key, val);
  ob.dep.notify();
  return val;
}

/**
 * Delete a property and trigger change if necessary.
 */
// 通过 Vue.delete 或 vm.$delete 将 target 的 key 属性删除
export function del(target: Array < any > | Object, key: any) {
  if (
    process.env.NODE_ENV !== "production" &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(
      `Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`
    );
  }

  // 如果 target 是数组，通过数组的变异方法 splice 删除对应对应的 key 项，并且触发响应式更新
  // Vue.delete([1,2,3], 1)
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1);
    return;
  }

  // 读取一下 target.__ob__，这个主要用来判断 target 是否是响应式对象
  const ob = (target: any).__ob__;

  // 需要操作的目标对象不能是 Vue 实例或 Vue 实例的根数据对象
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== "production" &&
      warn(
        "Avoid deleting properties on a Vue instance or its root $data " +
        "- just set it to null."
      );
    return;
  }

  // 如果 target 上不存在 key 属性，直接结束
  if (!hasOwn(target, key)) {
    return;
  }

  // 直接通过 delete 删除对象的 key 项
  delete target[key];
  // target 不是响应式对象，不需要通知更新
  if (!ob) {
    return;
  }
  // target 是响应式，通知更新
  ob.dep.notify();
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray(value: Array < any > ) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i];
    e && e.__ob__ && e.__ob__.dep.depend();
    if (Array.isArray(e)) {
      dependArray(e);
    }
  }
}
