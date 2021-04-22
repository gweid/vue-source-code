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

      // 当支持__proto__时，执行 protoAugment 会将当前数组的原型指向新的数组类 arrayMethods,
      // 如果不支持__proto__，则通过代理设置，在访问数组方法时代理访问新数组类中的数组方法
      // 通过上面两步，接下来在实例内部调用 push, unshift 等数组的方法时，会执行 arrayMethods 类的方法
      // 这也是数组进行依赖收集和派发更新的前提
      if (hasProto) { // export const hasProto = '__proto__' in {}
        // hasProto 用来判断当前环境下是否支持__proto__属性
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
    for (let i = 0, l = items.length; i < l; i++) {
      // 遍历对数组的每一个元素进行观察
      observe(items[i]);
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
// 直接通过原型指向的方式
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
// 通过数据代理的方式
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
      const value = getter ? getter.call(obj) : val;

      // Dep.target 是 Dep 的一个静态属性，值是 watcher，在 new Watcher 的时候设置
      // 在 new Watcher 时会执行回调函数 updateComponent
      // 回调函数中如果有 vm.key 的读取行为，会触发这里进行读取拦截，收集依赖
      // 回调函数执行完以后又会将 Dep.target 设置为 null，避免这里重复收集依赖
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
export function set(target: Array < any > | Object, key: any, val: any): any {
  if (
    process.env.NODE_ENV !== "production" &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(
      `Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`
    );
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key);
    target.splice(key, 1, val);
    return val;
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val;
    return val;
  }
  const ob = (target: any).__ob__;
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== "production" &&
      warn(
        "Avoid adding reactive properties to a Vue instance or its root $data " +
        "at runtime - declare it upfront in the data option."
      );
    return val;
  }
  if (!ob) {
    target[key] = val;
    return val;
  }
  defineReactive(ob.value, key, val);
  ob.dep.notify();
  return val;
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del(target: Array < any > | Object, key: any) {
  if (
    process.env.NODE_ENV !== "production" &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(
      `Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`
    );
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1);
    return;
  }
  const ob = (target: any).__ob__;
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== "production" &&
      warn(
        "Avoid deleting properties on a Vue instance or its root $data " +
        "- just set it to null."
      );
    return;
  }
  if (!hasOwn(target, key)) {
    return;
  }
  delete target[key];
  if (!ob) {
    return;
  }
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
