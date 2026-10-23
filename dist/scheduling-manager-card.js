// node_modules/@lit/reactive-element/css-tag.js
var t = globalThis;
var e = t.ShadowRoot && (void 0 === t.ShadyCSS || t.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
var s = Symbol();
var o = /* @__PURE__ */ new WeakMap();
var n = class {
  constructor(t5, e5, o5) {
    if (this._$cssResult$ = true, o5 !== s) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t5, this.t = e5;
  }
  get styleSheet() {
    let t5 = this.o;
    const s5 = this.t;
    if (e && void 0 === t5) {
      const e5 = void 0 !== s5 && 1 === s5.length;
      e5 && (t5 = o.get(s5)), void 0 === t5 && ((this.o = t5 = new CSSStyleSheet()).replaceSync(this.cssText), e5 && o.set(s5, t5));
    }
    return t5;
  }
  toString() {
    return this.cssText;
  }
};
var r = (t5) => new n("string" == typeof t5 ? t5 : t5 + "", void 0, s);
var i = (t5, ...e5) => {
  const o5 = 1 === t5.length ? t5[0] : e5.reduce((e6, s5, o6) => e6 + ((t6) => {
    if (true === t6._$cssResult$) return t6.cssText;
    if ("number" == typeof t6) return t6;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + t6 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(s5) + t5[o6 + 1], t5[0]);
  return new n(o5, t5, s);
};
var S = (s5, o5) => {
  if (e) s5.adoptedStyleSheets = o5.map((t5) => t5 instanceof CSSStyleSheet ? t5 : t5.styleSheet);
  else for (const e5 of o5) {
    const o6 = document.createElement("style"), n4 = t.litNonce;
    void 0 !== n4 && o6.setAttribute("nonce", n4), o6.textContent = e5.cssText, s5.appendChild(o6);
  }
};
var c = e ? (t5) => t5 : (t5) => t5 instanceof CSSStyleSheet ? ((t6) => {
  let e5 = "";
  for (const s5 of t6.cssRules) e5 += s5.cssText;
  return r(e5);
})(t5) : t5;

// node_modules/@lit/reactive-element/reactive-element.js
var { is: i2, defineProperty: e2, getOwnPropertyDescriptor: h, getOwnPropertyNames: r2, getOwnPropertySymbols: o2, getPrototypeOf: n2 } = Object;
var a = globalThis;
var c2 = a.trustedTypes;
var l = c2 ? c2.emptyScript : "";
var p = a.reactiveElementPolyfillSupport;
var d = (t5, s5) => t5;
var u = { toAttribute(t5, s5) {
  switch (s5) {
    case Boolean:
      t5 = t5 ? l : null;
      break;
    case Object:
    case Array:
      t5 = null == t5 ? t5 : JSON.stringify(t5);
  }
  return t5;
}, fromAttribute(t5, s5) {
  let i7 = t5;
  switch (s5) {
    case Boolean:
      i7 = null !== t5;
      break;
    case Number:
      i7 = null === t5 ? null : Number(t5);
      break;
    case Object:
    case Array:
      try {
        i7 = JSON.parse(t5);
      } catch (t6) {
        i7 = null;
      }
  }
  return i7;
} };
var f = (t5, s5) => !i2(t5, s5);
var b = { attribute: true, type: String, converter: u, reflect: false, useDefault: false, hasChanged: f };
Symbol.metadata ??= Symbol("metadata"), a.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
var y = class extends HTMLElement {
  static addInitializer(t5) {
    this._$Ei(), (this.l ??= []).push(t5);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t5, s5 = b) {
    if (s5.state && (s5.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t5) && ((s5 = Object.create(s5)).wrapped = true), this.elementProperties.set(t5, s5), !s5.noAccessor) {
      const i7 = Symbol(), h4 = this.getPropertyDescriptor(t5, i7, s5);
      void 0 !== h4 && e2(this.prototype, t5, h4);
    }
  }
  static getPropertyDescriptor(t5, s5, i7) {
    const { get: e5, set: r5 } = h(this.prototype, t5) ?? { get() {
      return this[s5];
    }, set(t6) {
      this[s5] = t6;
    } };
    return { get: e5, set(s6) {
      const h4 = e5?.call(this);
      r5?.call(this, s6), this.requestUpdate(t5, h4, i7);
    }, configurable: true, enumerable: true };
  }
  static getPropertyOptions(t5) {
    return this.elementProperties.get(t5) ?? b;
  }
  static _$Ei() {
    if (this.hasOwnProperty(d("elementProperties"))) return;
    const t5 = n2(this);
    t5.finalize(), void 0 !== t5.l && (this.l = [...t5.l]), this.elementProperties = new Map(t5.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(d("finalized"))) return;
    if (this.finalized = true, this._$Ei(), this.hasOwnProperty(d("properties"))) {
      const t6 = this.properties, s5 = [...r2(t6), ...o2(t6)];
      for (const i7 of s5) this.createProperty(i7, t6[i7]);
    }
    const t5 = this[Symbol.metadata];
    if (null !== t5) {
      const s5 = litPropertyMetadata.get(t5);
      if (void 0 !== s5) for (const [t6, i7] of s5) this.elementProperties.set(t6, i7);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [t6, s5] of this.elementProperties) {
      const i7 = this._$Eu(t6, s5);
      void 0 !== i7 && this._$Eh.set(i7, t6);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(s5) {
    const i7 = [];
    if (Array.isArray(s5)) {
      const e5 = new Set(s5.flat(1 / 0).reverse());
      for (const s6 of e5) i7.unshift(c(s6));
    } else void 0 !== s5 && i7.push(c(s5));
    return i7;
  }
  static _$Eu(t5, s5) {
    const i7 = s5.attribute;
    return false === i7 ? void 0 : "string" == typeof i7 ? i7 : "string" == typeof t5 ? t5.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    this._$ES = new Promise((t5) => this.enableUpdating = t5), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t5) => t5(this));
  }
  addController(t5) {
    (this._$EO ??= /* @__PURE__ */ new Set()).add(t5), void 0 !== this.renderRoot && this.isConnected && t5.hostConnected?.();
  }
  removeController(t5) {
    this._$EO?.delete(t5);
  }
  _$E_() {
    const t5 = /* @__PURE__ */ new Map(), s5 = this.constructor.elementProperties;
    for (const i7 of s5.keys()) this.hasOwnProperty(i7) && (t5.set(i7, this[i7]), delete this[i7]);
    t5.size > 0 && (this._$Ep = t5);
  }
  createRenderRoot() {
    const t5 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return S(t5, this.constructor.elementStyles), t5;
  }
  connectedCallback() {
    this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(true), this._$EO?.forEach((t5) => t5.hostConnected?.());
  }
  enableUpdating(t5) {
  }
  disconnectedCallback() {
    this._$EO?.forEach((t5) => t5.hostDisconnected?.());
  }
  attributeChangedCallback(t5, s5, i7) {
    this._$AK(t5, i7);
  }
  _$ET(t5, s5) {
    const i7 = this.constructor.elementProperties.get(t5), e5 = this.constructor._$Eu(t5, i7);
    if (void 0 !== e5 && true === i7.reflect) {
      const h4 = (void 0 !== i7.converter?.toAttribute ? i7.converter : u).toAttribute(s5, i7.type);
      this._$Em = t5, null == h4 ? this.removeAttribute(e5) : this.setAttribute(e5, h4), this._$Em = null;
    }
  }
  _$AK(t5, s5) {
    const i7 = this.constructor, e5 = i7._$Eh.get(t5);
    if (void 0 !== e5 && this._$Em !== e5) {
      const t6 = i7.getPropertyOptions(e5), h4 = "function" == typeof t6.converter ? { fromAttribute: t6.converter } : void 0 !== t6.converter?.fromAttribute ? t6.converter : u;
      this._$Em = e5;
      const r5 = h4.fromAttribute(s5, t6.type);
      this[e5] = r5 ?? this._$Ej?.get(e5) ?? r5, this._$Em = null;
    }
  }
  requestUpdate(t5, s5, i7, e5 = false, h4) {
    if (void 0 !== t5) {
      const r5 = this.constructor;
      if (false === e5 && (h4 = this[t5]), i7 ??= r5.getPropertyOptions(t5), !((i7.hasChanged ?? f)(h4, s5) || i7.useDefault && i7.reflect && h4 === this._$Ej?.get(t5) && !this.hasAttribute(r5._$Eu(t5, i7)))) return;
      this.C(t5, s5, i7);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t5, s5, { useDefault: i7, reflect: e5, wrapped: h4 }, r5) {
    i7 && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t5) && (this._$Ej.set(t5, r5 ?? s5 ?? this[t5]), true !== h4 || void 0 !== r5) || (this._$AL.has(t5) || (this.hasUpdated || i7 || (s5 = void 0), this._$AL.set(t5, s5)), true === e5 && this._$Em !== t5 && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t5));
  }
  async _$EP() {
    this.isUpdatePending = true;
    try {
      await this._$ES;
    } catch (t6) {
      Promise.reject(t6);
    }
    const t5 = this.scheduleUpdate();
    return null != t5 && await t5, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
        for (const [t7, s6] of this._$Ep) this[t7] = s6;
        this._$Ep = void 0;
      }
      const t6 = this.constructor.elementProperties;
      if (t6.size > 0) for (const [s6, i7] of t6) {
        const { wrapped: t7 } = i7, e5 = this[s6];
        true !== t7 || this._$AL.has(s6) || void 0 === e5 || this.C(s6, void 0, i7, e5);
      }
    }
    let t5 = false;
    const s5 = this._$AL;
    try {
      t5 = this.shouldUpdate(s5), t5 ? (this.willUpdate(s5), this._$EO?.forEach((t6) => t6.hostUpdate?.()), this.update(s5)) : this._$EM();
    } catch (s6) {
      throw t5 = false, this._$EM(), s6;
    }
    t5 && this._$AE(s5);
  }
  willUpdate(t5) {
  }
  _$AE(t5) {
    this._$EO?.forEach((t6) => t6.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t5)), this.updated(t5);
  }
  _$EM() {
    this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = false;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this._$ES;
  }
  shouldUpdate(t5) {
    return true;
  }
  update(t5) {
    this._$Eq &&= this._$Eq.forEach((t6) => this._$ET(t6, this[t6])), this._$EM();
  }
  updated(t5) {
  }
  firstUpdated(t5) {
  }
};
y.elementStyles = [], y.shadowRootOptions = { mode: "open" }, y[d("elementProperties")] = /* @__PURE__ */ new Map(), y[d("finalized")] = /* @__PURE__ */ new Map(), p?.({ ReactiveElement: y }), (a.reactiveElementVersions ??= []).push("2.1.2");

// node_modules/lit-html/lit-html.js
var t2 = globalThis;
var i3 = (t5) => t5;
var s2 = t2.trustedTypes;
var e3 = s2 ? s2.createPolicy("lit-html", { createHTML: (t5) => t5 }) : void 0;
var h2 = "$lit$";
var o3 = `lit$${Math.random().toFixed(9).slice(2)}$`;
var n3 = "?" + o3;
var r3 = `<${n3}>`;
var l2 = document;
var c3 = () => l2.createComment("");
var a2 = (t5) => null === t5 || "object" != typeof t5 && "function" != typeof t5;
var u2 = Array.isArray;
var d2 = (t5) => u2(t5) || "function" == typeof t5?.[Symbol.iterator];
var f2 = "[ 	\n\f\r]";
var v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
var _ = /-->/g;
var m = />/g;
var p2 = RegExp(`>|${f2}(?:([^\\s"'>=/]+)(${f2}*=${f2}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g");
var g = /'/g;
var $ = /"/g;
var y2 = /^(?:script|style|textarea|title)$/i;
var x = (t5) => (i7, ...s5) => ({ _$litType$: t5, strings: i7, values: s5 });
var b2 = x(1);
var w = x(2);
var T = x(3);
var E = Symbol.for("lit-noChange");
var A = Symbol.for("lit-nothing");
var C = /* @__PURE__ */ new WeakMap();
var P = l2.createTreeWalker(l2, 129);
function V(t5, i7) {
  if (!u2(t5) || !t5.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e3 ? e3.createHTML(i7) : i7;
}
var N = (t5, i7) => {
  const s5 = t5.length - 1, e5 = [];
  let n4, l4 = 2 === i7 ? "<svg>" : 3 === i7 ? "<math>" : "", c5 = v;
  for (let i8 = 0; i8 < s5; i8++) {
    const s6 = t5[i8];
    let a3, u5, d3 = -1, f3 = 0;
    for (; f3 < s6.length && (c5.lastIndex = f3, u5 = c5.exec(s6), null !== u5); ) f3 = c5.lastIndex, c5 === v ? "!--" === u5[1] ? c5 = _ : void 0 !== u5[1] ? c5 = m : void 0 !== u5[2] ? (y2.test(u5[2]) && (n4 = RegExp("</" + u5[2], "g")), c5 = p2) : void 0 !== u5[3] && (c5 = p2) : c5 === p2 ? ">" === u5[0] ? (c5 = n4 ?? v, d3 = -1) : void 0 === u5[1] ? d3 = -2 : (d3 = c5.lastIndex - u5[2].length, a3 = u5[1], c5 = void 0 === u5[3] ? p2 : '"' === u5[3] ? $ : g) : c5 === $ || c5 === g ? c5 = p2 : c5 === _ || c5 === m ? c5 = v : (c5 = p2, n4 = void 0);
    const x2 = c5 === p2 && t5[i8 + 1].startsWith("/>") ? " " : "";
    l4 += c5 === v ? s6 + r3 : d3 >= 0 ? (e5.push(a3), s6.slice(0, d3) + h2 + s6.slice(d3) + o3 + x2) : s6 + o3 + (-2 === d3 ? i8 : x2);
  }
  return [V(t5, l4 + (t5[s5] || "<?>") + (2 === i7 ? "</svg>" : 3 === i7 ? "</math>" : "")), e5];
};
var S2 = class _S {
  constructor({ strings: t5, _$litType$: i7 }, e5) {
    let r5;
    this.parts = [];
    let l4 = 0, a3 = 0;
    const u5 = t5.length - 1, d3 = this.parts, [f3, v3] = N(t5, i7);
    if (this.el = _S.createElement(f3, e5), P.currentNode = this.el.content, 2 === i7 || 3 === i7) {
      const t6 = this.el.content.firstChild;
      t6.replaceWith(...t6.childNodes);
    }
    for (; null !== (r5 = P.nextNode()) && d3.length < u5; ) {
      if (1 === r5.nodeType) {
        if (r5.hasAttributes()) for (const t6 of r5.getAttributeNames()) if (t6.endsWith(h2)) {
          const i8 = v3[a3++], s5 = r5.getAttribute(t6).split(o3), e6 = /([.?@])?(.*)/.exec(i8);
          d3.push({ type: 1, index: l4, name: e6[2], strings: s5, ctor: "." === e6[1] ? I : "?" === e6[1] ? L : "@" === e6[1] ? z : H }), r5.removeAttribute(t6);
        } else t6.startsWith(o3) && (d3.push({ type: 6, index: l4 }), r5.removeAttribute(t6));
        if (y2.test(r5.tagName)) {
          const t6 = r5.textContent.split(o3), i8 = t6.length - 1;
          if (i8 > 0) {
            r5.textContent = s2 ? s2.emptyScript : "";
            for (let s5 = 0; s5 < i8; s5++) r5.append(t6[s5], c3()), P.nextNode(), d3.push({ type: 2, index: ++l4 });
            r5.append(t6[i8], c3());
          }
        }
      } else if (8 === r5.nodeType) if (r5.data === n3) d3.push({ type: 2, index: l4 });
      else {
        let t6 = -1;
        for (; -1 !== (t6 = r5.data.indexOf(o3, t6 + 1)); ) d3.push({ type: 7, index: l4 }), t6 += o3.length - 1;
      }
      l4++;
    }
  }
  static createElement(t5, i7) {
    const s5 = l2.createElement("template");
    return s5.innerHTML = t5, s5;
  }
};
function M(t5, i7, s5 = t5, e5) {
  if (i7 === E) return i7;
  let h4 = void 0 !== e5 ? s5._$Co?.[e5] : s5._$Cl;
  const o5 = a2(i7) ? void 0 : i7._$litDirective$;
  return h4?.constructor !== o5 && (h4?._$AO?.(false), void 0 === o5 ? h4 = void 0 : (h4 = new o5(t5), h4._$AT(t5, s5, e5)), void 0 !== e5 ? (s5._$Co ??= [])[e5] = h4 : s5._$Cl = h4), void 0 !== h4 && (i7 = M(t5, h4._$AS(t5, i7.values), h4, e5)), i7;
}
var R = class {
  constructor(t5, i7) {
    this._$AV = [], this._$AN = void 0, this._$AD = t5, this._$AM = i7;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t5) {
    const { el: { content: i7 }, parts: s5 } = this._$AD, e5 = (t5?.creationScope ?? l2).importNode(i7, true);
    P.currentNode = e5;
    let h4 = P.nextNode(), o5 = 0, n4 = 0, r5 = s5[0];
    for (; void 0 !== r5; ) {
      if (o5 === r5.index) {
        let i8;
        2 === r5.type ? i8 = new k(h4, h4.nextSibling, this, t5) : 1 === r5.type ? i8 = new r5.ctor(h4, r5.name, r5.strings, this, t5) : 6 === r5.type && (i8 = new Z(h4, this, t5)), this._$AV.push(i8), r5 = s5[++n4];
      }
      o5 !== r5?.index && (h4 = P.nextNode(), o5++);
    }
    return P.currentNode = l2, e5;
  }
  p(t5) {
    let i7 = 0;
    for (const s5 of this._$AV) void 0 !== s5 && (void 0 !== s5.strings ? (s5._$AI(t5, s5, i7), i7 += s5.strings.length - 2) : s5._$AI(t5[i7])), i7++;
  }
};
var k = class _k {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t5, i7, s5, e5) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t5, this._$AB = i7, this._$AM = s5, this.options = e5, this._$Cv = e5?.isConnected ?? true;
  }
  get parentNode() {
    let t5 = this._$AA.parentNode;
    const i7 = this._$AM;
    return void 0 !== i7 && 11 === t5?.nodeType && (t5 = i7.parentNode), t5;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t5, i7 = this) {
    t5 = M(this, t5, i7), a2(t5) ? t5 === A || null == t5 || "" === t5 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t5 !== this._$AH && t5 !== E && this._(t5) : void 0 !== t5._$litType$ ? this.$(t5) : void 0 !== t5.nodeType ? this.T(t5) : d2(t5) ? this.k(t5) : this._(t5);
  }
  O(t5) {
    return this._$AA.parentNode.insertBefore(t5, this._$AB);
  }
  T(t5) {
    this._$AH !== t5 && (this._$AR(), this._$AH = this.O(t5));
  }
  _(t5) {
    this._$AH !== A && a2(this._$AH) ? this._$AA.nextSibling.data = t5 : this.T(l2.createTextNode(t5)), this._$AH = t5;
  }
  $(t5) {
    const { values: i7, _$litType$: s5 } = t5, e5 = "number" == typeof s5 ? this._$AC(t5) : (void 0 === s5.el && (s5.el = S2.createElement(V(s5.h, s5.h[0]), this.options)), s5);
    if (this._$AH?._$AD === e5) this._$AH.p(i7);
    else {
      const t6 = new R(e5, this), s6 = t6.u(this.options);
      t6.p(i7), this.T(s6), this._$AH = t6;
    }
  }
  _$AC(t5) {
    let i7 = C.get(t5.strings);
    return void 0 === i7 && C.set(t5.strings, i7 = new S2(t5)), i7;
  }
  k(t5) {
    u2(this._$AH) || (this._$AH = [], this._$AR());
    const i7 = this._$AH;
    let s5, e5 = 0;
    for (const h4 of t5) e5 === i7.length ? i7.push(s5 = new _k(this.O(c3()), this.O(c3()), this, this.options)) : s5 = i7[e5], s5._$AI(h4), e5++;
    e5 < i7.length && (this._$AR(s5 && s5._$AB.nextSibling, e5), i7.length = e5);
  }
  _$AR(t5 = this._$AA.nextSibling, s5) {
    for (this._$AP?.(false, true, s5); t5 !== this._$AB; ) {
      const s6 = i3(t5).nextSibling;
      i3(t5).remove(), t5 = s6;
    }
  }
  setConnected(t5) {
    void 0 === this._$AM && (this._$Cv = t5, this._$AP?.(t5));
  }
};
var H = class {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t5, i7, s5, e5, h4) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t5, this.name = i7, this._$AM = e5, this.options = h4, s5.length > 2 || "" !== s5[0] || "" !== s5[1] ? (this._$AH = Array(s5.length - 1).fill(new String()), this.strings = s5) : this._$AH = A;
  }
  _$AI(t5, i7 = this, s5, e5) {
    const h4 = this.strings;
    let o5 = false;
    if (void 0 === h4) t5 = M(this, t5, i7, 0), o5 = !a2(t5) || t5 !== this._$AH && t5 !== E, o5 && (this._$AH = t5);
    else {
      const e6 = t5;
      let n4, r5;
      for (t5 = h4[0], n4 = 0; n4 < h4.length - 1; n4++) r5 = M(this, e6[s5 + n4], i7, n4), r5 === E && (r5 = this._$AH[n4]), o5 ||= !a2(r5) || r5 !== this._$AH[n4], r5 === A ? t5 = A : t5 !== A && (t5 += (r5 ?? "") + h4[n4 + 1]), this._$AH[n4] = r5;
    }
    o5 && !e5 && this.j(t5);
  }
  j(t5) {
    t5 === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t5 ?? "");
  }
};
var I = class extends H {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t5) {
    this.element[this.name] = t5 === A ? void 0 : t5;
  }
};
var L = class extends H {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t5) {
    this.element.toggleAttribute(this.name, !!t5 && t5 !== A);
  }
};
var z = class extends H {
  constructor(t5, i7, s5, e5, h4) {
    super(t5, i7, s5, e5, h4), this.type = 5;
  }
  _$AI(t5, i7 = this) {
    if ((t5 = M(this, t5, i7, 0) ?? A) === E) return;
    const s5 = this._$AH, e5 = t5 === A && s5 !== A || t5.capture !== s5.capture || t5.once !== s5.once || t5.passive !== s5.passive, h4 = t5 !== A && (s5 === A || e5);
    e5 && this.element.removeEventListener(this.name, this, s5), h4 && this.element.addEventListener(this.name, this, t5), this._$AH = t5;
  }
  handleEvent(t5) {
    "function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t5) : this._$AH.handleEvent(t5);
  }
};
var Z = class {
  constructor(t5, i7, s5) {
    this.element = t5, this.type = 6, this._$AN = void 0, this._$AM = i7, this.options = s5;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t5) {
    M(this, t5);
  }
};
var j = { M: h2, P: o3, A: n3, C: 1, L: N, R, D: d2, V: M, I: k, H, N: L, U: z, B: I, F: Z };
var B = t2.litHtmlPolyfillSupport;
B?.(S2, k), (t2.litHtmlVersions ??= []).push("3.3.3");
var D = (t5, i7, s5) => {
  const e5 = s5?.renderBefore ?? i7;
  let h4 = e5._$litPart$;
  if (void 0 === h4) {
    const t6 = s5?.renderBefore ?? null;
    e5._$litPart$ = h4 = new k(i7.insertBefore(c3(), t6), t6, void 0, s5 ?? {});
  }
  return h4._$AI(t5), h4;
};

// node_modules/lit-element/lit-element.js
var s3 = globalThis;
var i4 = class extends y {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    const t5 = super.createRenderRoot();
    return this.renderOptions.renderBefore ??= t5.firstChild, t5;
  }
  update(t5) {
    const r5 = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t5), this._$Do = D(r5, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    super.connectedCallback(), this._$Do?.setConnected(true);
  }
  disconnectedCallback() {
    super.disconnectedCallback(), this._$Do?.setConnected(false);
  }
  render() {
    return E;
  }
};
i4._$litElement$ = true, i4["finalized"] = true, s3.litElementHydrateSupport?.({ LitElement: i4 });
var o4 = s3.litElementPolyfillSupport;
o4?.({ LitElement: i4 });
(s3.litElementVersions ??= []).push("4.2.2");

// node_modules/lit-html/directive.js
var t3 = { ATTRIBUTE: 1, CHILD: 2, PROPERTY: 3, BOOLEAN_ATTRIBUTE: 4, EVENT: 5, ELEMENT: 6 };
var e4 = (t5) => (...e5) => ({ _$litDirective$: t5, values: e5 });
var i5 = class {
  constructor(t5) {
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AT(t5, e5, i7) {
    this._$Ct = t5, this._$AM = e5, this._$Ci = i7;
  }
  _$AS(t5, e5) {
    return this.update(t5, e5);
  }
  update(t5, e5) {
    return this.render(...e5);
  }
};

// node_modules/lit-html/directive-helpers.js
var { I: t4 } = j;
var i6 = (o5) => o5;
var r4 = (o5) => void 0 === o5.strings;
var s4 = () => document.createComment("");
var v2 = (o5, n4, e5) => {
  const l4 = o5._$AA.parentNode, d3 = void 0 === n4 ? o5._$AB : n4._$AA;
  if (void 0 === e5) {
    const i7 = l4.insertBefore(s4(), d3), n5 = l4.insertBefore(s4(), d3);
    e5 = new t4(i7, n5, o5, o5.options);
  } else {
    const t5 = e5._$AB.nextSibling, n5 = e5._$AM, c5 = n5 !== o5;
    if (c5) {
      let t6;
      e5._$AQ?.(o5), e5._$AM = o5, void 0 !== e5._$AP && (t6 = o5._$AU) !== n5._$AU && e5._$AP(t6);
    }
    if (t5 !== d3 || c5) {
      let o6 = e5._$AA;
      for (; o6 !== t5; ) {
        const t6 = i6(o6).nextSibling;
        i6(l4).insertBefore(o6, d3), o6 = t6;
      }
    }
  }
  return e5;
};
var u3 = (o5, t5, i7 = o5) => (o5._$AI(t5, i7), o5);
var m2 = {};
var p3 = (o5, t5 = m2) => o5._$AH = t5;
var M2 = (o5) => o5._$AH;
var h3 = (o5) => {
  o5._$AR(), o5._$AA.remove();
};

// node_modules/lit-html/directives/live.js
var l3 = e4(class extends i5 {
  constructor(r5) {
    if (super(r5), r5.type !== t3.PROPERTY && r5.type !== t3.ATTRIBUTE && r5.type !== t3.BOOLEAN_ATTRIBUTE) throw Error("The `live` directive is not allowed on child or event bindings");
    if (!r4(r5)) throw Error("`live` bindings can only contain a single expression");
  }
  render(r5) {
    return r5;
  }
  update(i7, [t5]) {
    if (t5 === E || t5 === A) return t5;
    const o5 = i7.element, l4 = i7.name;
    if (i7.type === t3.PROPERTY) {
      if (t5 === o5[l4]) return E;
    } else if (i7.type === t3.BOOLEAN_ATTRIBUTE) {
      if (!!t5 === o5.hasAttribute(l4)) return E;
    } else if (i7.type === t3.ATTRIBUTE && o5.getAttribute(l4) === t5 + "") return E;
    return p3(i7), t5;
  }
});

// src/dynamic.ts
var solarEvents = [["sunrise", "Sunrise"], ["sunset", "Sunset"], ["dawn", "Dawn"], ["dusk", "Dusk"], ["noon", "Solar noon"], ["midnight", "Solar midnight"]];
function validDynamic(value) {
  return !value || solarEvents.some(([event]) => event === value.event) && Number.isInteger(value.offset) && Math.abs(value.offset) <= 300;
}
function predictedMinute(dynamic, solar = {}) {
  if (!dynamic || !validDynamic(dynamic)) return;
  const minute = solar[dynamic.event];
  return minute === void 0 || minute === null ? void 0 : minute + dynamic.offset;
}
function resolvedBand(band, solar = {}) {
  if (band.one_off_run?.minutes) return [...band.one_off_run.minutes];
  const values = ["start", "end"].map((endpoint) => {
    const dynamic = band[`${endpoint}_dynamic`];
    if (!dynamic) return band[`${endpoint}_minute`];
    const minute = predictedMinute(dynamic, solar);
    return minute === void 0 ? void 0 : Math.max(0, Math.min(1440, minute));
  });
  let [start, end] = values;
  if (start === void 0 || end === void 0) return;
  if (start > end) end = start;
  return [start, end];
}
function solarDate(zone, weekday, date = /* @__PURE__ */ new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type) => parts.find((p4) => p4.type === type).value;
  const local = /* @__PURE__ */ new Date(`${part("year")}-${part("month")}-${part("day")}T12:00:00Z`);
  if (weekday !== void 0) local.setUTCDate(local.getUTCDate() + (weekday - (local.getUTCDay() + 6) % 7 + 7) % 7);
  return local.toISOString().slice(0, 10);
}

// src/draft.ts
function uuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
var clone = (value) => structuredClone(value);
var days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
var snap = (minute) => Math.floor(minute / 5 + 0.5) * 5;
var time = (minute) => minute === 1440 ? "23:59" : `${Math.floor(minute / 60).toString().padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}`;
function parseTime(value) {
  if (value === "23:59") return 1440;
  if (!/^\d{2}:\d{2}$/.test(value)) return NaN;
  const [hour, minute] = value.split(":").map(Number);
  return hour <= 23 && minute < 60 ? hour * 60 + minute : NaN;
}
function newSub() {
  return { id: uuid(), days: [], bands: [] };
}
function begin(model, section, name = "") {
  return {
    section: section ? clone(section) : { id: uuid(), name, enabled: true, away_enabled: true, entities: [], sub_schedules: [newSub()] },
    settings: clone(model.entity_settings),
    revision: model.revision,
    selected: 0,
    deleted: false,
    isNew: !section
  };
}
function bandError(sub, start, end, except, definition) {
  const dynamic = !!(definition?.start_dynamic || definition?.end_dynamic);
  if (!validDynamic(definition?.start_dynamic) || !validDynamic(definition?.end_dynamic)) return "Choose a solar event and an offset from -300 to 300 minutes.";
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > 1440 || end < 0 || end > 1440 || !dynamic && start >= end || start % 5 || end % 5) return "Use five-minute times, with start before end. 23:59 means midnight.";
  if (!except && sub.bands.length >= 10) return "Maximum ten time bands per sub-schedule.";
  if (!dynamic && sub.bands.some((b3) => b3.id !== except && !b3.start_dynamic && !b3.end_dynamic && start < b3.end_minute && end > b3.start_minute)) return "Time bands cannot overlap.";
  return "";
}
function clampEndpoint(sub, band, endpoint, minute, solar) {
  const fixed = sub.bands.filter((b3) => !b3.start_dynamic && !b3.end_dynamic).sort((a3, b3) => a3.start_minute - b3.start_minute), index = fixed.findIndex((b3) => b3.id === band.id);
  const own = resolvedBand(band, solar);
  let low = endpoint === "start_minute" ? index < 0 ? 0 : fixed[index - 1]?.end_minute ?? 0 : band.start_dynamic ? Math.ceil((own?.[0] ?? 0) / 5) * 5 : band.start_minute + 5;
  let high = endpoint === "end_minute" ? index < 0 ? 1440 : fixed[index + 1]?.start_minute ?? 1440 : band.end_dynamic ? Math.floor((own?.[1] ?? 1440) / 5) * 5 : band.end_minute - 5;
  for (const other of sub.bands) if (other !== band && (other.start_dynamic || other.end_dynamic)) {
    const resolved = resolvedBand(other, solar);
    if (resolved) {
      if (resolved[1] <= band.start_minute) low = Math.max(low, Math.ceil(resolved[1] / 5) * 5);
      if (resolved[0] >= band.end_minute) high = Math.min(high, Math.floor(resolved[0] / 5) * 5);
    }
  }
  if (low > high) return band[endpoint];
  return Math.max(low, Math.min(high, snap(minute)));
}
function validTemperature(value, cap) {
  if (cap.min === void 0 || cap.max === void 0 || cap.step === void 0 || cap.step <= 0) return false;
  const grid = (value - cap.min) / cap.step;
  return Number.isFinite(value) && value >= cap.min && value <= cap.max && Math.abs(grid - Math.round(grid)) < 1e-7;
}
function validState(value, cap) {
  if (cap.kind === "number") return typeof value === "number" && validTemperature(value, cap);
  if (typeof value !== "string") return false;
  if (cap.kind === "text") {
    try {
      return value.length >= (cap.min_length ?? 0) && value.length <= (cap.max_length ?? 255) && (!cap.pattern || new RegExp(`^(?:${cap.pattern})$`).test(value));
    } catch {
      return false;
    }
  }
  if (["date", "time", "datetime"].includes(cap.kind ?? "")) return value.length > 0;
  return (cap.options ?? []).includes(value);
}
function draftError(draft, caps) {
  if (draft.deleted) return "";
  const section = draft.section;
  if (!section.name.trim()) return "Enter a section name.";
  if (!section.entities.length) return "Add at least one writable entity.";
  const seen = /* @__PURE__ */ new Set();
  for (const sub of section.sub_schedules) {
    if (!sub.days.length) return "Select at least one day in every sub-schedule.";
    if (sub.days.some((d3) => seen.has(d3))) return "A weekday can belong to only one sub-schedule.";
    sub.days.forEach((d3) => seen.add(d3));
    for (const b3 of sub.bands) {
      const error = bandError(sub, b3.start_minute, b3.end_minute, b3.id, b3);
      if (error) return error;
    }
  }
  for (const member of section.entities) {
    const setting = draft.settings[member.entity_key];
    const cap = caps.find((c5) => c5.entity_id === setting.entity_id);
    if (!cap?.supported) return `Unsupported device: ${setting.entity_id}`;
    if (!setting.entity_id.startsWith("climate.")) {
      if (!validState(member.start_state, cap) || !validState(member.end_state, cap)) return `Choose valid Start and Stop states for ${cap.name}.`;
      if (cap.kind === "number" && [member.start_unit, member.end_unit].some((unit) => unit !== void 0 && unit !== (cap.unit ?? ""))) return `Unit changed; choose both values again for ${cap.name}.`;
      continue;
    }
    for (const value of [setting.setback, member.target]) {
      if (!value) return `Choose temperatures for ${cap.name}.`;
      if (value.unit === cap.unit && !validTemperature(value.value, cap)) return `Correct temperature for ${cap.name}.`;
    }
  }
  return "";
}
function localClock(zone, date = /* @__PURE__ */ new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const part = (type) => parts.find((p4) => p4.type === type)?.value ?? "";
  const weekday = part("weekday");
  return { weekday, day: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].indexOf(weekday), minute: Number(part("hour")) * 60 + Number(part("minute")) };
}

// src/view-title.ts
function viewTitle(element) {
  let node = element;
  while (node) {
    if (["hui-view", "hui-panel-view", "hui-masonry-view", "hui-sections-view"].includes(node.localName)) {
      const view = node;
      const config = view.lovelace?.rawConfig ?? view.lovelace?.config;
      const title = config?.views?.[view.index ?? -1]?.title;
      if (config) return typeof title === "string" ? title : "";
    }
    node = node.parentElement ?? node.getRootNode().host ?? null;
  }
  return "";
}

// src/categories.ts
var allFilters = () => ({ categories: null, areas: null, floors: null, activity: null });
var categoryKey = (section) => section.category?.trim() ? `category:${section.category.trim()}` : "none";
function categories(sections) {
  return [...new Set(sections.map((section) => section.category?.trim()).filter((name) => !!name))].sort((a3, b3) => a3.localeCompare(b3));
}
function categoryOptions(sections) {
  return [...sections.some((section) => categoryKey(section) === "none") ? ["none"] : [], ...categories(sections).map((name) => `category:${name}`)];
}
function normalizeFilter(selection, options) {
  if (selection === null) return null;
  const retained = [...new Set(selection)].filter((value) => options.includes(value));
  return retained.length === options.length || selection.length > 0 && retained.length === 0 ? null : retained;
}
function filterOptions(sections, locations = {}) {
  const locationOptions = (dimension) => {
    const found = /* @__PURE__ */ new Map();
    for (const section of sections) for (const member of section.entities) {
      const location = locations[member.entity_key], id = location?.[`${dimension}_id`];
      const value = id ? `${dimension}:${id}` : "none";
      found.set(value, id ? location[`${dimension}_name`] ?? id : dimension === "area" ? "No Area" : "No Floor");
    }
    return [...found].map(([value, label]) => ({ value, label })).sort((a3, b3) => a3.value === "none" ? -1 : b3.value === "none" ? 1 : a3.label.localeCompare(b3.label));
  };
  return {
    categories: categoryOptions(sections).map((value) => ({ value, label: value === "none" ? "Unassigned" : value.slice(9) })),
    areas: locationOptions("area"),
    floors: locationOptions("floor"),
    activity: [{ value: "active", label: "Active now" }, { value: "inactive", label: "Inactive now" }]
  };
}
function normalizeFilters(filters, options) {
  return Object.fromEntries(Object.entries(options).map(([key, values]) => [key, normalizeFilter(filters[key], values.map((value) => value.value))]));
}
function isFiltered(filters) {
  return Object.values(filters).some((value) => value !== null);
}
function visibleSchedules(sections, filters, locations = {}, active = {}, editingId) {
  const includes = (selection, value) => selection === null || selection.includes(value);
  return sections.filter((section) => section.id === editingId || includes(filters.categories, categoryKey(section)) && includes(filters.activity, active[section.id] ? "active" : "inactive") && (filters.areas === null && filters.floors === null || section.entities.some((member) => {
    const location = locations[member.entity_key];
    return includes(filters.areas, location?.area_id ? `area:${location.area_id}` : "none") && includes(filters.floors, location?.floor_id ? `floor:${location.floor_id}` : "none");
  })));
}
function categoryGroups(sections, active = {}) {
  const groups = /* @__PURE__ */ new Map();
  for (const section of sections) {
    const key = categoryKey(section);
    if (!groups.has(key)) groups.set(key, { key, name: section.category?.trim() || "Unassigned", sections: [], active: 0 });
    const group = groups.get(key);
    group.sections.push(section);
    if (active[section.id]) group.active++;
  }
  return [...groups.values()];
}

// node_modules/lit-html/directives/repeat.js
var u4 = (e5, s5, t5) => {
  const r5 = /* @__PURE__ */ new Map();
  for (let l4 = s5; l4 <= t5; l4++) r5.set(e5[l4], l4);
  return r5;
};
var c4 = e4(class extends i5 {
  constructor(e5) {
    if (super(e5), e5.type !== t3.CHILD) throw Error("repeat() can only be used in text expressions");
  }
  dt(e5, s5, t5) {
    let r5;
    void 0 === t5 ? t5 = s5 : void 0 !== s5 && (r5 = s5);
    const l4 = [], o5 = [];
    let i7 = 0;
    for (const s6 of e5) l4[i7] = r5 ? r5(s6, i7) : i7, o5[i7] = t5(s6, i7), i7++;
    return { values: o5, keys: l4 };
  }
  render(e5, s5, t5) {
    return this.dt(e5, s5, t5).values;
  }
  update(s5, [t5, r5, c5]) {
    const d3 = M2(s5), { values: p4, keys: a3 } = this.dt(t5, r5, c5);
    if (!Array.isArray(d3)) return this.ut = a3, p4;
    const h4 = this.ut ??= [], v3 = [];
    let m3, y3, x2 = 0, j2 = d3.length - 1, k2 = 0, w2 = p4.length - 1;
    for (; x2 <= j2 && k2 <= w2; ) if (null === d3[x2]) x2++;
    else if (null === d3[j2]) j2--;
    else if (h4[x2] === a3[k2]) v3[k2] = u3(d3[x2], p4[k2]), x2++, k2++;
    else if (h4[j2] === a3[w2]) v3[w2] = u3(d3[j2], p4[w2]), j2--, w2--;
    else if (h4[x2] === a3[w2]) v3[w2] = u3(d3[x2], p4[w2]), v2(s5, v3[w2 + 1], d3[x2]), x2++, w2--;
    else if (h4[j2] === a3[k2]) v3[k2] = u3(d3[j2], p4[k2]), v2(s5, d3[x2], d3[j2]), j2--, k2++;
    else if (void 0 === m3 && (m3 = u4(a3, k2, w2), y3 = u4(h4, x2, j2)), m3.has(h4[x2])) if (m3.has(h4[j2])) {
      const e5 = y3.get(a3[k2]), t6 = void 0 !== e5 ? d3[e5] : null;
      if (null === t6) {
        const e6 = v2(s5, d3[x2]);
        u3(e6, p4[k2]), v3[k2] = e6;
      } else v3[k2] = u3(t6, p4[k2]), v2(s5, d3[x2], t6), d3[e5] = null;
      k2++;
    } else h3(d3[j2]), j2--;
    else h3(d3[x2]), x2++;
    for (; k2 <= w2; ) {
      const e5 = v2(s5, v3[w2 + 1]);
      u3(e5, p4[k2]), v3[k2++] = e5;
    }
    for (; x2 <= j2; ) {
      const e5 = d3[x2++];
      null !== e5 && h3(e5);
    }
    return this.ut = a3, p3(s5, v3), E;
  }
});

// src/bands.ts
function bandDisabled(band, now = Date.now()) {
  return band.enabled === false && (!band.disabled_until || !/(Z|[+-]\d\d:\d\d)$/.test(band.disabled_until) || now < Date.parse(band.disabled_until));
}

// src/timeline.ts
var HeatingTimeline = class extends i4 {
  constructor() {
    super(...arguments);
    this.sub = { id: "", days: [], bands: [] };
    this.previewDay = "";
    this.edit = false;
    this.minute = 0;
    this.showCurrentTime = true;
    this.canvasWidth = 900;
  }
  static {
    this.properties = { sub: { attribute: false }, solarMinutes: { attribute: false }, previewSolarMinutes: { attribute: false }, previewSub: { attribute: false }, previewDay: { type: String }, edit: { type: Boolean }, minute: { type: Number }, showCurrentTime: { type: Boolean }, canvasWidth: { state: true }, activeMarker: { state: true } };
  }
  static {
    this.styles = i`
    :host {display:block;overflow-x:auto;overscroll-behavior-x:contain;}
    svg {width:100%;min-width:var(--timeline-min-width,900px);height:150px;display:block;touch-action:pan-x pan-y;color:var(--primary-text-color,#222);user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
    line,path {vector-effect:non-scaling-stroke} text {font:12px sans-serif;fill:currentColor}
    .marker {cursor:pointer;touch-action:pan-x pan-y;outline:none}svg.editing .marker{touch-action:none}.marker:focus path,.marker.selected path {stroke:var(--primary-text-color,#222);stroke-width:3}
    .start {fill:var(--orange,#ff861f)} .end {fill:var(--blue,#009edc)}
    .marker.disabled path{fill:#555}.disabled-band{color:#555}.disabled-label{fill:#555;font-weight:700;paint-order:stroke;stroke:var(--card-background-color,#fff);stroke-width:3px}
    .marker.one-off path,.marker.one-off:focus path,.marker.one-off.selected path{stroke:#e53935;stroke-width:2.5}.one-off-badge{pointer-events:none}.one-off-badge circle{fill:var(--ha-card-background,var(--card-background-color,#fff));stroke:#e53935;stroke-width:2}.one-off-badge ha-icon{display:block;width:24px;height:24px;line-height:0;--mdc-icon-size:24px;--ha-icon-size:24px;color:#e53935;transform:scale(.5833333333);transform-origin:top left}.ghost-preview .one-off-preview .ghost-marker{stroke:#e53935}
    .current-label rect{fill:var(--ha-card-background,var(--card-background-color,#fff));stroke:var(--orange,#ff861f);stroke-width:2}
    .current-label text{fill:var(--orange,#ff861f);font-weight:700;font-size:16px}
    .marker-tools{display:flex;gap:6px;margin:4px 0;min-height:44px;flex-wrap:wrap}button{font:inherit;min-height:44px;padding:6px 12px;border:1px solid var(--divider-color,#777);border-radius:7px;background:var(--secondary-background-color,#eee);color:var(--primary-text-color,#222);cursor:pointer}button:focus-visible{outline:3px solid var(--primary-color,#03a9f4)}
    @media(max-width:850px){.odd{display:none}}
    svg.compact .axis-label{font-size:8px}
    .active-schedule.dimmed{opacity:.25}.ghost-preview{pointer-events:none}.ghost-connector{stroke:var(--blue,#009edc);stroke-dasharray:7 5;stroke-width:2}.ghost-marker{fill:none;stroke-width:2;stroke-dasharray:4 3}.ghost-marker.start{stroke:var(--orange,#ff861f)}.ghost-marker.end{stroke:var(--blue,#009edc)}.ghost-preview text{fill:var(--primary-text-color,#222);font-weight:700}.ghost-caption{font-size:12px}
    .disabled-preview .ghost-marker,.disabled-preview .ghost-connector{stroke:#555}.disabled-preview .disabled-label{fill:#555}
  `;
  }
  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
  oneOffBadge(center) {
    return w`<g class="one-off-badge" transform=${`translate(${center} 16) scale(1.3)`} role="img" aria-label="One-off time band"><circle r="10"/><foreignObject x="-7" y="-7" width="14" height="14">${b2`<ha-icon icon="mdi:calendar-clock" aria-hidden="true"></ha-icon>`}</foreignObject></g>`;
  }
  position(event) {
    const canvas = this.shadowRoot.querySelector("svg");
    const matrix = canvas.getScreenCTM();
    if (!matrix) return 0;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return (point.x - 40) / (this.canvasWidth - 80) * 1440;
  }
  doubleClick(event) {
    if (!this.edit || event.button !== 0) return;
    const start = Math.max(0, Math.min(1440, snap(this.position(event))));
    const hit = Array.from(this.shadowRoot.querySelectorAll(".hit-area")).some((node) => {
      const rect = node.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    if (hit || this.sub.bands.some((b3) => start >= b3.start_minute && start <= b3.end_minute)) return;
    clearTimeout(this.hold);
    clearTimeout(this.tap);
    this.gesture = void 0;
    this.lastTap = void 0;
    event.preventDefault();
    this.emit("band-add", { start, end: start + 60, reason: bandError(this.sub, start, start + 60), method: "doubleclick" });
  }
  markers() {
    return this.sub.bands.filter((band) => resolvedBand(band, this.solarMinutes)).flatMap((band) => ["start_minute", "end_minute"].map((endpoint) => ({ key: `${band.id}:${endpoint}`, band, endpoint })));
  }
  promote(key, focus = false) {
    this.activeMarker = key;
    if (focus) void this.updateComplete.then(() => this.shadowRoot?.querySelector(`[data-marker="${key}"]`)?.focus());
  }
  markerHits(event, key) {
    const nodes = Array.from(this.shadowRoot.querySelectorAll("g.marker"));
    const boxes = nodes.map((node) => ({ key: node.dataset.marker, rect: node.querySelector(".hit-area").getBoundingClientRect() }));
    const current = boxes.find((box) => box.key === key);
    const overlap = boxes.some((box) => box.key !== key && current.rect.left < box.rect.right && current.rect.right > box.rect.left && current.rect.top < box.rect.bottom && current.rect.bottom > box.rect.top);
    const candidates = boxes.filter((box) => event.clientX >= box.rect.left && event.clientX <= box.rect.right && event.clientY >= box.rect.top && event.clientY <= box.rect.bottom).map((box) => box.key).reverse();
    return { overlap, candidates };
  }
  down(event, band, endpoint) {
    if (event.button !== 0 || !this.edit && !band) return;
    const minute = Math.max(0, Math.min(1440, snap(this.position(event))));
    if (!band && this.sub.bands.some((b3) => minute >= b3.start_minute - 15 && minute <= b3.end_minute + 15)) return;
    const key = band && endpoint ? `${band.id}:${endpoint}` : void 0;
    const hit = key ? this.markerHits(event, key) : {};
    this.gesture = { x: event.clientX, y: event.clientY, minute, band, endpoint, moved: false, id: event.pointerId, key, previous: this.activeMarker, ...hit };
    if (band) {
      event.preventDefault();
      event.stopPropagation();
      this.shadowRoot.querySelector("svg").setPointerCapture(event.pointerId);
      if (key) this.promote(key);
    } else {
      this.hold = setTimeout(() => {
        this.gesture = void 0;
        this.emit("band-add", { start: minute, end: minute + 60, reason: bandError(this.sub, minute, minute + 60) });
      }, 600);
    }
  }
  move(event) {
    const g2 = this.gesture;
    if (!g2 || g2.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - g2.x, event.clientY - g2.y) > 8) {
      g2.moved = true;
      clearTimeout(this.hold);
    }
    if (this.edit && g2.band && g2.endpoint && !(g2.endpoint === "start_minute" ? g2.band.start_dynamic : g2.band.end_dynamic) && g2.moved) {
      clearTimeout(this.tap);
      this.lastTap = void 0;
      g2.band[g2.endpoint] = clampEndpoint(this.sub, g2.band, g2.endpoint, this.position(event), this.solarMinutes);
      if (g2.band.one_off_run) delete g2.band.one_off_run.minutes;
      this.requestUpdate();
      this.emit("band-change", {});
    }
  }
  up(event) {
    clearTimeout(this.hold);
    const g2 = this.gesture;
    this.gesture = void 0;
    if (!g2?.band || g2.moved) return;
    if (this.edit && (g2.band.start_dynamic || g2.band.end_dynamic)) {
      this.emit("band-edit", g2.band);
      return;
    }
    if (this.edit && !g2.endpoint) {
      this.emit("band-edit", g2.band);
      return;
    }
    if (g2.overlap || !this.edit) {
      clearTimeout(this.tap);
      this.lastTap = void 0;
      const candidates = g2.candidates ?? [];
      const index = candidates.indexOf(g2.previous ?? "");
      const key = index >= 0 && g2.previous === g2.key && candidates.length > 1 ? candidates[(index + 1) % candidates.length] : g2.key;
      if (key) this.promote(key);
      return;
    }
    const at = Date.now();
    if (this.lastTap?.id === g2.band.id && at - this.lastTap.at < 320) {
      clearTimeout(this.tap);
      this.lastTap = void 0;
      this.emit("band-delete", g2.band);
    } else {
      this.lastTap = { id: g2.band.id, at };
      this.tap = setTimeout(() => {
        this.lastTap = void 0;
        this.emit("band-edit", g2.band);
      }, 320);
    }
  }
  cancel() {
    clearTimeout(this.hold);
    this.gesture = void 0;
  }
  connectedCallback() {
    super.connectedCallback();
    this.resize = new ResizeObserver((entries) => {
      const minimum = parseFloat(getComputedStyle(this).getPropertyValue("--timeline-min-width")) || 900;
      this.canvasWidth = Math.max(minimum, entries[0].contentRect.width);
    });
    this.resize.observe(this);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.resize?.disconnect();
    this.cancel();
    clearTimeout(this.tap);
  }
  firstUpdated() {
    const canvas = this.shadowRoot.querySelector("svg");
    if (!this.edit && canvas.clientWidth > this.clientWidth) {
      this.scrollLeft = 40 + this.minute / 1440 * (this.canvasWidth - 80) - this.clientWidth / 2;
    }
  }
  updated(changes) {
    if (changes.has("canvasWidth") || changes.has("sub") || changes.has("solarMinutes")) this.emit("timeline-layout", {});
  }
  render() {
    const x2 = (minute) => 40 + minute / 1440 * (this.canvasWidth - 80);
    const markers = this.markers();
    markers.sort((a3, b3) => Number(a3.key === this.activeMarker) - Number(b3.key === this.activeMarker));
    const selected = markers.find((marker) => marker.key === this.activeMarker);
    const unavailable = this.sub.bands.filter((band) => !resolvedBand(band, this.solarMinutes));
    return b2`<svg class=${`${this.edit ? "editing " : ""}${this.canvasWidth < 760 ? "compact" : ""}`} viewBox=${`0 0 ${this.canvasWidth} 150`} aria-label="Daily schedule, 00:00 to end of day midnight" @dblclick=${this.doubleClick} @contextmenu=${(e5) => e5.preventDefault()} @pointerdown=${(e5) => this.down(e5)} @pointermove=${this.move} @pointerup=${this.up} @pointercancel=${this.cancel} @pointerleave=${() => {
      if (!this.gesture?.band) this.cancel();
    }}>
      <line class="axis" x1="40" y1="108" x2=${this.canvasWidth - 40} y2="108" stroke="currentColor" stroke-width="3"/>
      ${Array.from({ length: 25 }, (_2, hour) => w`<line x1=${x2(hour * 60)} y1="100" x2=${x2(hour * 60)} y2="117" stroke="currentColor"/><text class=${`axis-label ${hour % 2 ? "odd" : ""}`} x=${x2(hour * 60)} y="141" text-anchor="middle">${time(hour * 60)}</text>`)}
      ${unavailable.map((band, index) => w`<text class=${`unavailable-band ${bandDisabled(band) ? "disabled-label" : ""}`} x="40" y=${18 + index * 14} role=${this.edit ? "button" : "img"} tabindex=${this.edit ? "0" : "-1"} aria-label=${this.edit ? "Edit unavailable dynamic time band" : "Solar event unavailable"} @click=${() => {
      if (this.edit) this.emit("band-edit", band);
    }} @keydown=${(e5) => {
      if (this.edit && e5.key === "Enter") {
        this.emit("band-edit", band);
        e5.preventDefault();
      }
    }}>${bandDisabled(band) ? "Disabled \xB7 " : ""}Solar event unavailable *</text>`)}
      <g class=${`active-schedule ${this.previewSub ? "dimmed" : ""}`}>
      ${this.sub.bands.map((b3) => {
      const minutes = resolvedBand(b3, this.solarMinutes);
      return minutes ? w`<g class=${bandDisabled(b3) ? "disabled-band" : ""}><rect class="band-hit" x=${x2(minutes[0]) + 14} y="30" width=${Math.max(0, x2(minutes[1]) - x2(minutes[0]) - 28)} height="78" fill="transparent" @pointerdown=${(e5) => {
        if (this.edit) this.down(e5, b3);
      }}/><line x1=${x2(minutes[0])} y1="78" x2=${x2(minutes[1])} y2="78" stroke="currentColor" stroke-dasharray="6 5" pointer-events="none"/>${bandDisabled(b3) ? w`<text class="disabled-label" x=${x2((minutes[0] + minutes[1]) / 2)} y="24" text-anchor="middle">Disabled</text>` : A}</g>` : A;
    })}
      ${c4(markers, (marker) => marker.key, ({ key, band: b3, endpoint }) => {
      const start = endpoint === "start_minute";
      const minutes = resolvedBand(b3, this.solarMinutes);
      const minute = minutes[start ? 0 : 1], dynamic = start ? b3.start_dynamic : b3.end_dynamic, label = `${time(minute)}${dynamic ? " *" : ""}`;
      const touching = this.sub.bands.some((other) => other.id !== b3.id && resolvedBand(other, this.solarMinutes)?.[start ? 1 : 0] === minute);
      const offset = touching ? start ? 12 : -12 : 0;
      const compact = minutes[1] - minutes[0] < 15;
      const top = !start && compact ? 66 : 36;
      const bottom = !start && compact ? 104 : 88;
      const center = x2(minute) + offset;
      const labelY = (top + bottom) / 2;
      return w`<g data-marker=${key} class="marker ${start ? "start" : "end"} ${b3.one_off ? "one-off" : ""} ${bandDisabled(b3) ? "disabled" : ""} ${key === this.activeMarker ? "selected" : ""}" role="button" tabindex="0" aria-pressed=${key === this.activeMarker} aria-label=${`${b3.one_off ? "One-off. " : ""}${bandDisabled(b3) ? "Disabled. " : ""}${start ? "Target start" : "Setback stop"} ${time(minute)}${minute === 1440 ? " End of day / midnight" : ""}. ${this.edit ? "Enter edits, Delete removes band, arrows adjust five minutes." : "Select to bring forward. Tab selects overlapping markers."}`}
            @pointerdown=${(e5) => this.down(e5, b3, endpoint)}
            @focus=${() => {
        if (this.activeMarker !== key) this.promote(key, true);
      }}
            @keydown=${(e5) => {
        if (!this.edit) {
          if (e5.key === "Enter" || e5.key === " ") {
            this.promote(key);
            e5.preventDefault();
          }
          return;
        }
        if (e5.key === "Enter") {
          this.emit("band-edit", b3);
          e5.preventDefault();
        }
        if (e5.key === "Delete") {
          this.emit("band-delete", b3);
          e5.preventDefault();
        }
        if (["ArrowLeft", "ArrowRight"].includes(e5.key)) {
          if (!(endpoint === "start_minute" ? b3.start_dynamic : b3.end_dynamic)) {
            b3[endpoint] = clampEndpoint(this.sub, b3, endpoint, minute + (e5.key === "ArrowLeft" ? -5 : 5), this.solarMinutes);
            if (b3.one_off_run) delete b3.one_off_run.minutes;
            this.emit("band-change", {});
            this.requestUpdate();
          }
          e5.preventDefault();
        }
      }}>
            <rect class="hit-area" x=${center - 14} y=${top} width="28" height=${108 - top} fill="transparent"/>
            <path d=${`M ${x2(minute)} 108 L ${center - 9} ${bottom} L ${center - 9} ${top} L ${center + 9} ${top} L ${center + 9} ${bottom} Z`}/>
            <text x=${center} y=${labelY} transform=${`rotate(-90 ${center} ${labelY})`} text-anchor="middle" dominant-baseline="central" style="fill:white;pointer-events:none">${label}</text>
          </g>`;
    })}
      </g>
      ${this.sub.bands.filter((b3) => b3.one_off).map((b3) => {
      const minutes = resolvedBand(b3, this.solarMinutes);
      return minutes ? this.oneOffBadge(x2((minutes[0] + minutes[1]) / 2)) : A;
    })}
      ${this.showCurrentTime ? w`<line class="current-line" x1=${x2(this.minute)} y1="31" x2=${x2(this.minute)} y2="149" stroke="var(--orange,#ff861f)" stroke-width="3.5" pointer-events="none"/>` : A}
      ${this.previewSub ? w`<g class="ghost-preview" role="img" aria-label=${`Preview ${this.previewDay} sub-schedule`}>${this.previewSub.bands.map((band) => {
      const minutes = resolvedBand(band, this.previewSolarMinutes);
      return minutes ? w`<g class=${`${bandDisabled(band) ? "disabled-preview" : ""} ${band.one_off ? "one-off-preview" : ""}`}><line class="ghost-connector" x1=${x2(minutes[0])} y1="68" x2=${x2(minutes[1])} y2="68"/>${band.one_off ? this.oneOffBadge(x2((minutes[0] + minutes[1]) / 2)) : A}${bandDisabled(band) ? w`<text class="disabled-label" x=${x2((minutes[0] + minutes[1]) / 2)} y="24" text-anchor="middle">Disabled</text>` : A}${["start_minute", "end_minute"].map((endpoint) => {
        const start = endpoint === "start_minute", minute = minutes[start ? 0 : 1], center = x2(minute), dynamic = start ? band.start_dynamic : band.end_dynamic;
        return w`<g class="ghost-endpoint"><path class=${`ghost-marker ${start ? "start" : "end"}`} d=${`M ${center} 108 L ${center - 9} 82 L ${center - 9} 30 L ${center + 9} 30 L ${center + 9} 82 Z`}/><text x=${center} y="56" text-anchor="middle" dominant-baseline="central" transform=${`rotate(-90 ${center} 56)`}>${time(minute)}${dynamic ? " *" : ""}</text></g>`;
      })}</g>` : A;
    })}</g>` : A}
      ${this.showCurrentTime ? w`<g class="current-label" role="img" aria-label=${`Current time ${time(this.minute)}`} pointer-events="none">
        <rect x=${x2(this.minute) - 32} y="1" width="64" height="30" rx="8"/>
        <text x=${x2(this.minute)} y="22" text-anchor="middle">${time(this.minute)}</text>
      </g>` : A}
    </svg>${this.edit ? b2`<div class="marker-tools">${selected ? b2`<button @click=${() => this.emit("band-edit", selected.band)}>Edit times</button><button @click=${() => this.emit("band-delete", selected.band)}>Delete band…</button>` : A}</div>` : A}`;
  }
};
if (!customElements.get("hsm-timeline")) customElements.define("hsm-timeline", HeatingTimeline);

// src/away.ts
function localDateTime(zone, date = /* @__PURE__ */ new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const part = (type) => parts.find((value) => value.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
function awayUntilLabel(value, zone) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" }).format(new Date(value));
}

// src/card.ts
var SchedulingManagerCard = class extends i4 {
  constructor() {
    super(...arguments);
    this.hassViewSignature = "";
    this.caps = [];
    this.error = "";
    this.busy = false;
    this.clock = localClock("UTC");
    this.filters = allFilters();
    this.collapsedCategories = /* @__PURE__ */ new Set();
    this.followCurrentOnResize = false;
    this.emptyTimeline = { id: "empty-view", days: [], bands: [] };
    this.peekInteraction = (event) => {
      if (this.popup?.kind === "preview-subs") {
        if (event instanceof KeyboardEvent && event.key === "Escape") {
          this.closePreviewChooser();
          return;
        }
        const chooser = event.composedPath().some((node) => node instanceof HTMLElement && node.dataset.previewChooser === this.popup.sectionId);
        if (chooser) return;
        if (event.type === "pointerdown") this.closePreviewChooser();
      }
      if (!this.peek) return;
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        this.hidePeek();
        return;
      }
      const path = event.composedPath();
      const inside = path.some((node) => node instanceof HTMLElement && node.dataset.previewScope === this.peek.sectionId);
      const day = path.some((node) => node instanceof HTMLElement && (node.classList.contains("view-day") || node.classList.contains("view-sub-number")));
      if (event.type === "pointerdown" && !(inside && day)) this.hidePeek();
    };
    this.epoch = 0;
    this.beforeClose = (event) => {
      if (this.draft) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    this.resume = () => {
      this.updateClock();
      void this.load();
    };
    this.previewLayout = () => {
      if (this.popup?.kind === "preview-subs") this.placePreviewOptions();
    };
  }
  static {
    this.properties = { hass: { attribute: false, noAccessor: true }, saved: { state: true }, draft: { state: true }, popup: { state: true }, confirmation: { state: true }, error: { state: true }, busy: { state: true }, awayAction: { state: true }, clock: { state: true }, caps: { state: true }, filters: { state: true }, collapsedCategories: { state: true }, sharedTime: { state: true }, peek: { state: true } };
  }
  set hass(value) {
    this._hass = value;
    const reconnect = this.isConnected && this.connection !== value.connection;
    if (reconnect) void this.connect();
    const ids = new Set(Object.values({ ...this.saved?.model.entity_settings, ...this.draft?.settings }).map((setting) => setting.entity_id));
    const signature = JSON.stringify([viewTitle(this), ...Array.from(ids, (eid) => {
      const state = value.states[eid];
      return [eid, state?.attributes.friendly_name, !!state, state?.state === "unknown" || state?.state === "unavailable"];
    })]);
    if (reconnect || signature !== this.hassViewSignature) {
      this.hassViewSignature = signature;
      this.requestUpdate();
    }
  }
  get hass() {
    return this._hass;
  }
  setConfig(_config) {
    this.requestUpdate();
  }
  getCardSize() {
    return 3 + (this.saved?.model.schedules.length ?? 0) * 3;
  }
  connectedCallback() {
    super.connectedCallback();
    this.interval = setInterval(() => this.updateClock(), 3e4);
    document.addEventListener("visibilitychange", this.resume);
    window.addEventListener("beforeunload", this.beforeClose);
    document.addEventListener("pointerdown", this.peekInteraction, true);
    document.addEventListener("keydown", this.peekInteraction, true);
    document.addEventListener("scroll", this.previewLayout, true);
    window.addEventListener("resize", this.previewLayout);
    this.layoutResize = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      if (this.lastLayoutWidth === void 0 || Math.abs(width - this.lastLayoutWidth) > 1) this.followCurrentOnResize = true;
      this.lastLayoutWidth = width;
      this.queueTimeLayout();
    });
    this.layoutResize.observe(this);
    if (this._hass) void this.connect();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.epoch++;
    this.unsubscribe?.();
    this.unsubscribe = void 0;
    this.connection = void 0;
    clearInterval(this.interval);
    document.removeEventListener("visibilitychange", this.resume);
    window.removeEventListener("beforeunload", this.beforeClose);
    document.removeEventListener("pointerdown", this.peekInteraction, true);
    document.removeEventListener("keydown", this.peekInteraction, true);
    clearTimeout(this.peekTimer);
    this.peekTimer = void 0;
    this.peek = void 0;
    document.removeEventListener("scroll", this.previewLayout, true);
    window.removeEventListener("resize", this.previewLayout);
    this.layoutResize?.disconnect();
    if (this.layoutFrame !== void 0) cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = void 0;
  }
  async connect() {
    const token = ++this.epoch;
    this.unsubscribe?.();
    this.connection = this.hass.connection;
    await this.load();
    try {
      const unsubscribe = await this.hass.connection.subscribeMessage((data) => {
        if (token === this.epoch) {
          this.saved = data;
          this.updateClock();
        }
      }, { type: "heating_schedule_manager/subscribe" });
      if (token !== this.epoch) unsubscribe();
      else this.unsubscribe = unsubscribe;
    } catch (e5) {
      this.fail(e5);
    }
  }
  async load() {
    if (!this._hass) return;
    try {
      this.saved = await this.hass.callWS({ type: "heating_schedule_manager/get" });
      this.caps = await this.hass.callWS({ type: "heating_schedule_manager/capabilities" });
      this.updateClock();
    } catch (e5) {
      this.fail(e5);
    }
  }
  async refreshCaps() {
    try {
      this.caps = await this.hass.callWS({ type: "heating_schedule_manager/capabilities" });
      return true;
    } catch (e5) {
      this.fail(e5);
      return false;
    }
  }
  updateClock() {
    const clock = localClock(this.saved?.timezone ?? "UTC");
    if (clock.day !== this.clock.day || clock.minute !== this.clock.minute || clock.weekday !== this.clock.weekday) this.clock = clock;
  }
  hidePeek() {
    clearTimeout(this.peekTimer);
    this.peekTimer = void 0;
    this.peek = void 0;
  }
  resetPeekTimer() {
    clearTimeout(this.peekTimer);
    this.peekTimer = setTimeout(() => this.hidePeek(), 1e4);
  }
  openPreviewChooser(section) {
    if (this.popup?.kind === "preview-subs" && this.popup.sectionId === section.id) {
      this.closePreviewChooser();
      return;
    }
    clearTimeout(this.peekTimer);
    this.peekTimer = void 0;
    this.popup = { kind: "preview-subs", sectionId: section.id };
  }
  closePreviewChooser() {
    this.popup = void 0;
    if (this.peek) this.resetPeekTimer();
  }
  previewDay(section, day) {
    if (this.peek?.sectionId === section.id && this.peek.day === day) {
      this.hidePeek();
      return;
    }
    const sub = section.sub_schedules.find((schedule) => schedule.days.includes(day));
    if (!sub) return;
    if (sub.days.includes(this.clock.day)) {
      this.hidePeek();
      return;
    }
    this.peek = { sectionId: section.id, subId: sub.id, day };
    this.resetPeekTimer();
  }
  queueTimeLayout() {
    if (this.layoutFrame !== void 0 || !this.isConnected) return;
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = void 0;
      this.measureEntityLists();
      this.positionDisabledLabels();
      this.measureSharedTime();
      this.previewLayout();
    });
  }
  syncTimelineScroll(event) {
    const source = event.currentTarget;
    this.sharedScroll = source.scrollLeft;
    this.shadowRoot?.querySelectorAll("hsm-timeline").forEach((timeline) => {
      if (timeline !== source && Math.abs(timeline.scrollLeft - source.scrollLeft) > 1) timeline.scrollLeft = source.scrollLeft;
    });
    this.queueTimeLayout();
  }
  measureSharedTime() {
    const root = this.shadowRoot, card = root?.querySelector("ha-card"), sections = Array.from(root?.querySelectorAll("section") ?? []);
    if (!card || !sections.length) {
      if (this.sharedTime) this.sharedTime = void 0;
      return;
    }
    const bounds = card.getBoundingClientRect();
    const timeline = root.querySelector("hsm-timeline");
    const canvas = timeline?.shadowRoot?.querySelector("svg");
    const region = sections[0].querySelector(".timeline-region").getBoundingClientRect();
    let screenX;
    if (canvas?.getScreenCTM()) {
      const width = canvas.viewBox.baseVal.width;
      screenX = new DOMPoint(40 + this.clock.minute / 1440 * (width - 80), 0).matrixTransform(canvas.getScreenCTM()).x;
      const viewport = timeline.getBoundingClientRect();
      if (screenX < viewport.left || screenX > viewport.right) {
        if (this.followCurrentOnResize) {
          this.followCurrentOnResize = false;
          timeline.scrollLeft = 40 + this.clock.minute / 1440 * (width - 80) - viewport.width / 2;
          this.sharedScroll = timeline.scrollLeft;
          root.querySelectorAll("hsm-timeline").forEach((row) => {
            row.scrollLeft = timeline.scrollLeft;
          });
          this.queueTimeLayout();
          return;
        }
        if (this.sharedTime) this.sharedTime = void 0;
        return;
      }
    } else {
      const minimum = parseFloat(getComputedStyle(this).getPropertyValue("--timeline-min-width")) || 900;
      const width = Math.max(minimum, region.width), point = 40 + this.clock.minute / 1440 * (width - 80);
      const scroll = this.sharedScroll ?? Math.max(0, Math.min(width - region.width, point - region.width / 2));
      screenX = region.left + point - scroll;
    }
    this.followCurrentOnResize = false;
    const firstCanvas = sections[0].querySelector("hsm-timeline")?.shadowRoot?.querySelector("svg");
    const top = (firstCanvas?.getBoundingClientRect().top ?? sections[0].getBoundingClientRect().top + 36) - bounds.top;
    const height = sections[sections.length - 1].getBoundingClientRect().bottom - bounds.top - top - 8;
    const next = { left: screenX - bounds.left, top, height };
    if (!this.sharedTime || Object.keys(next).some((key) => Math.abs(next[key] - this.sharedTime[key]) > 0.5)) this.sharedTime = next;
  }
  fail(error) {
    this.error = error?.message ?? String(error);
  }
  changed() {
    this.draft = { ...this.draft };
    this.openEditingCategory();
  }
  openEditingCategory() {
    if (this.draft && this.collapsedCategories.has(categoryKey(this.draft.section))) {
      const next = new Set(this.collapsedCategories);
      next.delete(categoryKey(this.draft.section));
      this.collapsedCategories = next;
    }
  }
  ask(message) {
    return new Promise((resolve) => {
      this.confirmation = { message, resolve };
    });
  }
  async discard() {
    if (this.draft && !await this.ask("Discard these unsaved changes?")) return false;
    this.draft = void 0;
    this.popup = void 0;
    this.error = "";
    return true;
  }
  async edit(section) {
    this.hidePeek();
    if (!await this.discard() || !await this.refreshCaps() || this.draft || this.popup) return;
    const current = this.saved.model.schedules.find((s5) => s5.id === section.id);
    if (current) {
      this.draft = begin(this.saved.model, current);
      this.openEditingCategory();
    }
  }
  async save() {
    const draft = this.draft;
    const invalid = draftError(draft, this.caps);
    if (invalid) {
      this.error = invalid;
      return;
    }
    for (const sub of draft.section.sub_schedules) {
      const name = this.subName(sub);
      if (name) sub.name = name;
      else delete sub.name;
    }
    if (draft.deleted && draft.isNew) {
      this.draft = void 0;
      return;
    }
    this.busy = true;
    this.error = "";
    const settings = {};
    if (!draft.deleted) for (const member of draft.section.entities) settings[member.entity_key] = draft.settings[member.entity_key];
    try {
      this.saved = await this.hass.callWS({ type: "heating_schedule_manager/save_section", expected_revision: draft.revision, operation: draft.deleted ? "delete" : "upsert", section_id: draft.section.id, ...!draft.deleted ? { section: draft.section, settings } : {} });
      this.draft = void 0;
      this.popup = void 0;
    } catch (e5) {
      this.fail(e5);
    } finally {
      this.busy = false;
    }
  }
  openAway() {
    this.hidePeek();
    this.error = "";
    const until = this.saved.model.away_until;
    this.popup = { kind: "away", mode: until ? "until" : "now", until: localDateTime(this.saved.timezone, until ? new Date(until) : new Date(Date.now() + 864e5)) };
  }
  async away(enabled, until) {
    this.busy = true;
    this.awayAction = enabled ? "on" : "off";
    this.error = "";
    try {
      this.saved = await this.hass.callWS({ type: "heating_schedule_manager/set_away", away: enabled, expected_revision: this.saved.model.revision, ...until !== void 0 ? { until } : {} });
      return true;
    } catch (e5) {
      this.fail(e5);
      return false;
    } finally {
      this.busy = false;
      this.awayAction = void 0;
    }
  }
  async toggleSection(section) {
    this.busy = true;
    this.error = "";
    try {
      this.saved = await this.hass.callWS({ type: "heating_schedule_manager/set_section_enabled", expected_revision: this.saved.model.revision, section_id: section.id, enabled: section.enabled === false });
    } catch (e5) {
      this.fail(e5);
    } finally {
      this.busy = false;
    }
  }
  addBand(detail) {
    const sub = this.draft.section.sub_schedules[this.draft.selected];
    if (sub.bands.length >= 10) {
      this.error = "Maximum ten bands per sub-schedule.";
      return;
    }
    if (detail.reason) {
      if (detail.method === "doubleclick") {
        this.error = "A one-hour band does not fit here. Use Add time band to choose another interval.";
        return;
      }
      this.popup = { kind: "band", start: time(Math.min(detail.start, 1435)), end: time(Math.min(detail.end, 1440)), reason: "A full one-hour band does not fit here. Choose a shorter free interval explicitly." };
      return;
    }
    sub.bands.push({ id: uuid(), start_minute: detail.start, end_minute: detail.end });
    sub.bands.sort((a3, b3) => a3.start_minute - b3.start_minute);
    this.changed();
  }
  async removeBand(band) {
    if (await this.ask(`Delete time band ${time(band.start_minute)}\u2013${time(band.end_minute)}? The change takes effect on Save.`)) {
      const sub = this.draft.section.sub_schedules[this.draft.selected];
      sub.bands = sub.bands.filter((b3) => b3.id !== band.id);
      this.changed();
      return true;
    }
    return false;
  }
  editBand(band) {
    this.popup = { kind: "band", band, start: time(band.start_minute), end: time(band.end_minute), start_dynamic: band.start_dynamic ? { ...band.start_dynamic } : void 0, end_dynamic: band.end_dynamic ? { ...band.end_dynamic } : void 0, disabled: bandDisabled(band), disableMode: band.disabled_until ? "until" : "permanent", until: band.disabled_until, reason: "" };
  }
  solarFor(sub) {
    return this.saved?.solar_times?.[solarDate(this.saved.timezone, sub && !sub.days.includes(this.clock.day) ? sub.days[0] : void 0)];
  }
  async temperature(key, target) {
    const sectionId = this.draft?.section.id;
    if (!await this.refreshCaps() || !this.draft || this.draft.section.id !== sectionId) return;
    const value = target ? this.draft.section.entities.find((m3) => m3.entity_key === key)?.target : this.draft.settings[key]?.setback;
    if (!value) return;
    const cap = this.cap(key);
    let converted = value.value;
    if (value.unit !== cap?.unit && cap) converted = cap.unit === "\xB0F" ? value.value * 9 / 5 + 32 : (value.value - 32) * 5 / 9;
    this.popup = { kind: "temperature", key, target, value: converted };
  }
  cap(key) {
    return this.caps.find((c5) => c5.entity_id === (this.draft?.settings[key] ?? this.saved?.model.entity_settings[key])?.entity_id);
  }
  async editState(key, start) {
    const sectionId = this.draft?.section.id;
    if (!await this.refreshCaps() || !this.draft || this.draft.section.id !== sectionId) return;
    const member = this.draft.section.entities.find((m3) => m3.entity_key === key);
    if (!member) return;
    let value = start ? member.start_state : member.end_state;
    const oldUnit = start ? member.start_unit : member.end_unit, cap = this.cap(key);
    if (typeof value === "number" && oldUnit && cap?.unit && oldUnit !== cap.unit && ["\xB0C", "\xB0F"].includes(oldUnit) && ["\xB0C", "\xB0F"].includes(cap.unit)) value = cap.unit === "\xB0F" ? value * 9 / 5 + 32 : (value - 32) * 5 / 9;
    this.popup = { kind: "state", key, start, value };
  }
  async addEntity() {
    const sectionId = this.draft?.section.id;
    if (await this.refreshCaps() && sectionId && this.draft?.section.id === sectionId) this.popup = { kind: "entities", query: "" };
  }
  async applyPopup(event) {
    event.preventDefault();
    const p4 = this.popup;
    this.error = "";
    if (p4.kind === "away") {
      if (!await this.away(true, p4.mode === "until" ? p4.until : null)) return;
    } else if (p4.kind === "name") {
      if (!p4.value.trim()) {
        this.error = "Enter a name.";
        return;
      }
      try {
        this.draft = begin(this.saved.model, void 0, p4.value.trim());
      } catch (error) {
        this.fail(error);
        return;
      }
      this.openEditingCategory();
    } else if (p4.kind === "category") {
      const name = p4.choice === "new" ? p4.name.trim() : p4.choice.startsWith("category:") ? p4.choice.slice(9) : null;
      if (p4.choice === "new" && !name) {
        this.error = "Enter a category name.";
        return;
      }
      this.draft.section.category = name;
      this.changed();
    } else if (p4.kind === "filters") {
      this.filters = normalizeFilters(p4.filters, filterOptions(this.saved.model.schedules, this.saved.locations));
      this.openEditingCategory();
    } else if (p4.kind === "temperature") {
      const cap = this.cap(p4.key);
      if (!cap || !validTemperature(p4.value, cap)) {
        this.error = "Temperature is out of range or off the supported step.";
        return;
      }
      const value = { value: p4.value, unit: cap.unit };
      if (p4.target) this.draft.section.entities.find((m3) => m3.entity_key === p4.key).target = value;
      else this.draft.settings[p4.key].setback = value;
      this.changed();
    } else if (p4.kind === "state") {
      const cap = this.cap(p4.key);
      if (!cap || !validState(p4.value, cap)) {
        this.error = "Choose a valid state for this entity.";
        return;
      }
      const member = this.draft.section.entities.find((m3) => m3.entity_key === p4.key);
      if (p4.start) {
        member.start_state = p4.value;
        if (cap.kind === "number") member.start_unit = cap.unit ?? "";
      } else {
        member.end_state = p4.value;
        if (cap.kind === "number") member.end_unit = cap.unit ?? "";
      }
      this.changed();
    } else if (p4.kind === "entities") {
      const cap = this.caps.find((c5) => c5.entity_id === p4.selected);
      if (!cap || !cap.supported) {
        this.error = "Select a writable entity.";
        return;
      }
      const climate = cap.entity_id.startsWith("climate.");
      if (climate ? p4.target === void 0 || p4.setback === void 0 || !validTemperature(p4.target, cap) || !validTemperature(p4.setback, cap) : !validState(p4.start, cap) || !validState(p4.end, cap)) {
        this.error = climate ? "Choose valid temperatures." : "Choose valid Start and Stop states.";
        return;
      }
      const existing = Object.entries(this.draft.settings).find(([, s5]) => s5.entity_id === cap.entity_id);
      const key = existing?.[0] ?? uuid();
      this.draft.settings[key] = existing?.[1] ?? { entity_id: cap.entity_id, registry_id: cap.registry_id, ...climate ? { setback: { value: p4.setback, unit: cap.unit } } : {} };
      this.draft.section.entities.push(climate ? { entity_key: key, target: { value: p4.target, unit: cap.unit } } : { entity_key: key, start_state: p4.start, end_state: p4.end, ...cap.kind === "number" ? { start_unit: cap.unit ?? "", end_unit: cap.unit ?? "" } : {} });
      this.changed();
    } else if (p4.kind === "sub-disable") {
      if (p4.disabled && p4.disableMode === "until" && !p4.until) {
        this.error = "Choose a date and time to re-enable the sub-schedule.";
        return;
      }
      delete p4.sub.enabled;
      delete p4.sub.disabled_until;
      if (p4.disabled) {
        p4.sub.enabled = false;
        if (p4.disableMode === "until") p4.sub.disabled_until = p4.until;
      }
      this.changed();
    } else if (p4.kind === "band") {
      const start = parseTime(p4.start);
      let end = parseTime(p4.end);
      const sub = this.draft.section.sub_schedules[this.draft.selected];
      if (!p4.end_dynamic && Number.isInteger(end)) {
        if (!p4.start_dynamic && Number.isInteger(start) && end < start + 5 && start < 1440) end = Math.min(1440, start + 5);
        if (p4.start_dynamic) {
          const minutes = resolvedBand({ id: "popup", start_minute: start, end_minute: end, start_dynamic: p4.start_dynamic }, this.solarFor(sub));
          if (minutes && end <= minutes[0]) end = Math.floor(end / 5) * 5;
        }
      }
      const band = { id: p4.band?.id ?? uuid(), start_minute: start, end_minute: end, ...p4.start_dynamic ? { start_dynamic: { ...p4.start_dynamic } } : {}, ...p4.end_dynamic ? { end_dynamic: { ...p4.end_dynamic } } : {} };
      if (p4.band?.one_off || !p4.band && p4.one_off) band.one_off = true;
      if (p4.disabled && !band.one_off) {
        band.enabled = false;
        if (p4.disableMode === "until") {
          if (!p4.until) {
            this.error = "Choose a date and time to re-enable the band.";
            return;
          }
          band.disabled_until = p4.until;
        }
      }
      const error = bandError(sub, start, end, p4.band?.id, band);
      if (error) {
        this.error = error;
        return;
      }
      if (p4.band) {
        delete p4.band.start_dynamic;
        delete p4.band.end_dynamic;
        delete p4.band.enabled;
        delete p4.band.disabled_until;
        Object.assign(p4.band, band);
        if (p4.band.one_off_run) delete p4.band.one_off_run.minutes;
      } else sub.bands.push(band);
      sub.bands.sort((a3, b3) => a3.start_minute - b3.start_minute);
      this.changed();
    }
    this.popup = void 0;
  }
  chooseEntity(cap) {
    const p4 = this.popup;
    if (!cap.entity_id.startsWith("climate.")) {
      let suggested2 = cap.current ?? "";
      if (!validState(suggested2, cap)) suggested2 = cap.kind === "number" ? cap.min ?? 0 : cap.options?.[0] ?? "";
      this.popup = { ...p4, selected: cap.entity_id, start: suggested2, end: suggested2 };
      return;
    }
    const existing = Object.values(this.draft.settings).find((s5) => s5.entity_id === cap.entity_id);
    const suggested = typeof cap.current === "number" && validTemperature(cap.current, cap) ? cap.current : cap.min;
    let setback = existing?.setback?.value ?? suggested;
    if (existing?.setback && existing.setback.unit !== cap.unit) setback = cap.unit === "\xB0F" ? setback * 9 / 5 + 32 : (setback - 32) * 5 / 9;
    this.popup = { ...p4, selected: cap.entity_id, target: suggested, setback };
  }
  trashIcon() {
    return b2`<svg class="trash-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>`;
  }
  subName(sub) {
    return typeof sub?.name === "string" ? sub.name.trim() : "";
  }
  subLabel(sub, index) {
    const name = this.subName(sub);
    return `${index + 1}${name ? ` \xB7 ${name}` : ""}`;
  }
  section(section, editing) {
    const draft = editing ? this.draft : void 0;
    const settings = draft?.settings ?? this.saved.model.entity_settings;
    const selected = draft?.selected ?? section.sub_schedules.findIndex((s5) => s5.days.includes(this.clock.day));
    const sub = section.sub_schedules[selected];
    const subDisabled = !!sub && bandDisabled(sub);
    const allDaysAssigned = new Set(section.sub_schedules.flatMap((schedule) => schedule.days)).size === 7;
    const away = this.saved.model.away && section.away_enabled !== false;
    const enabled = section.enabled !== false;
    const preview = !editing && this.peek?.sectionId === section.id ? section.sub_schedules.find((schedule) => schedule.id === this.peek.subId) : void 0;
    const displayedSub = preview ?? sub;
    const displayedSubNumber = displayedSub ? section.sub_schedules.indexOf(displayedSub) + 1 : void 0;
    const displayedSubLabel = displayedSub ? this.subLabel(displayedSub, displayedSubNumber - 1) : "";
    const viewStatus = !editing ? away ? "Away" : !enabled ? "Disabled" : !sub ? "No Schedule" : void 0 : void 0;
    return b2`<section class=${`${editing ? "editing " : !enabled ? "disabled-schedule " : ""}${this.popup?.kind === "preview-subs" && this.popup.sectionId === section.id ? "preview-open " : ""}${section.category ? "has-category" : ""}`} aria-label=${section.name} ?inert=${editing && this.busy}>
      ${section.category ? b2`<span class="category-watermark" aria-label=${`Category: ${section.category}`}>${section.category}</span>` : A}
      <div class="schedule-panel">
      <div class="section-meta">
        <button class="name" ?disabled=${!editing} @click=${() => {
      const name = prompt("Rename section", section.name);
      if (name !== null) {
        section.name = name;
        this.changed();
      }
    }}>${section.name}</button>
        ${!editing ? b2`<div class="tools"><button class=${enabled ? "disable" : "enable"} ?disabled=${!this.saved.editable || this.busy} aria-label=${`${enabled ? "Disable" : "Enable"} ${section.name}`} title=${enabled ? "Suspend this schedule; climate entities receive setback" : "Resume this schedule; apply active start values"} @click=${() => this.toggleSection(section)}>${enabled ? "Disable" : "Enable"}</button><button class="burger" ?disabled=${!this.saved.editable || this.busy} aria-label=${`Edit ${section.name}`} @click=${() => this.edit(section)}><ha-icon icon="mdi:cog" aria-hidden="true"></ha-icon></button></div>` : A}
      </div>
      ${section.entities.length > 6 ? b2`<div class="entity-scroll-controls"><span>${section.entities.length} entities</span><button aria-label=${`Scroll ${section.name} entities up`} @click=${(e5) => this.scrollEntities(e5, -1)}>↑</button><button aria-label=${`Scroll ${section.name} entities down`} @click=${(e5) => this.scrollEntities(e5, 1)}>↓</button></div>` : A}
      <div class=${`entity-list ${section.entities.length > 6 ? "overflowing" : ""}`} role="region" aria-label=${`${section.name} entities`} tabindex=${section.entities.length > 6 ? "0" : "-1"}><div class="entities">${section.entities.map((member) => {
      const setting = settings[member.entity_key];
      const cap = this.caps.find((c5) => c5.entity_id === setting.entity_id);
      const liveState = this.hass.states[setting.entity_id];
      const available = !!liveState && (liveState.state === void 0 ? !!cap?.available : !["unknown", "unavailable"].includes(liveState.state));
      const temp = (value, target) => b2`<button class=${target ? "target" : "setback"} ?disabled=${!editing} aria-label=${`${target ? "Target" : "Shared setback"} for ${cap?.name ?? setting.entity_id}`} @click=${() => this.temperature(member.entity_key, target)}>${value.value}<small>${value.unit}</small></button>`;
      const state = (value, start) => b2`<button class=${start ? "target" : "setback"} ?disabled=${!editing} aria-label=${`${start ? "Start" : "Stop"} state for ${cap?.name ?? setting.entity_id}`} @click=${() => this.editState(member.entity_key, start)}>${value === "on" || value === "off" ? value.toUpperCase() : value}${start ? member.start_unit ? b2`<small>${member.start_unit}</small>` : A : member.end_unit ? b2`<small>${member.end_unit}</small>` : A}</button>`;
      const climate = setting.entity_id.startsWith("climate.");
      return b2`<div class="entity">${climate ? temp(member.target, true) : state(member.start_state, true)}<span title=${setting.entity_id}>${liveState?.attributes.friendly_name ?? cap?.name ?? setting.entity_id}${!available ? b2`<small>Unavailable · cached settings</small>` : A}</span>${climate ? temp(setting.setback, false) : state(member.end_state, false)}${editing ? b2`<button class="trash-button entity-trash" aria-label=${`Remove ${setting.entity_id}`} title="Remove entity from section" @click=${async () => {
        if (await this.ask("Remove this entity on Save?")) {
          section.entities = section.entities.filter((m3) => m3.entity_key !== member.entity_key);
          this.changed();
        }
      }}>${this.trashIcon()}</button>` : A}</div>`;
    })}</div></div>
      ${editing ? b2`<div class="edit-footer"><div class="edit-actions"><button class="add" @click=${this.addEntity}>＋ Entity</button><button class=${section.away_enabled !== false ? "selected" : "disable"} aria-label="Schedule Away participation" aria-pressed=${section.away_enabled !== false} @click=${() => {
      section.away_enabled = section.away_enabled === false;
      this.changed();
    }}>Away ${section.away_enabled !== false ? "included" : "excluded"}</button></div><div class="edit-bottom"><button class="category-button" aria-label="Assign category" @click=${() => {
      this.popup = { kind: "category", choice: section.category ? `category:${section.category}` : "none", name: "" };
    }}>Category${section.category ? `: ${section.category}` : ""}</button><div class="tools"><button class="trash-button section-trash" aria-label="Delete section" title="Delete schedule section" @click=${async () => {
      if (await this.ask("Delete this whole section on Save?")) {
        this.draft.deleted = true;
        this.changed();
      }
    }}>${this.trashIcon()}</button><button ?disabled=${this.busy} @click=${() => this.discard()}>Cancel</button><button class="save" ?disabled=${this.busy || !!draftError(draft, this.caps)} @click=${this.save}>Save</button></div></div></div>` : A}
      </div>
      <div class="timeline-region" data-preview-scope=${section.id}>
        ${!editing ? b2`<div class="view-days" role="list" aria-label="Schedule days">${days.map((label, day) => {
      const owner = section.sub_schedules.find((schedule) => schedule.days.includes(day));
      if (!owner) return b2`<span class="view-day unscheduled" role="listitem" aria-label=${`${label}: No schedule`}>${label}</span>`;
      if (owner === sub) return b2`<span role="listitem"><button class=${`view-day active ${bandDisabled(owner) ? "disabled-day" : ""}`} aria-label=${`Show current ${label} sub-schedule${bandDisabled(owner) ? ", disabled" : ""}`} @click=${() => this.previewDay(section, day)}>${label}</button></span>`;
      const previewed = owner === preview;
      return b2`<span role="listitem"><button class=${`view-day inactive ${previewed ? "previewed" : ""} ${bandDisabled(owner) ? "disabled-day" : ""}`} aria-label=${`Preview ${label} sub-schedule${bandDisabled(owner) ? ", disabled" : ""}`} aria-pressed=${previewed} @click=${() => this.previewDay(section, day)}>${label}</button></span>`;
    })}<span class="preview-selection" role="listitem" data-preview-chooser=${section.id}><span class="preview-size" aria-hidden="true">${section.sub_schedules.map((schedule, index) => b2`<span>${this.subLabel(schedule, index)}</span>`)}</span>${displayedSubNumber ? b2`<button class=${`view-sub-number ${preview ? "preview" : "current"} ${this.subName(displayedSub) ? "named" : ""}`} aria-label=${`Choose preview sub-schedule; ${preview ? "preview" : "current"} ${displayedSubLabel}`} aria-expanded=${this.popup?.kind === "preview-subs" && this.popup.sectionId === section.id} title="Choose a sub-schedule to preview" @click=${() => this.openPreviewChooser(section)}>${displayedSubLabel}</button>` : A}${this.popup?.kind === "preview-subs" && this.popup.sectionId === section.id ? this.previewChoices(section, displayedSub) : A}</span></div>` : A}
        ${!editing && !viewStatus && displayedSub?.disabled_until && bandDisabled(displayedSub) ? b2`<p class="sub-disabled-until">Disabled until ${awayUntilLabel(displayedSub.disabled_until, this.saved.timezone)}</p>` : A}
        ${draft?.deleted ? b2`<p class="empty">Section pending deletion. Save commits; Cancel restores.</p>` : b2`
          ${editing ? b2`<div class="days">${days.map((day, d3) => {
      const owner = section.sub_schedules.findIndex((s5) => s5.days.includes(d3));
      const blocked = owner !== -1 && owner !== selected, locked = sub.bands.some((b3) => b3.one_off_run);
      return b2`<button class=${sub.days.includes(d3) ? `selected ${bandDisabled(sub) ? "disabled-day" : ""}` : ""} ?disabled=${blocked || locked} title=${locked ? "Selected one-off weekdays are read-only" : blocked ? `Assigned to sub-schedule ${owner + 1}` : day} aria-pressed=${sub.days.includes(d3)} @click=${() => {
        sub.days = sub.days.includes(d3) ? sub.days.filter((v3) => v3 !== d3) : [...sub.days, d3];
        this.changed();
      }}>${day}</button>`;
    })}
            <select class="sub-selector" aria-label="Choose sub-schedule" .value=${String(selected)} @change=${(e5) => {
      this.draft.selected = Number(e5.target.value);
      this.changed();
    }}>${section.sub_schedules.map((schedule, index) => b2`<option value=${String(index)} ?selected=${index === selected} title=${schedule.days.map((day) => days[day]).join(", ") || "No days yet"}>${this.subLabel(schedule, index)}</option>`)}</select>
            ${section.sub_schedules.length < 7 && !allDaysAssigned ? b2`<button class="add" aria-label="Add sub-schedule" title="Add sub-schedule" @click=${() => {
      section.sub_schedules.push(newSub());
      this.draft.selected = section.sub_schedules.length - 1;
      this.changed();
    }}>＋</button>` : A}
            <button class=${subDisabled ? "enable" : "disable"} aria-label=${`${subDisabled ? "Enable" : "Disable"} sub-schedule`} @click=${() => {
      if (subDisabled) {
        delete sub.enabled;
        delete sub.disabled_until;
        this.changed();
      } else {
        this.popup = { kind: "sub-disable", sub, disabled: false, disableMode: sub.disabled_until ? "until" : "permanent", until: sub.disabled_until };
      }
    }}>${subDisabled ? "Enable" : "Disable"}</button>
            ${section.sub_schedules.length > 1 ? b2`<button class="remove" aria-label="Delete sub-schedule" title="Delete sub-schedule" @click=${async () => {
      if (await this.ask("Delete this sub-schedule on Save?")) {
        section.sub_schedules.splice(selected, 1);
        this.draft.selected = 0;
        this.changed();
      }
    }}>${this.trashIcon()}</button>` : A}
          </div><label class="sub-name">Sub-schedule name (optional)<input aria-label="Sub-schedule name" placeholder=${`Sub-schedule ${selected + 1}`} .value=${l3(typeof sub.name === "string" ? sub.name : "")} @input=${(e5) => {
      sub.name = e5.target.value;
      this.changed();
    }}></label>${away ? b2`<p>Away active — normal transitions are suspended.</p>` : !enabled ? b2`<p>Schedule disabled.</p>` : A}` : A}
          ${viewStatus ? b2`<p class=${`empty ${viewStatus === "Disabled" ? "disabled-empty " : ""}${preview ? "peek-status" : ""}`}>${viewStatus === "Disabled" ? b2`<span class="disabled-placeholder" aria-hidden="true">Disabled</span><span class="disabled-label">Disabled</span>` : viewStatus}</p>` : A}
          ${viewStatus && !preview ? A : b2`<div class=${`peek-timeline ${viewStatus ? "status-preview" : ""}`}><hsm-timeline .sub=${viewStatus ? this.emptyTimeline : sub} .solarMinutes=${this.solarFor(editing ? sub : void 0)} .previewSolarMinutes=${this.saved?.solar_times?.[solarDate(this.saved.timezone, this.peek?.day)]} .previewSub=${preview} .previewDay=${preview ? days[this.peek.day] : ""} .edit=${editing} .minute=${this.clock.minute} .showCurrentTime=${false} @scroll=${this.syncTimelineScroll} @timeline-layout=${this.queueTimeLayout} @band-change=${() => this.changed()} @band-add=${(e5) => this.addBand(e5.detail)} @band-delete=${(e5) => this.removeBand(e5.detail)} @band-edit=${(e5) => this.editBand(e5.detail)}></hsm-timeline></div>`}
          ${editing ? b2`<button class="add-band" ?disabled=${sub.bands.length >= 10} @click=${() => {
      this.popup = { kind: "band", start: "12:00", end: "13:00", reason: "" };
    }}>＋ Add time band</button>` : A}
        `}
      </div>
    </section>`;
  }
  measureEntityLists() {
    this.shadowRoot?.querySelectorAll(".entity-list.overflowing").forEach((list) => {
      const entities = Array.from(list.querySelectorAll(".entity")).slice(0, 6);
      const grid = list.querySelector(".entities");
      const top = grid.getBoundingClientRect().top;
      const height = Math.ceil(Math.max(...entities.map((entity) => entity.getBoundingClientRect().bottom)) - top);
      if (height > 0 && list.style.maxHeight !== `${height}px`) list.style.maxHeight = `${height}px`;
    });
  }
  positionDisabledLabels() {
    this.shadowRoot?.querySelectorAll(".disabled-label").forEach((label) => {
      const section = label.closest("section"), category = section?.querySelector(".category-watermark"), panel = section?.querySelector(".schedule-panel");
      const region = label.closest(".timeline-region"), status = label.parentElement;
      if (!region || !status) return;
      const regionRect = region.getBoundingClientRect(), labelHeight = label.getBoundingClientRect().height;
      if (!matchMedia("(max-width: 850px)").matches && category) {
        const rect = category.getBoundingClientRect();
        label.style.top = `${rect.top + rect.height / 2 - regionRect.top - labelHeight / 2}px`;
        status.style.height = "56px";
      }
    });
  }
  scrollEntities(event, direction) {
    const list = event.currentTarget.closest(".schedule-panel")?.querySelector(".entity-list");
    list?.scrollBy({ top: direction * list.clientHeight, behavior: "smooth" });
  }
  toggleCategory(group) {
    const next = new Set(this.collapsedCategories);
    if (next.has(group.key)) next.delete(group.key);
    else {
      next.add(group.key);
      if (group.sections.some((section) => section.id === this.peek?.sectionId)) {
        this.hidePeek();
        if (this.popup?.kind === "preview-subs") this.popup = void 0;
      }
    }
    this.collapsedCategories = next;
  }
  setAllCategories(groups, collapsed) {
    this.hidePeek();
    if (this.popup?.kind === "preview-subs") this.popup = void 0;
    this.collapsedCategories = collapsed ? /* @__PURE__ */ new Set([...this.collapsedCategories, ...groups.map((group) => group.key), ...this.saved?.model.schedules.map(categoryKey) ?? []]) : /* @__PURE__ */ new Set();
  }
  categoryView(group) {
    const collapsed = this.collapsedCategories.has(group.key), id = `group-${encodeURIComponent(group.key)}`;
    return b2`<div class="category-group" data-category=${group.key}><button class=${`category-heading ${group.active ? "running" : ""}`} aria-label=${`${collapsed ? "Expand" : "Collapse"} ${group.name} category`} aria-expanded=${!collapsed} aria-controls=${id} @click=${() => this.toggleCategory(group)}><span class="category-activity">${group.active ? `${group.active} active schedule${group.active === 1 ? "" : "s"}` : A}</span><span class="category-title">${group.name}</span><span class="category-arrow" aria-hidden="true"><svg class=${collapsed ? "" : "expanded"} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span></button><div id=${id} class="category-content" role="region" aria-label=${`${group.name} schedules`} ?hidden=${collapsed}>${collapsed ? A : group.sections.map((section) => this.section(section, this.draft?.section.id === section.id))}</div></div>`;
  }
  previewChoices(section, displayed) {
    const current = section.sub_schedules.find((sub) => sub.days.includes(this.clock.day));
    const options = section.sub_schedules.filter((sub) => sub !== displayed);
    return b2`<div class="preview-options" role="group" aria-label="Preview sub-schedule">${options.map((sub) => b2`<button type="button" class=${sub === current ? "selected" : ""} @click=${() => {
      this.popup = void 0;
      this.previewDay(section, sub.days[0]);
    }}>${this.subLabel(sub, section.sub_schedules.indexOf(sub))}<small>${sub === current ? "Current \xB7 " : ""}${sub.days.map((day) => days[day]).join(", ")}</small></button>`)}${!options.length ? b2`<span>No other sub-schedules.</span>` : A}</div>`;
  }
  placePreviewOptions() {
    const menu = this.shadowRoot?.querySelector(".preview-options");
    const card = this.shadowRoot?.querySelector("ha-card");
    if (!menu || !card) return;
    const anchor = menu.parentElement.getBoundingClientRect(), bounds = card.getBoundingClientRect();
    const left = Math.max(bounds.left + 8, 0), right = Math.min(bounds.right - 8, window.innerWidth);
    menu.style.maxWidth = `${Math.max(0, Math.min(260, right - left))}px`;
    menu.style.minWidth = "0";
    const width = menu.getBoundingClientRect().width;
    menu.style.left = `${Math.max(left, Math.min(anchor.left + 4, right - width)) - anchor.left}px`;
    const below = Math.min(bounds.bottom - 8, window.innerHeight - 8) - anchor.bottom - 4;
    const above = anchor.top - Math.max(bounds.top + 8, 8) - 4;
    const up = below < 44 && above > below;
    const height = Math.max(0, Math.min(120, up ? above : below));
    menu.style.maxHeight = `${height}px`;
    menu.style.top = up ? `${-height - 4}px` : `${anchor.height + 4}px`;
  }
  popupView() {
    const p4 = this.popup;
    if (!p4 || p4.kind === "preview-subs") return A;
    const cap = p4.kind === "temperature" || p4.kind === "state" ? this.cap(p4.key) : p4.kind === "entities" ? this.caps.find((c5) => c5.entity_id === p4.selected) : void 0;
    const numeric = (label, key, value, disabled = false) => b2`<label>${label} ${cap?.unit ?? ""}<input aria-label=${label} type="number" required min=${cap?.min ?? ""} max=${cap?.max ?? ""} step=${cap?.step ?? "any"} .value=${String(value ?? "")} ?disabled=${disabled} @input=${(e5) => {
      p4[key] = Number(e5.target.value);
    }}></label>`;
    const stateField = (label, value, set) => {
      if (cap?.kind === "number") return b2`<label>${label} ${cap.unit ?? ""}<input aria-label=${label} type="number" required min=${cap.min ?? ""} max=${cap.max ?? ""} step=${cap.step ?? "any"} .value=${String(value ?? "")} @input=${(e5) => set(Number(e5.target.value))}></label>`;
      let displayed = String(value ?? "");
      if (cap?.kind === "datetime") {
        displayed = displayed.replace(" ", "T");
        if (/(?:Z|[+-]\d{2}:\d{2})$/.test(displayed) && Number.isFinite(Date.parse(displayed))) {
          const parts = new Intl.DateTimeFormat("en-CA", { timeZone: this.saved?.timezone ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(displayed));
          const part = (type) => parts.find((p5) => p5.type === type)?.value ?? "";
          displayed = `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
        }
      }
      if (["text", "date", "time", "datetime"].includes(cap?.kind ?? "")) return b2`<label>${label}<input aria-label=${label} type=${cap?.kind === "datetime" ? "datetime-local" : cap?.kind ?? "text"} step="1" ?required=${cap?.kind !== "text" || (cap.min_length ?? 0) > 0} minlength=${cap?.min_length ?? 0} maxlength=${cap?.max_length ?? 255} pattern=${cap?.pattern ?? ".*"} .value=${displayed} @input=${(e5) => set(e5.target.value)}></label>`;
      return b2`<label>${label}<select aria-label=${label} required .value=${String(value ?? "")} @change=${(e5) => set(e5.target.value)}><option value="" disabled ?selected=${value === void 0}>Choose a state</option>${(cap?.options ?? []).map((option) => b2`<option value=${option} ?selected=${option === value}>${option === "on" || option === "off" ? option.toUpperCase() : option || "(Empty)"}</option>`)}</select></label>`;
    };
    const previewSub = this.draft?.section.sub_schedules[this.draft.selected];
    const previewDate = solarDate(this.saved?.timezone ?? "UTC", previewSub && !previewSub.days.includes(this.clock.day) ? previewSub.days[0] : void 0);
    const resolved = p4.kind === "band" && validDynamic(p4.start_dynamic) && validDynamic(p4.end_dynamic) ? resolvedBand({ id: "popup-preview", start_minute: parseTime(p4.start), end_minute: parseTime(p4.end), start_dynamic: p4.start_dynamic, end_dynamic: p4.end_dynamic }, this.solarFor(previewSub)) : void 0;
    const endMinimum = p4.kind === "band" && !p4.end_dynamic && resolved && Number.isFinite(resolved[0]) ? Math.min(1440, resolved[0] + (p4.start_dynamic ? 0 : 5)) : void 0;
    const displayedStop = resolved && Number.isFinite(resolved[1]) ? Math.max(resolved[1], endMinimum ?? 0) : void 0;
    const fixedTime = (endpoint, label) => {
      if (p4.kind !== "band") return A;
      const value = endpoint === "end" && displayedStop !== void 0 ? time(displayedStop) : p4[endpoint];
      const [hour, minute] = value.split(":").map(Number);
      const minutes = Array.from({ length: 12 }, (_2, i7) => i7 * 5);
      if (endpoint === "end" && hour === 23) minutes.push(59);
      if (!minutes.includes(minute)) minutes.push(minute);
      minutes.sort((a3, b3) => a3 - b3);
      const pad = (n4) => String(n4).padStart(2, "0");
      const change = (part, event) => {
        const chosen = Number(event.target.value);
        const h4 = part === "hour" ? chosen : hour;
        const m3 = part === "minute" ? chosen : Math.floor(minute / 5) * 5;
        const requested = parseTime(`${pad(h4)}:${pad(m3)}`);
        p4[endpoint] = time(requested);
        this.requestUpdate();
      };
      return b2`<div class="fixed-time" role="group" aria-label=${`${label} time`}><select aria-label=${`${label} hour`} .value=${l3(pad(hour))} @change=${(e5) => change("hour", e5)}>${Array.from({ length: 24 }, (_2, h4) => b2`<option value=${pad(h4)} ?selected=${h4 === hour}>${pad(h4)}</option>`)}</select><span aria-hidden="true">:</span><select aria-label=${`${label} minute`} .value=${l3(pad(minute))} @change=${(e5) => change("minute", e5)}>${minutes.map((m3) => b2`<option value=${pad(m3)} ?selected=${m3 === minute}>${pad(m3)}</option>`)}</select></div>`;
    };
    return b2`<div class="backdrop"><div class=${`dialog popup-${p4.kind}`} role="dialog" aria-modal="true" aria-label=${p4.kind === "away" ? "Away mode" : "Schedule editor"} @keydown=${(e5) => {
      if (e5.key === "Escape" && !this.busy) {
        this.popup = void 0;
      }
      if (e5.key === "Tab") {
        const controls = Array.from(this.shadowRoot.querySelectorAll(".dialog button:not(:disabled),.dialog input:not(:disabled),.dialog select:not(:disabled)")).filter((node) => !(node instanceof HTMLInputElement && node.type === "radio" && !node.checked));
        const index = controls.indexOf(this.shadowRoot.activeElement);
        if (e5.shiftKey && index === 0) {
          controls.at(-1)?.focus();
          e5.preventDefault();
        } else if (!e5.shiftKey && index === controls.length - 1) {
          controls[0]?.focus();
          e5.preventDefault();
        }
      }
    }}><form @submit=${this.applyPopup}>
      <h3>${p4.kind === "name" ? "New schedule" : p4.kind === "entities" ? "Add entity" : p4.kind === "temperature" ? "Edit temperature" : p4.kind === "state" ? "Edit state" : p4.kind === "band" ? "Time band" : p4.kind === "category" ? "Schedule category" : p4.kind === "filters" ? "Filter schedules" : p4.kind === "away" ? "Away mode" : "Sub-schedules"}</h3>
      ${p4.kind === "away" ? b2`<p class="away-help">Starts now. Choose when normal scheduling resumes.</p><label class=${`away-choice ${p4.mode === "now" ? "chosen" : ""}`}><input type="radio" name="away-duration" aria-label="Away now" .checked=${p4.mode === "now"} @change=${() => {
      p4.mode = "now";
      this.requestUpdate();
    }}><span><strong>Now</strong><small>Until I turn it off</small></span></label><label class=${`away-choice ${p4.mode === "until" ? "chosen" : ""}`}><input type="radio" name="away-duration" aria-label="Away until" .checked=${p4.mode === "until"} @change=${() => {
      p4.mode = "until";
      this.requestUpdate();
    }}><span><strong>Until…</strong><small>Return automatically</small></span></label>${p4.mode === "until" ? b2`<label>Return date and time<input aria-label="Away return date and time" required type="datetime-local" step="60" min=${localDateTime(this.saved.timezone, new Date(Date.now() + 6e4))} .value=${l3(p4.until)} @input=${(e5) => {
      p4.until = e5.target.value;
    }}></label><p class="away-timezone">Times use ${this.saved.timezone}.</p>` : A}${this.saved.model.away ? b2`<button type="button" class="away-off" ?disabled=${this.busy} @click=${async () => {
      if (await this.away(false)) this.popup = void 0;
    }}>Turn Away off</button>` : A}` : A}
      ${p4.kind === "name" ? b2`<label>Name<input autofocus required aria-label="Schedule name" .value=${p4.value} @input=${(e5) => {
      p4.value = e5.target.value;
    }}></label>` : A}
      ${p4.kind === "temperature" ? b2`${numeric(p4.target ? "Target" : "Shared setback", "value", p4.value)}${!p4.target ? b2`<p>Shared across schedules for this entity.</p>` : A}<p>Range ${cap?.min}–${cap?.max}; step ${cap?.step}. Unavailable devices use cached capabilities.</p>` : A}
      ${p4.kind === "state" ? stateField(p4.start ? "Start state" : "Stop state", p4.value, (v3) => {
      p4.value = v3;
    }) : A}
      ${p4.kind === "entities" ? b2`<label>Search<input aria-label="Search entities" .value=${p4.query} @input=${(e5) => {
      this.popup = { ...p4, query: e5.target.value };
    }}></label><div class="choices">${this.caps.filter((c5) => c5.supported && !this.draft.section.entities.some((m3) => this.draft.settings[m3.entity_key].entity_id === c5.entity_id) && (c5.name + " " + c5.entity_id).toLowerCase().includes(p4.query.toLowerCase())).map((c5) => b2`<button type="button" class=${p4.selected === c5.entity_id ? "selected" : ""} ?disabled=${!c5.available} @click=${() => this.chooseEntity(c5)}>${c5.name}<small>${c5.entity_id}${!c5.available ? " \xB7 Unavailable" : ""}</small></button>`)}</div>${cap ? cap.entity_id.startsWith("climate.") ? b2`${numeric("Target", "target", p4.target)}${numeric("Shared setback", "setback", p4.setback, !!Object.values(this.draft.settings).find((s5) => s5.entity_id === cap.entity_id))}<p>Existing climate entities reuse their shared setback.</p>` : b2`${stateField("Start state", p4.start, (v3) => {
      p4.start = v3;
    })}${stateField("Stop state", p4.end, (v3) => {
      p4.end = v3;
    })}` : A}` : A}
      ${p4.kind === "band" ? b2`${p4.reason ? b2`<p>${p4.reason}</p>` : A}${p4.band?.one_off ? b2`<p class="one-off-details"><ha-icon icon="mdi:calendar-clock" aria-hidden="true"></ha-icon><strong>One-off</strong></p>` : A}<fieldset><div class="band-times">${["start", "end"].map((endpoint) => {
      const label = endpoint === "start" ? "Start" : "Stop", field = `${endpoint}_dynamic`, dynamic = p4[field];
      const minute = endpoint === "start" ? resolved?.[0] : displayedStop;
      const predicted = predictedMinute(dynamic, this.solarFor(previewSub));
      const prediction = predicted === void 0 ? "Unavailable" : `${time((predicted % 1440 + 1440) % 1440)} *${predicted < 0 ? " (previous day)" : predicted >= 1440 ? " (next day)" : ""}`;
      const requested = dynamic ? predicted : parseTime(p4[endpoint]);
      const changed = (p4.start_dynamic || p4.end_dynamic) && requested !== void 0 && minute !== void 0 && Number.isFinite(minute) && minute !== requested;
      const matchesStart = endpoint === "end" && changed && resolved && Math.max(0, Math.min(1440, requested)) < resolved[0];
      return b2`<div class="band-endpoint">
          <label>${label}${dynamic ? b2`<select aria-label=${`${label} solar event`} .value=${dynamic.event} @change=${(e5) => {
        dynamic.event = e5.target.value;
        this.requestUpdate();
      }}>${solarEvents.map(([event, name]) => b2`<option value=${event} ?selected=${dynamic.event === event}>${name}</option>`)}</select>` : fixedTime(endpoint, label)}</label>
          <label class="filter-check"><input type="checkbox" aria-label=${`${label} solar event`} .checked=${!!dynamic} @change=${(e5) => {
        p4[field] = e5.target.checked ? { event: endpoint === "start" ? "sunrise" : "sunset", offset: 0 } : void 0;
        this.requestUpdate();
      }}>Solar event</label>
          ${dynamic ? b2`<label>Offset (minutes)<input aria-label=${`${label} offset minutes`} type="number" required min="-300" max="300" step="1" .value=${String(dynamic.offset)} @input=${(e5) => {
        dynamic.offset = Number(e5.target.value);
        this.requestUpdate();
      }}></label><output class="endpoint-preview" aria-label=${`${label} resolved time`} aria-live="polite">${prediction}</output>` : A}
          ${changed ? b2`<output class="endpoint-clamp" aria-label=${`${label} band time`} aria-live="polite">Band time: ${time(minute)}${dynamic ? " *" : ""}</output>${matchesStart ? b2`<small class="endpoint-clamp">Stop matches start</small>` : A}` : A}
        </div>`;
    })}</div>${p4.start_dynamic || p4.end_dynamic ? b2`<p class="band-preview-date">Times for ${previewDate}</p>` : A}<p class="band-help">Five-minute steps. Stop 23:59 means midnight.</p>
      ${!(p4.band?.one_off || p4.one_off) ? b2`<label>Band status<select aria-label="Band status" .value=${p4.disabled ? "disabled" : "enabled"} @change=${(e5) => {
      p4.disabled = e5.target.value === "disabled";
      this.requestUpdate();
    }}><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></label>
      ${p4.disabled ? b2`<label>Disable for<select aria-label="Disable for" .value=${p4.disableMode ?? "permanent"} @change=${(e5) => {
      p4.disableMode = e5.target.value;
      this.requestUpdate();
    }}><option value="permanent">Permanent</option><option value="until">Until…</option></select></label>
      ${p4.disableMode === "until" ? b2`<label>Re-enable date and time<input aria-label="Re-enable date and time" type="datetime-local" .value=${p4.until ? p4.until.includes("+") || p4.until.endsWith("Z") ? localDateTime(this.saved.timezone, new Date(p4.until)) : p4.until : ""} min=${localDateTime(this.saved.timezone)} @input=${(e5) => {
      p4.until = e5.target.value;
    }}></label>` : A}` : A}
      <p>Disabled bands are skipped. Enabling an active band runs its start settings. Apply, then Save.</p>` : A}</fieldset>${!p4.band ? b2`<div class="one-off-option"><label class="filter-check"><input type="checkbox" aria-label="One-off" aria-describedby="one-off-help" .checked=${!!p4.one_off} @change=${(e5) => {
      p4.one_off = e5.target.checked;
      if (p4.one_off) p4.disabled = false;
      this.requestUpdate();
    }}>One-off</label><p id="one-off-help">Will be removed once complete</p></div>` : A}` : A}
      ${p4.kind === "sub-disable" ? b2`<label>Sub-schedule status<select aria-label="Sub-schedule status" .value=${!p4.disabled ? "enabled" : p4.disableMode} @change=${(e5) => {
      const value = e5.target.value;
      p4.disabled = value !== "enabled";
      p4.disableMode = value === "until" ? "until" : "permanent";
      this.requestUpdate();
    }}><option value="enabled">Enabled</option><option value="permanent">Disabled permanently</option><option value="until">Disabled until…</option></select></label>${p4.disabled && p4.disableMode === "until" ? b2`<label>Re-enable date and time<input aria-label="Re-enable date and time" required type="datetime-local" .value=${p4.until ? p4.until.includes("+") || p4.until.endsWith("Z") ? localDateTime(this.saved.timezone, new Date(p4.until)) : p4.until : ""} min=${localDateTime(this.saved.timezone)} @input=${(e5) => {
      p4.until = e5.target.value;
    }}></label><p>Times use ${this.saved.timezone}.</p>` : A}<p>Disabled sub-schedules skip all band transitions and leave devices unchanged. Apply, then Save.</p>` : A}
      ${p4.kind === "subs" ? b2`<div class="choices">${this.draft.section.sub_schedules.map((sub, i7) => b2`<button type="button" class=${i7 === this.draft.selected ? "selected" : ""} @click=${() => {
      this.draft.selected = i7;
      this.changed();
      this.popup = void 0;
    }}>${this.subLabel(sub, i7)}: ${sub.days.map((d3) => days[d3]).join(", ") || "No days yet"}</button>`)}</div>` : A}
      ${p4.kind === "category" ? b2`<label>Category<select aria-label="Category" .value=${p4.choice} @change=${(e5) => {
      this.popup = { ...p4, choice: e5.target.value };
    }}><option value="none" ?selected=${p4.choice === "none"}>Unassigned</option>${categories([...this.saved.model.schedules, this.draft.section]).map((name) => b2`<option value=${`category:${name}`} ?selected=${p4.choice === `category:${name}`}>${name}</option>`)}<option value="new" ?selected=${p4.choice === "new"}>Create new category…</option></select></label>${p4.choice === "new" ? b2`<label>New category<input aria-label="New category" required .value=${p4.name} @input=${(e5) => {
      p4.name = e5.target.value;
    }}></label>` : A}` : A}
      ${p4.kind === "filters" ? this.filterFields(p4) : A}
      ${p4.kind === "away" && this.awayAction ? b2`<p role="status" class="away-progress">${this.awayAction === "on" ? "Setting Away\u2026" : "Resuming active schedules\u2026"}</p>` : A}${this.error ? b2`<p role="alert" class="error">${this.error}</p>` : A}<div class="popup-actions"><div class="tools"><button type="button" ?disabled=${this.busy} @click=${() => {
      this.popup = void 0;
      this.error = "";
    }}>Cancel</button><button class="save" type="submit" ?disabled=${this.busy}>${p4.kind === "subs" ? "Done" : p4.kind === "away" ? this.saved.model.away ? "Update Away" : "Enable Away" : "Apply"}</button></div>${p4.kind === "band" && p4.band ? b2`<button type="button" class="trash-button popup-trash" aria-label="Delete time band" title="Delete time band" @click=${async () => {
      if (await this.removeBand(p4.band)) this.popup = void 0;
    }}>${this.trashIcon()}</button>` : A}</div>
    </form></div></div>`;
  }
  filterFields(p4) {
    const options = filterOptions(this.saved.model.schedules, this.saved.locations);
    return ["categories", "areas", "floors", "activity"].map((key) => {
      const title = { categories: "Categories", areas: "Areas", floors: "Floors", activity: "Running now" }[key];
      const values = options[key], selected = p4.filters[key] ?? values.map((value) => value.value);
      const change = (option, checked) => {
        p4.filters[key] = checked ? [...selected, option.value] : selected.filter((value) => value !== option.value);
        this.requestUpdate();
      };
      return b2`<fieldset class="filter-options" data-filter=${key}><legend>${title}</legend><label class="filter-check"><input type="checkbox" aria-label=${`Select all ${key === "activity" ? "statuses" : key}`} .checked=${selected.length === values.length} .indeterminate=${selected.length > 0 && selected.length < values.length} @change=${(e5) => {
        p4.filters[key] = e5.target.checked ? values.map((value) => value.value) : [];
        this.requestUpdate();
      }}>Select all</label>${values.map((option) => b2`<label class="filter-check"><input type="checkbox" aria-label=${option.label} .checked=${selected.includes(option.value)} @change=${(e5) => change(option, e5.target.checked)}>${option.label}</label>`)}</fieldset>`;
    });
  }
  updated(changes) {
    if (changes.has("draft")) this.shadowRoot?.querySelectorAll("hsm-timeline").forEach((t5) => t5.requestUpdate());
    if (changes.has("popup") && this.popup) this.shadowRoot?.querySelector('.dialog input:not([type="radio"]),.dialog input[type="radio"]:checked,.dialog select,.dialog button')?.focus();
    if (changes.has("confirmation") && this.confirmation) this.shadowRoot?.querySelector(".confirm button")?.focus();
    if (this.popup?.kind === "preview-subs") this.placePreviewOptions();
    if (this.peek) {
      const section = this.saved?.model.schedules.find((schedule) => schedule.id === this.peek.sectionId);
      const target = section?.sub_schedules.find((schedule) => schedule.id === this.peek.subId);
      if (!target?.days.includes(this.peek.day) || target.days.includes(this.clock.day) || !this.shadowRoot?.querySelector(`[data-preview-scope="${this.peek.sectionId}"]`)) this.hidePeek();
    }
    if (changes.has("saved") || changes.has("draft") || changes.has("clock") || changes.has("filters") || changes.has("collapsedCategories") || changes.has("peek") || changes.has("popup")) this.queueTimeLayout();
  }
  render() {
    if (!this.saved) return b2`<ha-card><p>Loading Scheduling Manager…</p>${this.error ? b2`<p role="alert">${this.error}</p>` : A}</ha-card>`;
    const title = viewTitle(this);
    const options = filterOptions(this.saved.model.schedules, this.saved.locations);
    const filters = normalizeFilters(this.filters, options), filtered = isFiltered(filters);
    const displayed = this.saved.model.schedules.map((section) => this.draft?.section.id === section.id ? this.draft.section : section);
    if (this.draft?.isNew) displayed.push(this.draft.section);
    const sections = visibleSchedules(displayed, filters, this.saved.locations, this.saved.active_schedules, this.draft?.section.id);
    const groups = categoryGroups(sections, this.saved.active_schedules);
    const showAll = groups.every((group) => this.collapsedCategories.has(group.key));
    const returnLabel = this.saved.model.away_until ? awayUntilLabel(this.saved.model.away_until, this.saved.timezone) : "";
    return b2`<ha-card><header><div class="header-heading">${title ? b2`<h2>${title}</h2>` : A}<div class="day-box">${this.clock.weekday}</div></div><span class="header-space" aria-hidden="true"></span><div class="category-controls"><button aria-label=${`${showAll ? "Show" : "Hide"} all categories`} ?disabled=${!groups.length} @click=${() => this.setAllCategories(groups, !showAll)}>${showAll ? "Show all" : "Hide all"}</button></div><div class=${`filter-controls ${filtered ? "filtered" : ""}`}>${filtered ? b2`<button class="remove clear-filter" aria-label="Clear schedule filters" @click=${() => {
      this.filters = allFilters();
    }}>✕</button>` : A}<button class=${filtered ? "selected" : ""} aria-label="Filter schedules" aria-pressed=${filtered} @click=${() => {
      this.popup = { kind: "filters", filters: Object.fromEntries(Object.entries(options).map(([key, values]) => [key, [...filters[key] ?? values.map((value) => value.value)]])) };
    }}>☷ Filter</button></div><button ?disabled=${!this.saved.editable || this.busy} @click=${async () => {
      if (await this.discard()) this.popup = { kind: "name", value: "" };
    }}>＋ Schedule</button><div class="away-control"><button class=${this.saved.model.away ? "selected" : "away"} aria-pressed=${this.saved.model.away} ?disabled=${!this.saved.editable || this.busy} title=${this.saved.model.away ? returnLabel ? `Away until ${returnLabel}` : "Away until you turn it off" : "Set Away mode"} @click=${this.openAway}>Away</button>${returnLabel ? b2`<span class="away-return">Until ${returnLabel}</span>` : A}</div></header>
      ${this.error && !this.popup ? b2`<p class="error" role="alert">${this.error}</p>` : A}
      ${this.saved.storage_error ? b2`<p class="error" role="alert">Storage: ${this.saved.storage_error}</p>` : A}
      ${this.saved.applying ? b2`<p class="device-progress" role="status">Updating devices…</p>` : A}
      ${this.draft && this.draft.revision !== this.saved.model.revision ? b2`<p class="error" role="alert">Saved state changed elsewhere. Your unsaved changes are retained. Cancel and reopen to reload before saving.</p>` : A}
      ${groups.map((group) => this.categoryView(group))}
      ${!this.saved.model.schedules.length && !this.draft ? b2`<p class="empty">Add a schedule to begin.</p>` : A}
      ${this.saved.model.schedules.length && !sections.length && !this.draft ? b2`<p class="empty">No schedules match this filter.</p>` : A}
      ${this.sharedTime ? b2`<div class="shared-time" role="img" aria-label=${`Current time ${time(this.clock.minute)}`} style=${`left:${this.sharedTime.left}px;top:${this.sharedTime.top}px;height:${this.sharedTime.height}px`}><span class="shared-time-label">${time(this.clock.minute)}</span><span class="shared-time-line"></span></div>` : A}
      ${this.draft && draftError(this.draft, this.caps) ? b2`<p class="hint validation" role="status">${draftError(this.draft, this.caps)}</p>` : A}
      ${Object.values(this.saved.status).map((s5) => b2`<p class="error" role="status">${s5.entity_id}: ${s5.message}</p>`)}
      ${this.popupView()}
      ${this.confirmation ? b2`<div class="backdrop"><div class="dialog confirm" role="alertdialog" aria-modal="true" aria-label="Confirm action" @keydown=${(e5) => {
      if (e5.key === "Escape") {
        this.confirmation?.resolve(false);
        this.confirmation = void 0;
      }
      if (e5.key === "Tab") {
        const controls = this.shadowRoot.querySelectorAll(".confirm button");
        const at = Array.from(controls).indexOf(this.shadowRoot.activeElement);
        controls[(at + 1) % 2]?.focus();
        e5.preventDefault();
      }
    }}><p>${this.confirmation.message}</p><div class="tools"><button @click=${() => {
      this.confirmation?.resolve(false);
      this.confirmation = void 0;
    }}>No</button><button class="remove" @click=${() => {
      this.confirmation?.resolve(true);
      this.confirmation = void 0;
    }}>Yes</button></div></div></div>` : A}
    </ha-card>`;
  }
  static {
    this.styles = i`
    .one-off-option .filter-check{margin-bottom:0}.one-off-option #one-off-help{margin:2px 0 0}
    fieldset{border:0;padding:0;margin:0;min-width:0}.one-off-details{display:flex;align-items:center;gap:6px;font-size:14px}.one-off-details ha-icon{color:#e53935}
    :host{--orange:#ff861f;--blue:var(--info-color,#009edc);--green:var(--success-color,#23ad4b);--red:var(--error-color,#b71936);--timeline-min-width:600px;display:block;color:var(--primary-text-color,#222);font-family:var(--paper-font-body1_-_font-family,Arial,sans-serif)}
    ha-card{display:block;position:relative;background:var(--ha-card-background,var(--card-background-color,#fff));border-radius:0;overflow:clip;padding-bottom:0}
    header{background:var(--app-header-background-color,var(--primary-color,#03a9f4));color:var(--primary-text-color,#222);display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:14px 12px 6px}.header-heading{display:flex;align-items:center;gap:12px;flex-wrap:wrap}h2{font-size:22px;font-weight:500;margin:0}.header-space{flex:1}header button{font-size:12px;min-height:36px;padding:5px 9px;border-radius:5px}h3{margin-top:0}
    button,input{font:inherit}button{cursor:pointer;border:1px solid var(--divider-color,#666);border-radius:7px;min-height:44px;padding:6px 12px;background:var(--secondary-background-color,#eee);color:var(--primary-text-color,#222)}button:disabled{cursor:default;opacity:.6}button:focus-visible,input:focus-visible{outline:3px solid var(--primary-color,#009edc);outline-offset:2px}
    .selected,.add,.enable{background:var(--green);color:white}.away,.disable,.days button:not(.selected){background:var(--disabled-text-color,#777);color:white}.remove{background:var(--red);color:white}.save{border:2px solid var(--green)}
    .days button.enable{background:var(--green);color:white}
    .days .disabled-day,.view-days .view-day.disabled-day{background:#000;color:#fff;position:relative}.disabled-day::after{content:'×';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#ff3030;font-size:38px;font-weight:300;line-height:1;pointer-events:none}
    .sub-disabled-until{font-size:12px;color:var(--secondary-text-color,#666);margin:4px 0 8px}
    .day-box{border:2px solid var(--primary-text-color,#111);border-radius:6px;font-size:20px;font-weight:500;text-align:center;box-sizing:border-box;min-width:112px;margin:0;padding:2px 10px}
    header{position:sticky;top:var(--header-height,0px);z-index:5}
    section{position:relative;display:grid;grid-template-columns:354px minmax(0,1fr);gap:0;border-bottom:2px solid var(--primary-text-color,#111);padding:0;align-items:stretch}section::after{content:'';position:absolute;left:0;right:0;bottom:-2px;height:2px;background:var(--primary-text-color,#111);z-index:2;pointer-events:none}
    .schedule-panel{position:relative;z-index:2;min-width:0;padding:6px 8px;background:var(--schedule-panel-background,color-mix(in srgb,var(--app-header-background-color,var(--primary-color,#03a9f4)) 55%,var(--card-background-color,#fff)));border:1px solid var(--primary-text-color,#111);border-bottom:0;box-sizing:border-box;display:flex;flex-direction:column}
    .category-watermark{position:absolute;z-index:0;top:42px;right:12px;max-width:45%;font-size:44px;font-weight:700;line-height:1.1;color:var(--secondary-text-color,#999);opacity:.25;pointer-events:none;overflow-wrap:anywhere;text-align:right}.timeline-region{position:relative;z-index:2}.edit-actions{display:flex;gap:5px;align-items:center;flex-wrap:nowrap;margin-bottom:6px}.edit-actions button{font-size:12px;padding:5px 7px;min-height:36px;white-space:nowrap}
    .section-meta{display:flex;gap:6px;align-items:center;flex-wrap:nowrap;min-height:36px;margin-bottom:6px}.name{background:transparent;border:0;border-radius:0;color:var(--primary-text-color,#222);font-size:22px;font-weight:500;text-align:left;min-width:0;flex:1;overflow-wrap:anywhere;padding:2px 3px}.name:disabled{opacity:1}.section-meta .tools{margin-left:auto;flex-wrap:nowrap}.section-meta .tools button{font-size:12px;padding:5px 8px;min-height:36px}.section-meta .tools .burger{font-size:21px;line-height:1;padding:5px 8px}
    .entities{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.entity{display:flex;align-items:stretch;margin:0;gap:0;min-width:0}.entity span{flex:1;min-width:0;overflow-wrap:anywhere;border:2px solid var(--primary-text-color,#222);padding:5px 3px;text-align:center;font-size:12px;line-height:1.2;background:var(--ha-card-background,var(--card-background-color,#fff))}.entity button{font-size:11px;padding:4px 3px;min-width:34px;min-height:34px}.entity .setback,.entity .target{max-width:60px;overflow-wrap:anywhere}.entity .setback{background:var(--blue);color:#071820;border-radius:0 6px 6px 0;border:0}.entity .target{background:var(--orange);color:#221000;border-radius:6px 0 0 6px;border:0}.entity button:disabled{opacity:1}.entity .remove{border-radius:5px;min-width:28px;margin-left:3px;padding:3px}small{font-size:10px;display:block}.entity .target small,.entity .setback small{font-size:9px;display:inline}
    .editing .entities{grid-template-columns:repeat(2,minmax(0,1fr))}.editing .entity span{font-size:11px}.editing .entity button{min-width:28px;min-height:34px;padding:4px 2px}.editing .entity .trash-button{min-width:24px;padding:2px;margin-left:1px}.trash-icon{display:block;width:20px;height:20px;flex-shrink:0}.trash-button{background:transparent;color:var(--secondary-text-color,#666);border:0;border-radius:5px;display:grid;place-items:center;cursor:pointer}.trash-button:hover{color:var(--error-color,#b71936);background:color-mix(in srgb,var(--error-color,#b71936) 10%,transparent)}.section-trash{min-width:36px;padding:6px}.section-trash .trash-icon{width:24px;height:24px}.entity-trash .trash-icon{width:15px;height:15px}
    .edit-footer{margin-top:auto;padding-top:32px}.edit-bottom{display:flex;gap:6px;align-items:center;justify-content:space-between}.edit-bottom .tools{flex-wrap:nowrap;gap:4px}.edit-bottom button{font-size:11px;min-height:32px;padding:5px 7px}.edit-bottom .category-button{max-width:55%;overflow-wrap:anywhere}.edit-actions{padding-bottom:4px}.edit-actions button{font-size:11px;min-height:32px}
    .view-days{display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin:0 0 4px}.view-day{display:inline-block;border-radius:5px;padding:4px 6px;font-size:11px;font-weight:600;line-height:1.2}.view-day.active{background:color-mix(in srgb,var(--green) 28%,var(--card-background-color,#fff));color:var(--primary-text-color,#222)}.view-day.inactive{background:var(--disabled-text-color,#777);color:white}
    .view-sub-number{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:26px;height:26px;min-height:26px;padding:0;border:0;margin-left:4px;border-radius:50%;font-size:11px;font-weight:600;line-height:1.2;color:var(--primary-text-color,#222);background:color-mix(in srgb,var(--green) 28%,var(--card-background-color,#fff))}.view-sub-number.preview{background:var(--disabled-text-color,#777);color:white}
    .view-sub-number.named{width:auto;height:auto;min-height:26px;max-width:100%;box-sizing:border-box;border-radius:6px;padding:5px 8px;flex-shrink:1;overflow-wrap:anywhere}
    .view-day{border:2px solid transparent;box-sizing:border-box}.view-day.inactive,.view-day.active{min-height:0;min-width:0;cursor:pointer}.view-day.unscheduled{background:#fff;color:#000;border-color:#000;cursor:default}.view-day.previewed{border-color:var(--blue);box-shadow:0 0 0 1px var(--blue)}.peek-timeline{position:relative}.timeline-region{position:relative}.peek-timeline.status-preview{position:absolute;left:8px;right:8px;bottom:0}.empty.peek-status{color:#ddd;pointer-events:none}
    .shared-time{position:absolute;width:0;pointer-events:none}.shared-time-label{position:absolute;z-index:3;left:0;top:0;transform:translateX(-50%);box-sizing:border-box;width:64px;height:30px;display:grid;place-items:center;border:2px solid var(--orange);border-radius:8px;background:var(--ha-card-background,var(--card-background-color,#fff));color:var(--orange);font-size:16px;font-weight:700}.shared-time-line{position:absolute;z-index:1;top:30px;bottom:0;left:-1.75px;width:3.5px;background:var(--orange)}.clear-filter{min-width:36px;padding:5px 8px}
    .filter-controls{display:inline-flex;gap:0;flex-shrink:0;align-items:stretch}.filter-controls.filtered .clear-filter{border-radius:5px 0 0 5px}.filter-controls.filtered button:last-child{border-radius:0 5px 5px 0}
    .category-controls button,.filter-controls button:not(.selected):not(.remove){background:transparent;border-color:color-mix(in srgb,currentColor 35%,transparent)}.away-control{margin-inline-start:8px;display:grid;justify-items:end;gap:2px}.away-return{font-size:11px;max-width:220px;text-align:right;overflow-wrap:anywhere}
    header button.away{background:color-mix(in srgb,var(--disabled-text-color,#777) 40%,var(--card-background-color,#fff));color:var(--primary-text-color,#222)}
    .category-controls{display:flex;gap:4px}.category-heading{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;min-height:48px;border-radius:0;border:0;border-top:1px solid var(--divider-color,#777);border-bottom:1px solid var(--divider-color,#777);padding:8px 12px;background:var(--secondary-background-color,#eee);position:relative;z-index:3}.category-heading.running{background:color-mix(in srgb,var(--green) 12%,var(--card-background-color,#fff))}.category-activity{text-align:left;font-size:13px;font-weight:500;flex-shrink:0}.category-title{margin-left:auto;text-align:right;font-size:18px;font-weight:700;overflow-wrap:anywhere;min-width:0}.category-arrow{flex:0 0 24px;width:24px;height:24px;display:flex;align-items:center;justify-content:center}.category-arrow svg{display:block;width:24px;height:24px;transform-origin:center}.category-arrow svg.expanded{transform:rotate(180deg)}.category-content[hidden]{display:none}
    .entity-list{min-height:0}.entity-list.overflowing{max-height:180px;overflow-y:auto;overflow-x:hidden;scrollbar-gutter:stable;overscroll-behavior-y:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch}.entity-list:focus-visible{outline:2px solid var(--blue);outline-offset:2px}.entity-scroll-controls{display:flex;gap:4px;align-items:center;justify-content:flex-end;margin-bottom:4px}.entity-scroll-controls span{margin-right:auto;font-size:11px}.entity-scroll-controls button{min-height:28px;min-width:32px;padding:2px 6px;font-size:18px;line-height:1}
    .timeline-region{min-width:0;padding:8px 8px 0}.empty{font-size:25px;font-weight:bold;text-align:center;color:var(--secondary-text-color,#777);padding:25px}.tools,.days{display:flex;gap:6px;flex-wrap:wrap}.days button{padding:6px 9px}.hint{font-size:12px;color:var(--secondary-text-color,#666);line-height:1.5;margin:10px 14px}.error{margin:12px;color:var(--error-color,#b71936);overflow-wrap:anywhere}.validation{font-size:14px}
    .add-band{margin-bottom:8px}.sub-selector{font:inherit;min-height:44px;min-width:64px;max-width:220px;padding:6px 8px;border:1px solid var(--divider-color,#777);border-radius:7px;background:var(--secondary-background-color,#eee);color:var(--primary-text-color,#222)}
    .sub-name{display:block;font-size:12px;margin:8px 0;max-width:300px}.sub-name input{display:block;box-sizing:border-box;width:100%;margin-top:4px;padding:8px;border:1px solid var(--divider-color,#777);border-radius:6px;background:var(--secondary-background-color,#eee);color:var(--primary-text-color,#222)}
    .backdrop{position:fixed;inset:0;z-index:1000;background:#0007;display:flex;align-items:center;justify-content:center;padding:12px}.dialog{background:var(--card-background-color,#fff);color:var(--primary-text-color,#222);border-radius:12px;padding:16px;box-sizing:border-box;max-width:320px;width:100%;max-height:85dvh;overflow:auto}.dialog.popup-band{max-width:300px;padding-bottom:20px}.dialog.popup-temperature,.dialog.popup-state,.dialog.popup-subs{max-width:280px}.dialog.popup-entities{max-width:380px}.dialog label{display:block;margin:10px 0}.dialog input,.dialog select{font:inherit;display:block;box-sizing:border-box;width:100%;padding:10px;background:var(--secondary-background-color,#eee);color:inherit;border:1px solid var(--divider-color,#777);border-radius:6px}.choices{display:flex;flex-direction:column;gap:6px;max-height:240px;overflow:auto}.choices button{text-align:left}.dialog p{font-size:14px;line-height:1.5}.band-times{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.dialog .band-help{margin:8px 0 20px}.popup-actions{display:flex;gap:8px;align-items:center;justify-content:space-between}.popup-trash{min-width:44px;min-height:44px;color:var(--error-color,#b71936);margin-left:auto;padding:8px}
    .filter-options{border:1px solid var(--divider-color,#777);border-radius:7px;max-height:260px;overflow:auto;padding:8px 12px}.dialog .filter-check{display:flex;align-items:center;gap:10px;min-height:36px;margin:4px 0;cursor:pointer}.dialog .filter-check input{display:inline-block;width:18px;height:18px;flex:0 0 18px;margin:0;padding:0;accent-color:var(--primary-color,#03a9f4)}
    .dialog .away-choice{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--divider-color,#777);border-radius:7px;cursor:pointer}.dialog .away-choice.chosen{border-color:var(--green);background:color-mix(in srgb,var(--green) 10%,var(--card-background-color,#fff))}.dialog .away-choice input{width:18px;height:18px;flex-shrink:0;margin:0;accent-color:var(--green)}.away-choice small{font-size:12px;margin-top:3px}.dialog .away-help{font-size:13px;line-height:1.4}.dialog .away-timezone{font-size:12px;color:var(--secondary-text-color,#777)}.away-off{margin:6px 0;background:var(--secondary-background-color,#eee)}
    .away-progress,.device-progress{font-size:13px;color:var(--secondary-text-color,#777)}.device-progress{margin:6px 12px}
    .disabled-placeholder{visibility:hidden}.disabled-label{position:absolute;top:42px;left:0;right:0;text-align:center;color:#aaa}.empty.disabled-empty{margin:0;padding:0;height:56px}
    .disabled-schedule .view-day.active,.disabled-schedule .view-day.inactive,.disabled-schedule .view-sub-number{background:#aaa;color:#333}
    .disabled-schedule .entity .target,.disabled-schedule .entity .setback{background:#aaa;color:#333}.disabled-schedule .entity>span{background:#eee;color:#666;border-color:#aaa}
    .endpoint-preview{display:block;font-size:18px;font-weight:600;font-variant-numeric:tabular-nums}.endpoint-clamp{display:block;font-size:12px;color:var(--secondary-text-color,#777);margin-top:4px}.dialog .band-preview-date{margin:8px 0;font-size:12px;color:var(--secondary-text-color,#777)}
    .fixed-time{display:flex;align-items:center;gap:3px}.dialog .fixed-time select{min-width:0;flex:1;padding:10px 3px;font-variant-numeric:tabular-nums}
    section.preview-open{z-index:4}.preview-selection{position:relative;display:grid;align-self:flex-start;min-width:0;max-width:100%}.preview-selection>.view-sub-number{grid-area:1/1;justify-self:start}.preview-size{grid-area:1/1;display:grid;visibility:hidden;pointer-events:none;min-width:26px;min-height:26px;box-sizing:border-box;max-width:100%;margin-left:4px;padding:5px 8px;font-size:11px;font-weight:600;line-height:1.2}.preview-size>span{grid-area:1/1;min-width:0;overflow-wrap:anywhere}.preview-options{position:absolute;z-index:5;top:calc(100% + 4px);left:4px;display:flex;flex-direction:column;gap:4px;margin:0;padding:5px;border:1px solid var(--divider-color,#777);border-radius:6px;background:var(--ha-card-background,var(--card-background-color,#fff));width:max-content;max-width:260px;max-height:120px;overflow:auto;box-sizing:border-box;box-shadow:0 3px 10px #0003}.preview-options button{text-align:left;font-size:11px;padding:6px 8px;overflow-wrap:anywhere;flex-shrink:0}.preview-options>span{font-size:11px;padding:6px}
     @media(max-width:850px){:host{--timeline-min-width:900px}section{grid-template-columns:1fr}.schedule-panel{border-bottom:1px solid var(--primary-text-color,#111)}.timeline-region{padding:8px;grid-column:1}.category-watermark{top:auto;bottom:116px;max-width:55%}.disabled-schedule .category-watermark{bottom:12px;max-width:40%}.disabled-label{top:52px;left:12px;right:50%;text-align:left}.empty.disabled-empty{height:68px}.header-heading{flex-basis:100%}header .header-space{display:none}.entity span{font-size:13px}.entity button{min-height:40px}.section-meta .tools button,header button{min-height:40px}.editing .entity button{min-height:44px}}
    @media(max-width:420px){header{padding:10px 8px 6px}.entities{gap:4px}.entity button{min-width:30px;padding:4px 2px}.entity .remove{min-width:28px}.name{font-size:20px}.days{gap:4px}.days button{padding:6px 8px}}
  `;
  }
};
if (!customElements.get("scheduling-manager-card")) customElements.define("scheduling-manager-card", SchedulingManagerCard);
if (!customElements.get("heating-schedule-manager-card")) customElements.define("heating-schedule-manager-card", class extends SchedulingManagerCard {
});
window.customCards = window.customCards ?? [];
if (!window.customCards.some((card) => card.type === "scheduling-manager-card")) window.customCards.push({ type: "scheduling-manager-card", name: "Scheduling Manager", description: "Shared schedules with temperature and state editing." });
export {
  SchedulingManagerCard
};
/*! Bundled license information:

@lit/reactive-element/css-tag.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/reactive-element.js:
lit-html/lit-html.js:
lit-element/lit-element.js:
lit-html/directive.js:
lit-html/directives/repeat.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/is-server.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/directive-helpers.js:
lit-html/directives/live.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)
*/
