var jt=typeof globalThis<"u"?globalThis:typeof window<"u"?window:typeof global<"u"?global:typeof self<"u"?self:{};function pt(t){return t&&t.__esModule&&Object.prototype.hasOwnProperty.call(t,"default")?t.default:t}var ft={exports:{}},d={};/**
 * @license React
 * react.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var W=Symbol.for("react.element"),zt=Symbol.for("react.portal"),Dt=Symbol.for("react.fragment"),Ht=Symbol.for("react.strict_mode"),Ot=Symbol.for("react.profiler"),Lt=Symbol.for("react.provider"),At=Symbol.for("react.context"),qt=Symbol.for("react.forward_ref"),Et=Symbol.for("react.suspense"),Vt=Symbol.for("react.memo"),Rt=Symbol.for("react.lazy"),ut=Symbol.iterator;function Tt(t){return t===null||typeof t!="object"?null:(t=ut&&t[ut]||t["@@iterator"],typeof t=="function"?t:null)}var kt={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},Mt=Object.assign,vt={};function R(t,e,c){this.props=t,this.context=e,this.refs=vt,this.updater=c||kt}R.prototype.isReactComponent={};R.prototype.setState=function(t,e){if(typeof t!="object"&&typeof t!="function"&&t!=null)throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,t,e,"setState")};R.prototype.forceUpdate=function(t){this.updater.enqueueForceUpdate(this,t,"forceUpdate")};function _t(){}_t.prototype=R.prototype;function rt(t,e,c){this.props=t,this.context=e,this.refs=vt,this.updater=c||kt}var at=rt.prototype=new _t;at.constructor=rt;Mt(at,R.prototype);at.isPureReactComponent=!0;var ht=Array.isArray,mt=Object.prototype.hasOwnProperty,ot={current:null},$t={key:!0,ref:!0,__self:!0,__source:!0};function gt(t,e,c){var i,y={},f=null,v=null;if(e!=null)for(i in e.ref!==void 0&&(v=e.ref),e.key!==void 0&&(f=""+e.key),e)mt.call(e,i)&&!$t.hasOwnProperty(i)&&(y[i]=e[i]);var p=arguments.length-2;if(p===1)y.children=c;else if(1<p){for(var k=Array(p),M=0;M<p;M++)k[M]=arguments[M+2];y.children=k}if(t&&t.defaultProps)for(i in p=t.defaultProps,p)y[i]===void 0&&(y[i]=p[i]);return{$$typeof:W,type:t,key:f,ref:v,props:y,_owner:ot.current}}function Pt(t,e){return{$$typeof:W,type:t.type,key:e,ref:t.ref,props:t.props,_owner:t._owner}}function ct(t){return typeof t=="object"&&t!==null&&t.$$typeof===W}function It(t){var e={"=":"=0",":":"=2"};return"$"+t.replace(/[=:]/g,function(c){return e[c]})}var lt=/\/+/g;function et(t,e){return typeof t=="object"&&t!==null&&t.key!=null?It(""+t.key):e.toString(36)}function J(t,e,c,i,y){var f=typeof t;(f==="undefined"||f==="boolean")&&(t=null);var v=!1;if(t===null)v=!0;else switch(f){case"string":case"number":v=!0;break;case"object":switch(t.$$typeof){case W:case zt:v=!0}}if(v)return v=t,y=y(v),t=i===""?"."+et(v,0):i,ht(y)?(c="",t!=null&&(c=t.replace(lt,"$&/")+"/"),J(y,e,c,"",function(M){return M})):y!=null&&(ct(y)&&(y=Pt(y,c+(!y.key||v&&v.key===y.key?"":(""+y.key).replace(lt,"$&/")+"/")+t)),e.push(y)),1;if(v=0,i=i===""?".":i+":",ht(t))for(var p=0;p<t.length;p++){f=t[p];var k=i+et(f,p);v+=J(f,e,c,k,y)}else if(k=Tt(t),typeof k=="function")for(t=k.call(t),p=0;!(f=t.next()).done;)f=f.value,k=i+et(f,p++),v+=J(f,e,c,k,y);else if(f==="object")throw e=String(t),Error("Objects are not valid as a React child (found: "+(e==="[object Object]"?"object with keys {"+Object.keys(t).join(", ")+"}":e)+"). If you meant to render a collection of children, use an array instead.");return v}function Z(t,e,c){if(t==null)return t;var i=[],y=0;return J(t,i,"","",function(f){return e.call(c,f,y++)}),i}function Wt(t){if(t._status===-1){var e=t._result;e=e(),e.then(function(c){(t._status===0||t._status===-1)&&(t._status=1,t._result=c)},function(c){(t._status===0||t._status===-1)&&(t._status=2,t._result=c)}),t._status===-1&&(t._status=0,t._result=e)}if(t._status===1)return t._result.default;throw t._result}var S={current:null},Q={transition:null},Yt={ReactCurrentDispatcher:S,ReactCurrentBatchConfig:Q,ReactCurrentOwner:ot};function wt(){throw Error("act(...) is not supported in production builds of React.")}d.Children={map:Z,forEach:function(t,e,c){Z(t,function(){e.apply(this,arguments)},c)},count:function(t){var e=0;return Z(t,function(){e++}),e},toArray:function(t){return Z(t,function(e){return e})||[]},only:function(t){if(!ct(t))throw Error("React.Children.only expected to receive a single React element child.");return t}};d.Component=R;d.Fragment=Dt;d.Profiler=Ot;d.PureComponent=rt;d.StrictMode=Ht;d.Suspense=Et;d.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=Yt;d.act=wt;d.cloneElement=function(t,e,c){if(t==null)throw Error("React.cloneElement(...): The argument must be a React element, but you passed "+t+".");var i=Mt({},t.props),y=t.key,f=t.ref,v=t._owner;if(e!=null){if(e.ref!==void 0&&(f=e.ref,v=ot.current),e.key!==void 0&&(y=""+e.key),t.type&&t.type.defaultProps)var p=t.type.defaultProps;for(k in e)mt.call(e,k)&&!$t.hasOwnProperty(k)&&(i[k]=e[k]===void 0&&p!==void 0?p[k]:e[k])}var k=arguments.length-2;if(k===1)i.children=c;else if(1<k){p=Array(k);for(var M=0;M<k;M++)p[M]=arguments[M+2];i.children=p}return{$$typeof:W,type:t.type,key:y,ref:f,props:i,_owner:v}};d.createContext=function(t){return t={$$typeof:At,_currentValue:t,_currentValue2:t,_threadCount:0,Provider:null,Consumer:null,_defaultValue:null,_globalName:null},t.Provider={$$typeof:Lt,_context:t},t.Consumer=t};d.createElement=gt;d.createFactory=function(t){var e=gt.bind(null,t);return e.type=t,e};d.createRef=function(){return{current:null}};d.forwardRef=function(t){return{$$typeof:qt,render:t}};d.isValidElement=ct;d.lazy=function(t){return{$$typeof:Rt,_payload:{_status:-1,_result:t},_init:Wt}};d.memo=function(t,e){return{$$typeof:Vt,type:t,compare:e===void 0?null:e}};d.startTransition=function(t){var e=Q.transition;Q.transition={};try{t()}finally{Q.transition=e}};d.unstable_act=wt;d.useCallback=function(t,e){return S.current.useCallback(t,e)};d.useContext=function(t){return S.current.useContext(t)};d.useDebugValue=function(){};d.useDeferredValue=function(t){return S.current.useDeferredValue(t)};d.useEffect=function(t,e){return S.current.useEffect(t,e)};d.useId=function(){return S.current.useId()};d.useImperativeHandle=function(t,e,c){return S.current.useImperativeHandle(t,e,c)};d.useInsertionEffect=function(t,e){return S.current.useInsertionEffect(t,e)};d.useLayoutEffect=function(t,e){return S.current.useLayoutEffect(t,e)};d.useMemo=function(t,e){return S.current.useMemo(t,e)};d.useReducer=function(t,e,c){return S.current.useReducer(t,e,c)};d.useRef=function(t){return S.current.useRef(t)};d.useState=function(t){return S.current.useState(t)};d.useSyncExternalStore=function(t,e,c){return S.current.useSyncExternalStore(t,e,c)};d.useTransition=function(){return S.current.useTransition()};d.version="18.3.1";ft.exports=d;var O=ft.exports;const G=pt(O);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const xt=(...t)=>t.filter((e,c,i)=>!!e&&e.trim()!==""&&i.indexOf(e)===c).join(" ").trim();/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ut=t=>t.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase();/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Bt=t=>t.replace(/^([A-Z])|[\s-_]+(\w)/g,(e,c,i)=>i?i.toUpperCase():c.toLowerCase());/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const dt=t=>{const e=Bt(t);return e.charAt(0).toUpperCase()+e.slice(1)};/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var nt={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ft=t=>{for(const e in t)if(e.startsWith("aria-")||e==="role"||e==="title")return!0;return!1},Zt=O.createContext({}),Gt=()=>O.useContext(Zt),Jt=O.forwardRef(({color:t,size:e,strokeWidth:c,absoluteStrokeWidth:i,className:y="",children:f,iconNode:v,...p},k)=>{const{size:M=24,strokeWidth:z=2,absoluteStrokeWidth:g=!1,color:E="currentColor",className:N=""}=Gt()??{},D=i??g?Number(c??z)*24/Number(e??M):c??z;return O.createElement("svg",{ref:k,...nt,width:e??M??nt.width,height:e??M??nt.height,stroke:t??E,strokeWidth:D,className:xt("lucide",N,y),...!f&&!Ft(p)&&{"aria-hidden":"true"},...p},[...v.map(([Y,K])=>O.createElement(Y,K)),...Array.isArray(f)?f:[f]])});/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const o=(t,e)=>{const c=O.forwardRef(({className:i,...y},f)=>O.createElement(Jt,{ref:f,iconNode:e,className:xt(`lucide-${Ut(dt(t))}`,`lucide-${t}`,i),...y}));return c.displayName=dt(t),c};/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Qt=[["rect",{width:"20",height:"12",x:"2",y:"6",rx:"2",key:"9lu3g6"}],["circle",{cx:"12",cy:"12",r:"2",key:"1c9p78"}],["path",{d:"M6 12h.01M18 12h.01",key:"113zkx"}]],h1=o("banknote",Qt);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Kt=[["path",{d:"M17 11h1a3 3 0 0 1 0 6h-1",key:"1yp76v"}],["path",{d:"M9 12v6",key:"1u1cab"}],["path",{d:"M13 12v6",key:"1sugkk"}],["path",{d:"M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5Z",key:"1510fo"}],["path",{d:"M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8",key:"19jb7n"}]],l1=o("beer",Kt);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Xt=[["path",{d:"M12 7v14",key:"1akyts"}],["path",{d:"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z",key:"ruj8y"}]],d1=o("book-open",Xt);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const te=[["path",{d:"M12 11v4",key:"a6ujw6"}],["path",{d:"M14 13h-4",key:"1pl8zg"}],["path",{d:"M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2",key:"1ksdt3"}],["path",{d:"M18 6v14",key:"1mu4gy"}],["path",{d:"M6 6v14",key:"1s15cj"}],["rect",{width:"20",height:"14",x:"2",y:"6",rx:"2",key:"i6l2r4"}]],y1=o("briefcase-medical",te);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ee=[["path",{d:"M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16",key:"jecpp"}],["rect",{width:"20",height:"14",x:"2",y:"6",rx:"2",key:"i6l2r4"}]],p1=o("briefcase",ee);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ne=[["path",{d:"M8 6v6",key:"18i7km"}],["path",{d:"M15 6v6",key:"1sg6z9"}],["path",{d:"M2 12h19.6",key:"de5uta"}],["path",{d:"M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3",key:"1wwztk"}],["circle",{cx:"7",cy:"18",r:"2",key:"19iecd"}],["path",{d:"M9 18h5",key:"lrx6i"}],["circle",{cx:"16",cy:"18",r:"2",key:"1v4tcr"}]],f1=o("bus",ne);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const re=[["path",{d:"M8 2v4",key:"1cmpym"}],["path",{d:"M16 2v4",key:"4m81vk"}],["rect",{width:"18",height:"18",x:"3",y:"4",rx:"2",key:"1hopcy"}],["path",{d:"M3 10h18",key:"8toen8"}],["path",{d:"M8 14h.01",key:"6423bh"}],["path",{d:"M12 14h.01",key:"1etili"}],["path",{d:"M16 14h.01",key:"1gbofw"}],["path",{d:"M8 18h.01",key:"lrp35t"}],["path",{d:"M12 18h.01",key:"mhygvu"}],["path",{d:"M16 18h.01",key:"kzsmim"}]],k1=o("calendar-days",re);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ae=[["path",{d:"M8 2v4",key:"1cmpym"}],["path",{d:"M16 2v4",key:"4m81vk"}],["rect",{width:"18",height:"18",x:"3",y:"4",rx:"2",key:"1hopcy"}],["path",{d:"M3 10h18",key:"8toen8"}]],M1=o("calendar",ae);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const oe=[["path",{d:"M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2",key:"5owen"}],["circle",{cx:"7",cy:"17",r:"2",key:"u2ysq9"}],["path",{d:"M9 17h6",key:"r8uit2"}],["circle",{cx:"17",cy:"17",r:"2",key:"axvx0g"}]],v1=o("car",oe);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ce=[["path",{d:"M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z",key:"pzmjnu"}],["path",{d:"M21.21 15.89A10 10 0 1 1 8 2.83",key:"k2fpak"}]],_1=o("chart-pie",ce);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const se=[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]],m1=o("check",se);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ie=[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]],$1=o("chevron-down",ie);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ue=[["path",{d:"m15 18-6-6 6-6",key:"1wnfg3"}]],g1=o("chevron-left",ue);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const he=[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]],w1=o("chevron-right",he);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const le=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]],x1=o("circle-check",le);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const de=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M8 12h8",key:"1wcyev"}],["path",{d:"M12 8v8",key:"napkw2"}]],b1=o("circle-plus",de);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ye=[["path",{d:"M10 2v2",key:"7u0qdc"}],["path",{d:"M14 2v2",key:"6buw04"}],["path",{d:"M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1",key:"pwadti"}],["path",{d:"M6 2v2",key:"colzsn"}]],S1=o("coffee",ye);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const pe=[["path",{d:"M2 12h20",key:"9i4pu4"}],["path",{d:"M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8",key:"u0tga0"}],["path",{d:"m4 8 16-4",key:"16g0ng"}],["path",{d:"m8.86 6.78-.45-1.81a2 2 0 0 1 1.45-2.43l1.94-.48a2 2 0 0 1 2.43 1.46l.45 1.8",key:"12cejc"}]],C1=o("cooking-pot",pe);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const fe=[["path",{d:"M10.2 18H4.774a1.5 1.5 0 0 1-1.352-.97 11 11 0 0 1 .132-6.487",key:"14kkz9"}],["path",{d:"M18 10.2V4.774a1.5 1.5 0 0 0-.97-1.352 11 11 0 0 0-6.486.132",key:"1g7v07"}],["path",{d:"M18 5a4 3 0 0 1 4 3 2 2 0 0 1-2 2 10 10 0 0 0-5.139 1.42",key:"ratg6b"}],["path",{d:"M5 18a3 4 0 0 0 3 4 2 2 0 0 0 2-2 10 10 0 0 1 1.42-5.14",key:"4454f0"}],["path",{d:"M8.709 2.554a10 10 0 0 0-6.155 6.155 1.5 1.5 0 0 0 .676 1.626l9.807 5.42a2 2 0 0 0 2.718-2.718l-5.42-9.807a1.5 1.5 0 0 0-1.626-.676",key:"qmemie"}]],N1=o("croissant",fe);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ke=[["path",{d:"M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z",key:"1vdc57"}],["path",{d:"M5 21h14",key:"11awu3"}]],j1=o("crown",ke);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Me=[["path",{d:"M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z",key:"9m4mmf"}],["path",{d:"m2.5 21.5 1.4-1.4",key:"17g3f0"}],["path",{d:"m20.1 3.9 1.4-1.4",key:"1qn309"}],["path",{d:"M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z",key:"1t2c92"}],["path",{d:"m9.6 14.4 4.8-4.8",key:"6umqxw"}]],z1=o("dumbbell",Me);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ve=[["circle",{cx:"12",cy:"12",r:"1",key:"41hilf"}],["circle",{cx:"19",cy:"12",r:"1",key:"1wjl8i"}],["circle",{cx:"5",cy:"12",r:"1",key:"1pcz8c"}]],D1=o("ellipsis",ve);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _e=[["path",{d:"M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4",key:"1slcih"}]],H1=o("flame",_e);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const me=[["path",{d:"M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z",key:"1dudjm"}],["path",{d:"M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z",key:"l2t8xc"}],["path",{d:"M16 17h4",key:"1dejxt"}],["path",{d:"M4 13h4",key:"1bwh8b"}]],O1=o("footprints",me);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $e=[["path",{d:"M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5",key:"1wtuz0"}],["path",{d:"M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16",key:"e09ifn"}],["path",{d:"M2 21h13",key:"1x0fut"}],["path",{d:"M3 9h11",key:"1p7c0w"}]],L1=o("fuel",$e);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ge=[["line",{x1:"6",x2:"10",y1:"11",y2:"11",key:"1gktln"}],["line",{x1:"8",x2:"8",y1:"9",y2:"13",key:"qnk9ow"}],["line",{x1:"15",x2:"15.01",y1:"12",y2:"12",key:"krot7o"}],["line",{x1:"18",x2:"18.01",y1:"10",y2:"10",key:"1lcuu1"}],["path",{d:"M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z",key:"mfqc10"}]],A1=o("gamepad-2",ge);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const we=[["path",{d:"M12 7v14",key:"1akyts"}],["path",{d:"M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8",key:"1sqzm4"}],["path",{d:"M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5",key:"kc0143"}],["rect",{x:"3",y:"7",width:"18",height:"4",rx:"1",key:"1hberx"}]],q1=o("gift",we);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const xe=[["path",{d:"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5",key:"mvr1a0"}],["path",{d:"M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27",key:"auskq0"}]],E1=o("heart-pulse",xe);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const be=[["path",{d:"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",key:"5wwlr5"}],["path",{d:"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",key:"r6nss1"}]],V1=o("house",be);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Se=[["rect",{width:"7",height:"7",x:"3",y:"3",rx:"1",key:"1g98yp"}],["rect",{width:"7",height:"7",x:"14",y:"3",rx:"1",key:"6d4xhi"}],["rect",{width:"7",height:"7",x:"14",y:"14",rx:"1",key:"nxv5o0"}],["rect",{width:"7",height:"7",x:"3",y:"14",rx:"1",key:"1bb6yr"}]],R1=o("layout-grid",Se);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ce=[["path",{d:"M9 17H7A5 5 0 0 1 7 7h2",key:"8i5ue5"}],["path",{d:"M15 7h2a5 5 0 1 1 0 10h-2",key:"1b9ql8"}],["line",{x1:"8",x2:"16",y1:"12",y2:"12",key:"1jonct"}]],T1=o("link-2",Ce);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ne=[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2",key:"1w4ew1"}],["path",{d:"M7 11V7a5 5 0 0 1 10 0v4",key:"fwvmzm"}]],P1=o("lock",Ne);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const je=[["path",{d:"M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15",key:"143lza"}],["path",{d:"M11 12 5.12 2.2",key:"qhuxz6"}],["path",{d:"m13 12 5.88-9.8",key:"hbye0f"}],["path",{d:"M8 7h8",key:"i86dvs"}],["circle",{cx:"12",cy:"17",r:"5",key:"qbz8iq"}],["path",{d:"M12 18v-2h-.5",key:"fawc4q"}]],I1=o("medal",je);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ze=[["path",{d:"M5 12h14",key:"1ays0h"}]],W1=o("minus",ze);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const De=[["path",{d:"M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8",key:"10dyio"}],["path",{d:"M10 19v-3.96 3.15",key:"1irgej"}],["path",{d:"M7 19h5",key:"qswx4l"}],["rect",{width:"6",height:"10",x:"16",y:"12",rx:"2",key:"1egngj"}]],Y1=o("monitor-smartphone",De);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const He=[["path",{d:"m14.622 17.897-10.68-2.913",key:"vj2p1u"}],["path",{d:"M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z",key:"18tc5c"}],["path",{d:"M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15",key:"ytzfxy"}]],U1=o("paintbrush",He);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Oe=[["circle",{cx:"11",cy:"4",r:"2",key:"vol9p0"}],["circle",{cx:"18",cy:"8",r:"2",key:"17gozi"}],["circle",{cx:"20",cy:"16",r:"2",key:"1v9bxh"}],["path",{d:"M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z",key:"1ydw1z"}]],B1=o("paw-print",Oe);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Le=[["path",{d:"M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",key:"1v9wt8"}]],F1=o("plane",Le);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ae=[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"M12 5v14",key:"s699le"}]],Z1=o("plus",Ae);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const qe=[["path",{d:"M12 17V7",key:"pyj7ub"}],["path",{d:"M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8",key:"1elt7d"}],["path",{d:"M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z",key:"ycz6yz"}]],G1=o("receipt",qe);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ee=[["path",{d:"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",key:"1ffxy3"}],["path",{d:"m21.854 2.147-10.94 10.939",key:"12cjpa"}]],J1=o("send",Ee);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ve=[["path",{d:"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",key:"1i5ecw"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]],Q1=o("settings",Ve);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Re=[["path",{d:"M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z",key:"1wgbhj"}]],K1=o("shirt",Re);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Te=[["path",{d:"M16 10a4 4 0 0 1-8 0",key:"1ltviw"}],["path",{d:"M3.103 6.034h17.794",key:"awc11p"}],["path",{d:"M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z",key:"o988cm"}]],X1=o("shopping-bag",Te);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Pe=[["path",{d:"m15 11-1 9",key:"5wnq3a"}],["path",{d:"m19 11-4-7",key:"cnml18"}],["path",{d:"M2 11h20",key:"3eubbj"}],["path",{d:"m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4",key:"yiazzp"}],["path",{d:"M4.5 15.5h15",key:"13mye1"}],["path",{d:"m5 11 4-7",key:"116ra9"}],["path",{d:"m9 11 1 9",key:"1ojof7"}]],tn=o("shopping-basket",Pe);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ie=[["circle",{cx:"8",cy:"21",r:"1",key:"jimo8o"}],["circle",{cx:"19",cy:"21",r:"1",key:"13723u"}],["path",{d:"M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12",key:"9zh506"}]],en=o("shopping-cart",Ie);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const We=[["path",{d:"M10 5H3",key:"1qgfaw"}],["path",{d:"M12 19H3",key:"yhmn1j"}],["path",{d:"M14 3v4",key:"1sua03"}],["path",{d:"M16 17v4",key:"1q0r14"}],["path",{d:"M21 12h-9",key:"1o4lsq"}],["path",{d:"M21 19h-5",key:"1rlt1p"}],["path",{d:"M21 5h-7",key:"1oszz2"}],["path",{d:"M8 10v4",key:"tgpxqk"}],["path",{d:"M8 12H3",key:"a7s4jb"}]],nn=o("sliders-horizontal",We);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ye=[["rect",{width:"14",height:"20",x:"5",y:"2",rx:"2",ry:"2",key:"1yt0o3"}],["path",{d:"M12 18h.01",key:"mhygvu"}]],rn=o("smartphone",Ye);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ue=[["path",{d:"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",key:"1s2grr"}],["path",{d:"M20 2v4",key:"1rf3ol"}],["path",{d:"M22 4h-4",key:"gwowj6"}],["circle",{cx:"4",cy:"20",r:"2",key:"6kqj1y"}]],an=o("sparkles",Ue);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Be=[["path",{d:"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",key:"r04s7s"}]],on=o("star",Be);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Fe=[["path",{d:"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z",key:"vktsd0"}],["circle",{cx:"7.5",cy:"7.5",r:".5",fill:"currentColor",key:"kqv944"}]],cn=o("tag",Fe);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ze=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["circle",{cx:"12",cy:"12",r:"6",key:"1vlfrh"}],["circle",{cx:"12",cy:"12",r:"2",key:"1c9p78"}]],sn=o("target",Ze);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ge=[["path",{d:"M3.5 21 14 3",key:"1szst5"}],["path",{d:"M20.5 21 10 3",key:"1310c3"}],["path",{d:"M15.5 21 12 15l-3.5 6",key:"1ddtfw"}],["path",{d:"M2 21h20",key:"1nyx9w"}]],un=o("tent",Ge);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Je=[["path",{d:"M10 11v6",key:"nco0om"}],["path",{d:"M14 11v6",key:"outv1u"}],["path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",key:"miytrc"}],["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",key:"e791ji"}]],hn=o("trash-2",Je);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Qe=[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",key:"wmoenq"}],["path",{d:"M12 9v4",key:"juzpu7"}],["path",{d:"M12 17h.01",key:"p32p05"}]],ln=o("triangle-alert",Qe);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ke=[["path",{d:"M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978",key:"1n3hpd"}],["path",{d:"M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978",key:"rfe1zi"}],["path",{d:"M18 9h1.5a1 1 0 0 0 0-5H18",key:"7xy6bh"}],["path",{d:"M4 22h16",key:"57wxv0"}],["path",{d:"M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z",key:"1mhfuq"}],["path",{d:"M6 9H4.5a1 1 0 0 1 0-5H6",key:"tex48p"}]],dn=o("trophy",Ke);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Xe=[["path",{d:"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2",key:"975kel"}],["circle",{cx:"12",cy:"7",r:"4",key:"17ys0d"}]],yn=o("user",Xe);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const t1=[["path",{d:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",key:"1yyitq"}],["path",{d:"M16 3.128a4 4 0 0 1 0 7.744",key:"16gr8j"}],["path",{d:"M22 21v-2a4 4 0 0 0-3-3.87",key:"kshegd"}],["circle",{cx:"9",cy:"7",r:"4",key:"nufk8"}]],pn=o("users",t1);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const e1=[["path",{d:"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",key:"18etb6"}],["path",{d:"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",key:"xoc0q4"}]],fn=o("wallet",e1);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const n1=[["path",{d:"m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72",key:"ul74o6"}],["path",{d:"m14 7 3 3",key:"1r5n42"}],["path",{d:"M5 6v4",key:"ilb8ba"}],["path",{d:"M19 14v4",key:"blhpug"}],["path",{d:"M10 2v2",key:"7u0qdc"}],["path",{d:"M7 8H3",key:"zfb6yr"}],["path",{d:"M21 16h-4",key:"1cnmox"}],["path",{d:"M11 3H9",key:"1obp7u"}]],kn=o("wand-sparkles",n1);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const r1=[["path",{d:"M3 6h3",key:"155dbl"}],["path",{d:"M17 6h.01",key:"e2y6kg"}],["rect",{width:"18",height:"20",x:"3",y:"2",rx:"2",key:"od3kk9"}],["circle",{cx:"12",cy:"13",r:"5",key:"nlbqau"}],["path",{d:"M12 18a2.5 2.5 0 0 0 0-5 2.5 2.5 0 0 1 0-5",key:"17lach"}]],Mn=o("washing-machine",r1);/**
 * @license lucide-react v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const a1=[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]],vn=o("x",a1),yt=t=>{let e;const c=new Set,i=(M,z)=>{const g=typeof M=="function"?M(e):M;if(!Object.is(g,e)){const E=e;e=z??(typeof g!="object"||g===null)?g:Object.assign({},e,g),c.forEach(N=>N(e,E))}},y=()=>e,p={setState:i,getState:y,getInitialState:()=>k,subscribe:M=>(c.add(M),()=>c.delete(M))},k=e=t(i,y,p);return p},o1=t=>t?yt(t):yt,c1=t=>t;function s1(t,e=c1){const c=G.useSyncExternalStore(t.subscribe,G.useCallback(()=>e(t.getState()),[t,e]),G.useCallback(()=>e(t.getInitialState()),[t,e]));return G.useDebugValue(c),c}const i1=t=>{const e=o1(t),c=i=>s1(e,i);return Object.assign(c,e),c},_n=t=>i1;var bt={exports:{}};(function(t,e){(function(c,i){t.exports=i()})(jt,function(){var c=1e3,i=6e4,y=36e5,f="millisecond",v="second",p="minute",k="hour",M="day",z="week",g="month",E="quarter",N="year",D="date",Y="Invalid Date",K=/^(\d{4})[-/]?(\d{1,2})?[-/]?(\d{0,2})[Tt\s]*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?[.:]?(\d+)?$/,St=/\[([^\]]+)]|YYYY|YY|M{1,4}|D{1,2}|d{1,4}|H{1,2}|h{1,2}|a|A|m{1,2}|s{1,2}|Z{1,2}|SSS/g,Ct={name:"en",weekdays:"Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split("_"),months:"January_February_March_April_May_June_July_August_September_October_November_December".split("_"),ordinal:function(u){var a=["th","st","nd","rd"],n=u%100;return"["+u+(a[(n-20)%10]||a[n]||a[0])+"]"}},X=function(u,a,n){var s=String(u);return!s||s.length>=a?u:""+Array(a+1-s.length).join(n)+u},Nt={s:X,z:function(u){var a=-u.utcOffset(),n=Math.abs(a),s=Math.floor(n/60),r=n%60;return(a<=0?"+":"-")+X(s,2,"0")+":"+X(r,2,"0")},m:function u(a,n){if(a.date()<n.date())return-u(n,a);var s=12*(n.year()-a.year())+(n.month()-a.month()),r=a.clone().add(s,g),h=n-r<0,l=a.clone().add(s+(h?-1:1),g);return+(-(s+(n-r)/(h?r-l:l-r))||0)},a:function(u){return u<0?Math.ceil(u)||0:Math.floor(u)},p:function(u){return{M:g,y:N,w:z,d:M,D,h:k,m:p,s:v,ms:f,Q:E}[u]||String(u||"").toLowerCase().replace(/s$/,"")},u:function(u){return u===void 0}},T="en",L={};L[T]=Ct;var st="$isDayjsObject",tt=function(u){return u instanceof B||!(!u||!u[st])},U=function u(a,n,s){var r;if(!a)return T;if(typeof a=="string"){var h=a.toLowerCase();L[h]&&(r=h),n&&(L[h]=n,r=h);var l=a.split("-");if(!r&&l.length>1)return u(l[0])}else{var m=a.name;L[m]=a,r=m}return!s&&r&&(T=r),r||!s&&T},w=function(u,a){if(tt(u))return u.clone();var n=typeof a=="object"?a:{};return n.date=u,n.args=arguments,new B(n)},_=Nt;_.l=U,_.i=tt,_.w=function(u,a){return w(u,{locale:a.$L,utc:a.$u,x:a.$x,$offset:a.$offset})};var B=function(){function u(n){this.$L=U(n.locale,null,!0),this.parse(n),this.$x=this.$x||n.x||{},this[st]=!0}var a=u.prototype;return a.parse=function(n){this.$d=function(s){var r=s.date,h=s.utc;if(r===null)return new Date(NaN);if(_.u(r))return new Date;if(r instanceof Date)return new Date(r);if(typeof r=="string"&&!/Z$/i.test(r)){var l=r.match(K);if(l){var m=l[2]-1||0,$=(l[7]||"0").substring(0,3);return h?new Date(Date.UTC(l[1],m,l[3]||1,l[4]||0,l[5]||0,l[6]||0,$)):new Date(l[1],m,l[3]||1,l[4]||0,l[5]||0,l[6]||0,$)}}return new Date(r)}(n),this.init()},a.init=function(){var n=this.$d;this.$y=n.getFullYear(),this.$M=n.getMonth(),this.$D=n.getDate(),this.$W=n.getDay(),this.$H=n.getHours(),this.$m=n.getMinutes(),this.$s=n.getSeconds(),this.$ms=n.getMilliseconds()},a.$utils=function(){return _},a.isValid=function(){return this.$d.toString()!==Y},a.isSame=function(n,s){var r=w(n);return this.startOf(s)<=r&&r<=this.endOf(s)},a.isAfter=function(n,s){return w(n)<this.startOf(s)},a.isBefore=function(n,s){return this.endOf(s)<w(n)},a.$g=function(n,s,r){return _.u(n)?this[s]:this.set(r,n)},a.unix=function(){return Math.floor(this.valueOf()/1e3)},a.valueOf=function(){return this.$d.getTime()},a.startOf=function(n,s){var r=this,h=!!_.u(s)||s,l=_.p(n),m=function(q,C){var H=_.w(r.$u?Date.UTC(r.$y,C,q):new Date(r.$y,C,q),r);return h?H:H.endOf(M)},$=function(q,C){return _.w(r.toDate()[q].apply(r.toDate("s"),(h?[0,0,0,0]:[23,59,59,999]).slice(C)),r)},x=this.$W,b=this.$M,j=this.$D,V="set"+(this.$u?"UTC":"");switch(l){case N:return h?m(1,0):m(31,11);case g:return h?m(1,b):m(0,b+1);case z:var A=this.$locale().weekStart||0,P=(x<A?x+7:x)-A;return m(h?j-P:j+(6-P),b);case M:case D:return $(V+"Hours",0);case k:return $(V+"Minutes",1);case p:return $(V+"Seconds",2);case v:return $(V+"Milliseconds",3);default:return this.clone()}},a.endOf=function(n){return this.startOf(n,!1)},a.$set=function(n,s){var r,h=_.p(n),l="set"+(this.$u?"UTC":""),m=(r={},r[M]=l+"Date",r[D]=l+"Date",r[g]=l+"Month",r[N]=l+"FullYear",r[k]=l+"Hours",r[p]=l+"Minutes",r[v]=l+"Seconds",r[f]=l+"Milliseconds",r)[h],$=h===M?this.$D+(s-this.$W):s;if(h===g||h===N){var x=this.clone().set(D,1);x.$d[m]($),x.init(),this.$d=x.set(D,Math.min(this.$D,x.daysInMonth())).$d}else m&&this.$d[m]($);return this.init(),this},a.set=function(n,s){return this.clone().$set(n,s)},a.get=function(n){return this[_.p(n)]()},a.add=function(n,s){var r,h=this;n=Number(n);var l=_.p(s),m=function(b){var j=w(h);return _.w(j.date(j.date()+Math.round(b*n)),h)};if(l===g)return this.set(g,this.$M+n);if(l===N)return this.set(N,this.$y+n);if(l===M)return m(1);if(l===z)return m(7);var $=(r={},r[p]=i,r[k]=y,r[v]=c,r)[l]||1,x=this.$d.getTime()+n*$;return _.w(x,this)},a.subtract=function(n,s){return this.add(-1*n,s)},a.format=function(n){var s=this,r=this.$locale();if(!this.isValid())return r.invalidDate||Y;var h=n||"YYYY-MM-DDTHH:mm:ssZ",l=_.z(this),m=this.$H,$=this.$m,x=this.$M,b=r.weekdays,j=r.months,V=r.meridiem,A=function(C,H,I,F){return C&&(C[H]||C(s,h))||I[H].slice(0,F)},P=function(C){return _.s(m%12||12,C,"0")},q=V||function(C,H,I){var F=C<12?"AM":"PM";return I?F.toLowerCase():F};return h.replace(St,function(C,H){return H||function(I){switch(I){case"YY":return String(s.$y).slice(-2);case"YYYY":return _.s(s.$y,4,"0");case"M":return x+1;case"MM":return _.s(x+1,2,"0");case"MMM":return A(r.monthsShort,x,j,3);case"MMMM":return A(j,x);case"D":return s.$D;case"DD":return _.s(s.$D,2,"0");case"d":return String(s.$W);case"dd":return A(r.weekdaysMin,s.$W,b,2);case"ddd":return A(r.weekdaysShort,s.$W,b,3);case"dddd":return b[s.$W];case"H":return String(m);case"HH":return _.s(m,2,"0");case"h":return P(1);case"hh":return P(2);case"a":return q(m,$,!0);case"A":return q(m,$,!1);case"m":return String($);case"mm":return _.s($,2,"0");case"s":return String(s.$s);case"ss":return _.s(s.$s,2,"0");case"SSS":return _.s(s.$ms,3,"0");case"Z":return l}return null}(C)||l.replace(":","")})},a.utcOffset=function(){return 15*-Math.round(this.$d.getTimezoneOffset()/15)},a.diff=function(n,s,r){var h,l=this,m=_.p(s),$=w(n),x=($.utcOffset()-this.utcOffset())*i,b=this-$,j=function(){return _.m(l,$)};switch(m){case N:h=j()/12;break;case g:h=j();break;case E:h=j()/3;break;case z:h=(b-x)/6048e5;break;case M:h=(b-x)/864e5;break;case k:h=b/y;break;case p:h=b/i;break;case v:h=b/c;break;default:h=b}return r?h:_.a(h)},a.daysInMonth=function(){return this.endOf(g).$D},a.$locale=function(){return L[this.$L]},a.locale=function(n,s){if(!n)return this.$L;var r=this.clone(),h=U(n,s,!0);return h&&(r.$L=h),r},a.clone=function(){return _.w(this.$d,this)},a.toDate=function(){return new Date(this.valueOf())},a.toJSON=function(){return this.isValid()?this.toISOString():null},a.toISOString=function(){return this.$d.toISOString()},a.toString=function(){return this.$d.toUTCString()},u}(),it=B.prototype;return w.prototype=it,[["$ms",f],["$s",v],["$m",p],["$H",k],["$W",M],["$M",g],["$y",N],["$D",D]].forEach(function(u){it[u[1]]=function(a){return this.$g(a,u[0],u[1])}}),w.extend=function(u,a){return u.$i||(u(a,B,w),u.$i=!0),w},w.locale=U,w.isDayjs=tt,w.unix=function(u){return w(1e3*u)},w.en=L[T],w.Ls=L,w.p={},w})})(bt);var u1=bt.exports;const mn=pt(u1);export{un as $,B1 as A,h1 as B,M1 as C,z1 as D,D1 as E,H1 as F,A1 as G,E1 as H,F1 as I,Z1 as J,G1 as K,R1 as L,I1 as M,Q1 as N,K1 as O,U1 as P,X1 as Q,G as R,J1 as S,tn as T,en as U,nn as V,rn as W,an as X,on as Y,cn as Z,sn as _,l1 as a,hn as a0,ln as a1,dn as a2,yn as a3,pn as a4,fn as a5,kn as a6,Mn as a7,vn as a8,jt as a9,_n as aa,mn as ab,u1 as ac,pt as ad,O as ae,d1 as b,p1 as c,y1 as d,f1 as e,k1 as f,v1 as g,_1 as h,m1 as i,$1 as j,g1 as k,w1 as l,x1 as m,b1 as n,S1 as o,C1 as p,N1 as q,j1 as r,O1 as s,L1 as t,q1 as u,V1 as v,T1 as w,P1 as x,W1 as y,Y1 as z};
