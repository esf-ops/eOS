function jf(de) {
  return de && de.__esModule && Object.prototype.hasOwnProperty.call(de, "default") ? de.default : de;
}
var hf = { exports: {} }, nf = {};
var Df;
function qf() {
  if (Df) return nf;
  Df = 1;
  var de = /* @__PURE__ */ Symbol.for("react.transitional.element"), ue = /* @__PURE__ */ Symbol.for("react.fragment");
  function W(ke, nn, be) {
    var Oe = null;
    if (be !== void 0 && (Oe = "" + be), nn.key !== void 0 && (Oe = "" + nn.key), "key" in nn) {
      be = {};
      for (var Tn in nn)
        Tn !== "key" && (be[Tn] = nn[Tn]);
    } else be = nn;
    return nn = be.ref, {
      $$typeof: de,
      type: ke,
      key: Oe,
      ref: nn !== void 0 ? nn : null,
      props: be
    };
  }
  return nf.Fragment = ue, nf.jsx = W, nf.jsxs = W, nf;
}
var tf = {}, df = { exports: {} }, gn = {};
var Nf;
function $f() {
  if (Nf) return gn;
  Nf = 1;
  var de = /* @__PURE__ */ Symbol.for("react.transitional.element"), ue = /* @__PURE__ */ Symbol.for("react.portal"), W = /* @__PURE__ */ Symbol.for("react.fragment"), ke = /* @__PURE__ */ Symbol.for("react.strict_mode"), nn = /* @__PURE__ */ Symbol.for("react.profiler"), be = /* @__PURE__ */ Symbol.for("react.consumer"), Oe = /* @__PURE__ */ Symbol.for("react.context"), Tn = /* @__PURE__ */ Symbol.for("react.forward_ref"), Re = /* @__PURE__ */ Symbol.for("react.suspense"), ie = /* @__PURE__ */ Symbol.for("react.memo"), He = /* @__PURE__ */ Symbol.for("react.lazy"), P = /* @__PURE__ */ Symbol.for("react.activity"), N = Symbol.iterator;
  function Pe(T) {
    return T === null || typeof T != "object" ? null : (T = N && T[N] || T["@@iterator"], typeof T == "function" ? T : null);
  }
  var ee = {
    isMounted: function() {
      return !1;
    },
    enqueueForceUpdate: function() {
    },
    enqueueReplaceState: function() {
    },
    enqueueSetState: function() {
    }
  }, X = Object.assign, ft = {};
  function tr(T, Y, we) {
    this.props = T, this.context = Y, this.refs = ft, this.updater = we || ee;
  }
  tr.prototype.isReactComponent = {}, tr.prototype.setState = function(T, Y) {
    if (typeof T != "object" && typeof T != "function" && T != null)
      throw Error(
        "takes an object of state variables to update or a function which returns an object of state variables."
      );
    this.updater.enqueueSetState(this, T, Y, "setState");
  }, tr.prototype.forceUpdate = function(T) {
    this.updater.enqueueForceUpdate(this, T, "forceUpdate");
  };
  function Yt() {
  }
  Yt.prototype = tr.prototype;
  function Gl(T, Y, we) {
    this.props = T, this.context = Y, this.refs = ft, this.updater = we || ee;
  }
  var Hr = Gl.prototype = new Yt();
  Hr.constructor = Gl, X(Hr, tr.prototype), Hr.isPureReactComponent = !0;
  var Vn = Array.isArray;
  function Ie() {
  }
  var Ve = { H: null, A: null, T: null, S: null }, Et = Object.prototype.hasOwnProperty;
  function rn(T, Y, we) {
    var Te = we.ref;
    return {
      $$typeof: de,
      type: T,
      key: Y,
      ref: Te !== void 0 ? Te : null,
      props: we
    };
  }
  function Kn(T, Y) {
    return rn(T.type, Y, T.props);
  }
  function si(T) {
    return typeof T == "object" && T !== null && T.$$typeof === de;
  }
  function Ln(T) {
    var Y = { "=": "=0", ":": "=2" };
    return "$" + T.replace(/[=:]/g, function(we) {
      return Y[we];
    });
  }
  var qr = /\/+/g;
  function nt(T, Y) {
    return typeof T == "object" && T !== null && T.key != null ? Ln("" + T.key) : Y.toString(36);
  }
  function Ae(T) {
    switch (T.status) {
      case "fulfilled":
        return T.value;
      case "rejected":
        throw T.reason;
      default:
        switch (typeof T.status == "string" ? T.then(Ie, Ie) : (T.status = "pending", T.then(
          function(Y) {
            T.status === "pending" && (T.status = "fulfilled", T.value = Y);
          },
          function(Y) {
            T.status === "pending" && (T.status = "rejected", T.reason = Y);
          }
        )), T.status) {
          case "fulfilled":
            return T.value;
          case "rejected":
            throw T.reason;
        }
    }
    throw T;
  }
  function J(T, Y, we, Te, me) {
    var Be = typeof T;
    (Be === "undefined" || Be === "boolean") && (T = null);
    var Se = !1;
    if (T === null) Se = !0;
    else
      switch (Be) {
        case "bigint":
        case "string":
        case "number":
          Se = !0;
          break;
        case "object":
          switch (T.$$typeof) {
            case de:
            case ue:
              Se = !0;
              break;
            case He:
              return Se = T._init, J(
                Se(T._payload),
                Y,
                we,
                Te,
                me
              );
          }
      }
    if (Se)
      return me = me(T), Se = Te === "" ? "." + nt(T, 0) : Te, Vn(me) ? (we = "", Se != null && (we = Se.replace(qr, "$&/") + "/"), J(me, Y, we, "", function(tt) {
        return tt;
      })) : me != null && (si(me) && (me = Kn(
        me,
        we + (me.key == null || T && T.key === me.key ? "" : ("" + me.key).replace(
          qr,
          "$&/"
        ) + "/") + Se
      )), Y.push(me)), 1;
    Se = 0;
    var Rt = Te === "" ? "." : Te + ":";
    if (Vn(T))
      for (var Rn = 0; Rn < T.length; Rn++)
        Te = T[Rn], Be = Rt + nt(Te, Rn), Se += J(
          Te,
          Y,
          we,
          Be,
          me
        );
    else if (Rn = Pe(T), typeof Rn == "function")
      for (T = Rn.call(T), Rn = 0; !(Te = T.next()).done; )
        Te = Te.value, Be = Rt + nt(Te, Rn++), Se += J(
          Te,
          Y,
          we,
          Be,
          me
        );
    else if (Be === "object") {
      if (typeof T.then == "function")
        return J(
          Ae(T),
          Y,
          we,
          Te,
          me
        );
      throw Y = String(T), Error(
        "Objects are not valid as a React child (found: " + (Y === "[object Object]" ? "object with keys {" + Object.keys(T).join(", ") + "}" : Y) + "). If you meant to render a collection of children, use an array instead."
      );
    }
    return Se;
  }
  function he(T, Y, we) {
    if (T == null) return T;
    var Te = [], me = 0;
    return J(T, Te, "", "", function(Be) {
      return Y.call(we, Be, me++);
    }), Te;
  }
  function Tr(T) {
    if (T._status === -1) {
      var Y = T._result;
      Y = Y(), Y.then(
        function(we) {
          (T._status === 0 || T._status === -1) && (T._status = 1, T._result = we);
        },
        function(we) {
          (T._status === 0 || T._status === -1) && (T._status = 2, T._result = we);
        }
      ), T._status === -1 && (T._status = 0, T._result = Y);
    }
    if (T._status === 1) return T._result.default;
    throw T._result;
  }
  var vl = typeof reportError == "function" ? reportError : function(T) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var Y = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof T == "object" && T !== null && typeof T.message == "string" ? String(T.message) : String(T),
        error: T
      });
      if (!window.dispatchEvent(Y)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", T);
      return;
    }
    console.error(T);
  }, fe = {
    map: he,
    forEach: function(T, Y, we) {
      he(
        T,
        function() {
          Y.apply(this, arguments);
        },
        we
      );
    },
    count: function(T) {
      var Y = 0;
      return he(T, function() {
        Y++;
      }), Y;
    },
    toArray: function(T) {
      return he(T, function(Y) {
        return Y;
      }) || [];
    },
    only: function(T) {
      if (!si(T))
        throw Error(
          "React.Children.only expected to receive a single React element child."
        );
      return T;
    }
  };
  return gn.Activity = P, gn.Children = fe, gn.Component = tr, gn.Fragment = W, gn.Profiler = nn, gn.PureComponent = Gl, gn.StrictMode = ke, gn.Suspense = Re, gn.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = Ve, gn.__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(T) {
      return Ve.H.useMemoCache(T);
    }
  }, gn.cache = function(T) {
    return function() {
      return T.apply(null, arguments);
    };
  }, gn.cacheSignal = function() {
    return null;
  }, gn.cloneElement = function(T, Y, we) {
    if (T == null)
      throw Error(
        "The argument must be a React element, but you passed " + T + "."
      );
    var Te = X({}, T.props), me = T.key;
    if (Y != null)
      for (Be in Y.key !== void 0 && (me = "" + Y.key), Y)
        !Et.call(Y, Be) || Be === "key" || Be === "__self" || Be === "__source" || Be === "ref" && Y.ref === void 0 || (Te[Be] = Y[Be]);
    var Be = arguments.length - 2;
    if (Be === 1) Te.children = we;
    else if (1 < Be) {
      for (var Se = Array(Be), Rt = 0; Rt < Be; Rt++)
        Se[Rt] = arguments[Rt + 2];
      Te.children = Se;
    }
    return rn(T.type, me, Te);
  }, gn.createContext = function(T) {
    return T = {
      $$typeof: Oe,
      _currentValue: T,
      _currentValue2: T,
      _threadCount: 0,
      Provider: null,
      Consumer: null
    }, T.Provider = T, T.Consumer = {
      $$typeof: be,
      _context: T
    }, T;
  }, gn.createElement = function(T, Y, we) {
    var Te, me = {}, Be = null;
    if (Y != null)
      for (Te in Y.key !== void 0 && (Be = "" + Y.key), Y)
        Et.call(Y, Te) && Te !== "key" && Te !== "__self" && Te !== "__source" && (me[Te] = Y[Te]);
    var Se = arguments.length - 2;
    if (Se === 1) me.children = we;
    else if (1 < Se) {
      for (var Rt = Array(Se), Rn = 0; Rn < Se; Rn++)
        Rt[Rn] = arguments[Rn + 2];
      me.children = Rt;
    }
    if (T && T.defaultProps)
      for (Te in Se = T.defaultProps, Se)
        me[Te] === void 0 && (me[Te] = Se[Te]);
    return rn(T, Be, me);
  }, gn.createRef = function() {
    return { current: null };
  }, gn.forwardRef = function(T) {
    return { $$typeof: Tn, render: T };
  }, gn.isValidElement = si, gn.lazy = function(T) {
    return {
      $$typeof: He,
      _payload: { _status: -1, _result: T },
      _init: Tr
    };
  }, gn.memo = function(T, Y) {
    return {
      $$typeof: ie,
      type: T,
      compare: Y === void 0 ? null : Y
    };
  }, gn.startTransition = function(T) {
    var Y = Ve.T, we = {};
    Ve.T = we;
    try {
      var Te = T(), me = Ve.S;
      me !== null && me(we, Te), typeof Te == "object" && Te !== null && typeof Te.then == "function" && Te.then(Ie, vl);
    } catch (Be) {
      vl(Be);
    } finally {
      Y !== null && we.types !== null && (Y.types = we.types), Ve.T = Y;
    }
  }, gn.unstable_useCacheRefresh = function() {
    return Ve.H.useCacheRefresh();
  }, gn.use = function(T) {
    return Ve.H.use(T);
  }, gn.useActionState = function(T, Y, we) {
    return Ve.H.useActionState(T, Y, we);
  }, gn.useCallback = function(T, Y) {
    return Ve.H.useCallback(T, Y);
  }, gn.useContext = function(T) {
    return Ve.H.useContext(T);
  }, gn.useDebugValue = function() {
  }, gn.useDeferredValue = function(T, Y) {
    return Ve.H.useDeferredValue(T, Y);
  }, gn.useEffect = function(T, Y) {
    return Ve.H.useEffect(T, Y);
  }, gn.useEffectEvent = function(T) {
    return Ve.H.useEffectEvent(T);
  }, gn.useId = function() {
    return Ve.H.useId();
  }, gn.useImperativeHandle = function(T, Y, we) {
    return Ve.H.useImperativeHandle(T, Y, we);
  }, gn.useInsertionEffect = function(T, Y) {
    return Ve.H.useInsertionEffect(T, Y);
  }, gn.useLayoutEffect = function(T, Y) {
    return Ve.H.useLayoutEffect(T, Y);
  }, gn.useMemo = function(T, Y) {
    return Ve.H.useMemo(T, Y);
  }, gn.useOptimistic = function(T, Y) {
    return Ve.H.useOptimistic(T, Y);
  }, gn.useReducer = function(T, Y, we) {
    return Ve.H.useReducer(T, Y, we);
  }, gn.useRef = function(T) {
    return Ve.H.useRef(T);
  }, gn.useState = function(T) {
    return Ve.H.useState(T);
  }, gn.useSyncExternalStore = function(T, Y, we) {
    return Ve.H.useSyncExternalStore(
      T,
      Y,
      we
    );
  }, gn.useTransition = function() {
    return Ve.H.useTransition();
  }, gn.version = "19.2.6", gn;
}
var of = { exports: {} };
of.exports;
var Lf;
function eh() {
  return Lf || (Lf = 1, (function(de, ue) {
    process.env.NODE_ENV !== "production" && (function() {
      function W(R, L) {
        Object.defineProperty(be.prototype, R, {
          get: function() {
            console.warn(
              "%s(...) is deprecated in plain JavaScript React classes. %s",
              L[0],
              L[1]
            );
          }
        });
      }
      function ke(R) {
        return R === null || typeof R != "object" ? null : (R = Da && R[Da] || R["@@iterator"], typeof R == "function" ? R : null);
      }
      function nn(R, L) {
        R = (R = R.constructor) && (R.displayName || R.name) || "ReactClass";
        var ne = R + "." + L;
        Ge[ne] || (console.error(
          "Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.",
          L,
          R
        ), Ge[ne] = !0);
      }
      function be(R, L, ne) {
        this.props = R, this.context = L, this.refs = St, this.updater = ne || mt;
      }
      function Oe() {
      }
      function Tn(R, L, ne) {
        this.props = R, this.context = L, this.refs = St, this.updater = ne || mt;
      }
      function Re() {
      }
      function ie(R) {
        return "" + R;
      }
      function He(R) {
        try {
          ie(R);
          var L = !1;
        } catch {
          L = !0;
        }
        if (L) {
          L = console;
          var ne = L.error, Ee = typeof Symbol == "function" && Symbol.toStringTag && R[Symbol.toStringTag] || R.constructor.name || "Object";
          return ne.call(
            L,
            "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
            Ee
          ), ie(R);
        }
      }
      function P(R) {
        if (R == null) return null;
        if (typeof R == "function")
          return R.$$typeof === Xt ? null : R.displayName || R.name || null;
        if (typeof R == "string") return R;
        switch (R) {
          case T:
            return "Fragment";
          case we:
            return "Profiler";
          case Y:
            return "StrictMode";
          case Se:
            return "Suspense";
          case Rt:
            return "SuspenseList";
          case Ct:
            return "Activity";
        }
        if (typeof R == "object")
          switch (typeof R.tag == "number" && console.error(
            "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
          ), R.$$typeof) {
            case fe:
              return "Portal";
            case me:
              return R.displayName || "Context";
            case Te:
              return (R._context.displayName || "Context") + ".Consumer";
            case Be:
              var L = R.render;
              return R = R.displayName, R || (R = L.displayName || L.name || "", R = R !== "" ? "ForwardRef(" + R + ")" : "ForwardRef"), R;
            case Rn:
              return L = R.displayName || null, L !== null ? L : P(R.type) || "Memo";
            case tt:
              L = R._payload, R = R._init;
              try {
                return P(R(L));
              } catch {
              }
          }
        return null;
      }
      function N(R) {
        if (R === T) return "<>";
        if (typeof R == "object" && R !== null && R.$$typeof === tt)
          return "<...>";
        try {
          var L = P(R);
          return L ? "<" + L + ">" : "<...>";
        } catch {
          return "<...>";
        }
      }
      function Pe() {
        var R = De.A;
        return R === null ? null : R.getOwner();
      }
      function ee() {
        return Error("react-stack-top-frame");
      }
      function X(R) {
        if (xr.call(R, "key")) {
          var L = Object.getOwnPropertyDescriptor(R, "key").get;
          if (L && L.isReactWarning) return !1;
        }
        return R.key !== void 0;
      }
      function ft(R, L) {
        function ne() {
          $r || ($r = !0, console.error(
            "%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)",
            L
          ));
        }
        ne.isReactWarning = !0, Object.defineProperty(R, "key", {
          get: ne,
          configurable: !0
        });
      }
      function tr() {
        var R = P(this.type);
        return vn[R] || (vn[R] = !0, console.error(
          "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
        )), R = this.props.ref, R !== void 0 ? R : null;
      }
      function Yt(R, L, ne, Ee, Fe, ln) {
        var Ke = ne.ref;
        return R = {
          $$typeof: vl,
          type: R,
          key: L,
          props: ne,
          _owner: Ee
        }, (Ke !== void 0 ? Ke : null) !== null ? Object.defineProperty(R, "ref", {
          enumerable: !1,
          get: tr
        }) : Object.defineProperty(R, "ref", { enumerable: !1, value: null }), R._store = {}, Object.defineProperty(R._store, "validated", {
          configurable: !1,
          enumerable: !1,
          writable: !0,
          value: 0
        }), Object.defineProperty(R, "_debugInfo", {
          configurable: !1,
          enumerable: !1,
          writable: !0,
          value: null
        }), Object.defineProperty(R, "_debugStack", {
          configurable: !1,
          enumerable: !1,
          writable: !0,
          value: Fe
        }), Object.defineProperty(R, "_debugTask", {
          configurable: !1,
          enumerable: !1,
          writable: !0,
          value: ln
        }), Object.freeze && (Object.freeze(R.props), Object.freeze(R)), R;
      }
      function Gl(R, L) {
        return L = Yt(
          R.type,
          L,
          R.props,
          R._owner,
          R._debugStack,
          R._debugTask
        ), R._store && (L._store.validated = R._store.validated), L;
      }
      function Hr(R) {
        Vn(R) ? R._store && (R._store.validated = 1) : typeof R == "object" && R !== null && R.$$typeof === tt && (R._payload.status === "fulfilled" ? Vn(R._payload.value) && R._payload.value._store && (R._payload.value._store.validated = 1) : R._store && (R._store.validated = 1));
      }
      function Vn(R) {
        return typeof R == "object" && R !== null && R.$$typeof === vl;
      }
      function Ie(R) {
        var L = { "=": "=0", ":": "=2" };
        return "$" + R.replace(/[=:]/g, function(ne) {
          return L[ne];
        });
      }
      function Ve(R, L) {
        return typeof R == "object" && R !== null && R.key != null ? (He(R.key), Ie("" + R.key)) : L.toString(36);
      }
      function Et(R) {
        switch (R.status) {
          case "fulfilled":
            return R.value;
          case "rejected":
            throw R.reason;
          default:
            switch (typeof R.status == "string" ? R.then(Re, Re) : (R.status = "pending", R.then(
              function(L) {
                R.status === "pending" && (R.status = "fulfilled", R.value = L);
              },
              function(L) {
                R.status === "pending" && (R.status = "rejected", R.reason = L);
              }
            )), R.status) {
              case "fulfilled":
                return R.value;
              case "rejected":
                throw R.reason;
            }
        }
        throw R;
      }
      function rn(R, L, ne, Ee, Fe) {
        var ln = typeof R;
        (ln === "undefined" || ln === "boolean") && (R = null);
        var Ke = !1;
        if (R === null) Ke = !0;
        else
          switch (ln) {
            case "bigint":
            case "string":
            case "number":
              Ke = !0;
              break;
            case "object":
              switch (R.$$typeof) {
                case vl:
                case fe:
                  Ke = !0;
                  break;
                case tt:
                  return Ke = R._init, rn(
                    Ke(R._payload),
                    L,
                    ne,
                    Ee,
                    Fe
                  );
              }
          }
        if (Ke) {
          Ke = R, Fe = Fe(Ke);
          var an = Ee === "" ? "." + Ve(Ke, 0) : Ee;
          return Xl(Fe) ? (ne = "", an != null && (ne = an.replace(ht, "$&/") + "/"), rn(Fe, L, ne, "", function(Jl) {
            return Jl;
          })) : Fe != null && (Vn(Fe) && (Fe.key != null && (Ke && Ke.key === Fe.key || He(Fe.key)), ne = Gl(
            Fe,
            ne + (Fe.key == null || Ke && Ke.key === Fe.key ? "" : ("" + Fe.key).replace(
              ht,
              "$&/"
            ) + "/") + an
          ), Ee !== "" && Ke != null && Vn(Ke) && Ke.key == null && Ke._store && !Ke._store.validated && (ne._store.validated = 2), Fe = ne), L.push(Fe)), 1;
        }
        if (Ke = 0, an = Ee === "" ? "." : Ee + ":", Xl(R))
          for (var We = 0; We < R.length; We++)
            Ee = R[We], ln = an + Ve(Ee, We), Ke += rn(
              Ee,
              L,
              ne,
              ln,
              Fe
            );
        else if (We = ke(R), typeof We == "function")
          for (We === R.entries && (rc || console.warn(
            "Using Maps as children is not supported. Use an array of keyed ReactElements instead."
          ), rc = !0), R = We.call(R), We = 0; !(Ee = R.next()).done; )
            Ee = Ee.value, ln = an + Ve(Ee, We++), Ke += rn(
              Ee,
              L,
              ne,
              ln,
              Fe
            );
        else if (ln === "object") {
          if (typeof R.then == "function")
            return rn(
              Et(R),
              L,
              ne,
              Ee,
              Fe
            );
          throw L = String(R), Error(
            "Objects are not valid as a React child (found: " + (L === "[object Object]" ? "object with keys {" + Object.keys(R).join(", ") + "}" : L) + "). If you meant to render a collection of children, use an array instead."
          );
        }
        return Ke;
      }
      function Kn(R, L, ne) {
        if (R == null) return R;
        var Ee = [], Fe = 0;
        return rn(R, Ee, "", "", function(ln) {
          return L.call(ne, ln, Fe++);
        }), Ee;
      }
      function si(R) {
        if (R._status === -1) {
          var L = R._ioInfo;
          L != null && (L.start = L.end = performance.now()), L = R._result;
          var ne = L();
          if (ne.then(
            function(Fe) {
              if (R._status === 0 || R._status === -1) {
                R._status = 1, R._result = Fe;
                var ln = R._ioInfo;
                ln != null && (ln.end = performance.now()), ne.status === void 0 && (ne.status = "fulfilled", ne.value = Fe);
              }
            },
            function(Fe) {
              if (R._status === 0 || R._status === -1) {
                R._status = 2, R._result = Fe;
                var ln = R._ioInfo;
                ln != null && (ln.end = performance.now()), ne.status === void 0 && (ne.status = "rejected", ne.reason = Fe);
              }
            }
          ), L = R._ioInfo, L != null) {
            L.value = ne;
            var Ee = ne.displayName;
            typeof Ee == "string" && (L.name = Ee);
          }
          R._status === -1 && (R._status = 0, R._result = ne);
        }
        if (R._status === 1)
          return L = R._result, L === void 0 && console.error(
            `lazy: Expected the result of a dynamic import() call. Instead received: %s

Your code should look like: 
  const MyComponent = lazy(() => import('./MyComponent'))

Did you accidentally put curly braces around the import?`,
            L
          ), "default" in L || console.error(
            `lazy: Expected the result of a dynamic import() call. Instead received: %s

Your code should look like: 
  const MyComponent = lazy(() => import('./MyComponent'))`,
            L
          ), L.default;
        throw R._result;
      }
      function Ln() {
        var R = De.H;
        return R === null && console.error(
          `Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:
1. You might have mismatching versions of React and the renderer (such as React DOM)
2. You might be breaking the Rules of Hooks
3. You might have more than one copy of React in the same app
See https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.`
        ), R;
      }
      function qr() {
        De.asyncTransitions--;
      }
      function nt(R) {
        if (el === null)
          try {
            var L = ("require" + Math.random()).slice(0, 7);
            el = (de && de[L]).call(
              de,
              "timers"
            ).setImmediate;
          } catch {
            el = function(Ee) {
              xo === !1 && (xo = !0, typeof MessageChannel > "u" && console.error(
                "This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning."
              ));
              var Fe = new MessageChannel();
              Fe.port1.onmessage = Ee, Fe.port2.postMessage(void 0);
            };
          }
        return el(R);
      }
      function Ae(R) {
        return 1 < R.length && typeof AggregateError == "function" ? new AggregateError(R) : R[0];
      }
      function J(R, L) {
        L !== aa - 1 && console.error(
          "You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. "
        ), aa = L;
      }
      function he(R, L, ne) {
        var Ee = De.actQueue;
        if (Ee !== null)
          if (Ee.length !== 0)
            try {
              Tr(Ee), nt(function() {
                return he(R, L, ne);
              });
              return;
            } catch (Fe) {
              De.thrownErrors.push(Fe);
            }
          else De.actQueue = null;
        0 < De.thrownErrors.length ? (Ee = Ae(De.thrownErrors), De.thrownErrors.length = 0, ne(Ee)) : L(R);
      }
      function Tr(R) {
        if (!Zl) {
          Zl = !0;
          var L = 0;
          try {
            for (; L < R.length; L++) {
              var ne = R[L];
              do {
                De.didUsePromise = !1;
                var Ee = ne(!1);
                if (Ee !== null) {
                  if (De.didUsePromise) {
                    R[L] = ne, R.splice(0, L);
                    return;
                  }
                  ne = Ee;
                } else break;
              } while (!0);
            }
            R.length = 0;
          } catch (Fe) {
            R.splice(0, L + 1), De.thrownErrors.push(Fe);
          } finally {
            Zl = !1;
          }
        }
      }
      typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart == "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
      var vl = /* @__PURE__ */ Symbol.for("react.transitional.element"), fe = /* @__PURE__ */ Symbol.for("react.portal"), T = /* @__PURE__ */ Symbol.for("react.fragment"), Y = /* @__PURE__ */ Symbol.for("react.strict_mode"), we = /* @__PURE__ */ Symbol.for("react.profiler"), Te = /* @__PURE__ */ Symbol.for("react.consumer"), me = /* @__PURE__ */ Symbol.for("react.context"), Be = /* @__PURE__ */ Symbol.for("react.forward_ref"), Se = /* @__PURE__ */ Symbol.for("react.suspense"), Rt = /* @__PURE__ */ Symbol.for("react.suspense_list"), Rn = /* @__PURE__ */ Symbol.for("react.memo"), tt = /* @__PURE__ */ Symbol.for("react.lazy"), Ct = /* @__PURE__ */ Symbol.for("react.activity"), Da = Symbol.iterator, Ge = {}, mt = {
        isMounted: function() {
          return !1;
        },
        enqueueForceUpdate: function(R) {
          nn(R, "forceUpdate");
        },
        enqueueReplaceState: function(R) {
          nn(R, "replaceState");
        },
        enqueueSetState: function(R) {
          nn(R, "setState");
        }
      }, xn = Object.assign, St = {};
      Object.freeze(St), be.prototype.isReactComponent = {}, be.prototype.setState = function(R, L) {
        if (typeof R != "object" && typeof R != "function" && R != null)
          throw Error(
            "takes an object of state variables to update or a function which returns an object of state variables."
          );
        this.updater.enqueueSetState(this, R, L, "setState");
      }, be.prototype.forceUpdate = function(R) {
        this.updater.enqueueForceUpdate(this, R, "forceUpdate");
      };
      var Gt = {
        isMounted: [
          "isMounted",
          "Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks."
        ],
        replaceState: [
          "replaceState",
          "Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236)."
        ]
      };
      for (yl in Gt)
        Gt.hasOwnProperty(yl) && W(yl, Gt[yl]);
      Oe.prototype = be.prototype, Gt = Tn.prototype = new Oe(), Gt.constructor = Tn, xn(Gt, be.prototype), Gt.isPureReactComponent = !0;
      var Xl = Array.isArray, Xt = /* @__PURE__ */ Symbol.for("react.client.reference"), De = {
        H: null,
        A: null,
        T: null,
        S: null,
        actQueue: null,
        asyncTransitions: 0,
        isBatchingLegacy: !1,
        didScheduleLegacyUpdate: !1,
        didUsePromise: !1,
        thrownErrors: [],
        getCurrentStack: null,
        recentlyCreatedOwnerStacks: 0
      }, xr = Object.prototype.hasOwnProperty, At = console.createTask ? console.createTask : function() {
        return null;
      };
      Gt = {
        react_stack_bottom_frame: function(R) {
          return R();
        }
      };
      var $r, Na, vn = {}, rr = Gt.react_stack_bottom_frame.bind(
        Gt,
        ee
      )(), Bn = At(N(ee)), rc = !1, ht = /\/+/g, To = typeof reportError == "function" ? reportError : function(R) {
        if (typeof window == "object" && typeof window.ErrorEvent == "function") {
          var L = new window.ErrorEvent("error", {
            bubbles: !0,
            cancelable: !0,
            message: typeof R == "object" && R !== null && typeof R.message == "string" ? String(R.message) : String(R),
            error: R
          });
          if (!window.dispatchEvent(L)) return;
        } else if (typeof process == "object" && typeof process.emit == "function") {
          process.emit("uncaughtException", R);
          return;
        }
        console.error(R);
      }, xo = !1, el = null, aa = 0, fi = !1, Zl = !1, Ql = typeof queueMicrotask == "function" ? function(R) {
        queueMicrotask(function() {
          return queueMicrotask(R);
        });
      } : nt;
      Gt = Object.freeze({
        __proto__: null,
        c: function(R) {
          return Ln().useMemoCache(R);
        }
      });
      var yl = {
        map: Kn,
        forEach: function(R, L, ne) {
          Kn(
            R,
            function() {
              L.apply(this, arguments);
            },
            ne
          );
        },
        count: function(R) {
          var L = 0;
          return Kn(R, function() {
            L++;
          }), L;
        },
        toArray: function(R) {
          return Kn(R, function(L) {
            return L;
          }) || [];
        },
        only: function(R) {
          if (!Vn(R))
            throw Error(
              "React.Children.only expected to receive a single React element child."
            );
          return R;
        }
      };
      ue.Activity = Ct, ue.Children = yl, ue.Component = be, ue.Fragment = T, ue.Profiler = we, ue.PureComponent = Tn, ue.StrictMode = Y, ue.Suspense = Se, ue.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = De, ue.__COMPILER_RUNTIME = Gt, ue.act = function(R) {
        var L = De.actQueue, ne = aa;
        aa++;
        var Ee = De.actQueue = L !== null ? L : [], Fe = !1;
        try {
          var ln = R();
        } catch (We) {
          De.thrownErrors.push(We);
        }
        if (0 < De.thrownErrors.length)
          throw J(L, ne), R = Ae(De.thrownErrors), De.thrownErrors.length = 0, R;
        if (ln !== null && typeof ln == "object" && typeof ln.then == "function") {
          var Ke = ln;
          return Ql(function() {
            Fe || fi || (fi = !0, console.error(
              "You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);"
            ));
          }), {
            then: function(We, Jl) {
              Fe = !0, Ke.then(
                function(nl) {
                  if (J(L, ne), ne === 0) {
                    try {
                      Tr(Ee), nt(function() {
                        return he(
                          nl,
                          We,
                          Jl
                        );
                      });
                    } catch (hi) {
                      De.thrownErrors.push(hi);
                    }
                    if (0 < De.thrownErrors.length) {
                      var dt = Ae(
                        De.thrownErrors
                      );
                      De.thrownErrors.length = 0, Jl(dt);
                    }
                  } else We(nl);
                },
                function(nl) {
                  J(L, ne), 0 < De.thrownErrors.length && (nl = Ae(
                    De.thrownErrors
                  ), De.thrownErrors.length = 0), Jl(nl);
                }
              );
            }
          };
        }
        var an = ln;
        if (J(L, ne), ne === 0 && (Tr(Ee), Ee.length !== 0 && Ql(function() {
          Fe || fi || (fi = !0, console.error(
            "A component suspended inside an `act` scope, but the `act` call was not awaited. When testing React components that depend on asynchronous data, you must await the result:\n\nawait act(() => ...)"
          ));
        }), De.actQueue = null), 0 < De.thrownErrors.length)
          throw R = Ae(De.thrownErrors), De.thrownErrors.length = 0, R;
        return {
          then: function(We, Jl) {
            Fe = !0, ne === 0 ? (De.actQueue = Ee, nt(function() {
              return he(
                an,
                We,
                Jl
              );
            })) : We(an);
          }
        };
      }, ue.cache = function(R) {
        return function() {
          return R.apply(null, arguments);
        };
      }, ue.cacheSignal = function() {
        return null;
      }, ue.captureOwnerStack = function() {
        var R = De.getCurrentStack;
        return R === null ? null : R();
      }, ue.cloneElement = function(R, L, ne) {
        if (R == null)
          throw Error(
            "The argument must be a React element, but you passed " + R + "."
          );
        var Ee = xn({}, R.props), Fe = R.key, ln = R._owner;
        if (L != null) {
          var Ke;
          e: {
            if (xr.call(L, "ref") && (Ke = Object.getOwnPropertyDescriptor(
              L,
              "ref"
            ).get) && Ke.isReactWarning) {
              Ke = !1;
              break e;
            }
            Ke = L.ref !== void 0;
          }
          Ke && (ln = Pe()), X(L) && (He(L.key), Fe = "" + L.key);
          for (an in L)
            !xr.call(L, an) || an === "key" || an === "__self" || an === "__source" || an === "ref" && L.ref === void 0 || (Ee[an] = L[an]);
        }
        var an = arguments.length - 2;
        if (an === 1) Ee.children = ne;
        else if (1 < an) {
          Ke = Array(an);
          for (var We = 0; We < an; We++)
            Ke[We] = arguments[We + 2];
          Ee.children = Ke;
        }
        for (Ee = Yt(
          R.type,
          Fe,
          Ee,
          ln,
          R._debugStack,
          R._debugTask
        ), Fe = 2; Fe < arguments.length; Fe++)
          Hr(arguments[Fe]);
        return Ee;
      }, ue.createContext = function(R) {
        return R = {
          $$typeof: me,
          _currentValue: R,
          _currentValue2: R,
          _threadCount: 0,
          Provider: null,
          Consumer: null
        }, R.Provider = R, R.Consumer = {
          $$typeof: Te,
          _context: R
        }, R._currentRenderer = null, R._currentRenderer2 = null, R;
      }, ue.createElement = function(R, L, ne) {
        for (var Ee = 2; Ee < arguments.length; Ee++)
          Hr(arguments[Ee]);
        Ee = {};
        var Fe = null;
        if (L != null)
          for (We in Na || !("__self" in L) || "key" in L || (Na = !0, console.warn(
            "Your app (or one of its dependencies) is using an outdated JSX transform. Update to the modern JSX transform for faster performance: https://react.dev/link/new-jsx-transform"
          )), X(L) && (He(L.key), Fe = "" + L.key), L)
            xr.call(L, We) && We !== "key" && We !== "__self" && We !== "__source" && (Ee[We] = L[We]);
        var ln = arguments.length - 2;
        if (ln === 1) Ee.children = ne;
        else if (1 < ln) {
          for (var Ke = Array(ln), an = 0; an < ln; an++)
            Ke[an] = arguments[an + 2];
          Object.freeze && Object.freeze(Ke), Ee.children = Ke;
        }
        if (R && R.defaultProps)
          for (We in ln = R.defaultProps, ln)
            Ee[We] === void 0 && (Ee[We] = ln[We]);
        Fe && ft(
          Ee,
          typeof R == "function" ? R.displayName || R.name || "Unknown" : R
        );
        var We = 1e4 > De.recentlyCreatedOwnerStacks++;
        return Yt(
          R,
          Fe,
          Ee,
          Pe(),
          We ? Error("react-stack-top-frame") : rr,
          We ? At(N(R)) : Bn
        );
      }, ue.createRef = function() {
        var R = { current: null };
        return Object.seal(R), R;
      }, ue.forwardRef = function(R) {
        R != null && R.$$typeof === Rn ? console.error(
          "forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...))."
        ) : typeof R != "function" ? console.error(
          "forwardRef requires a render function but was given %s.",
          R === null ? "null" : typeof R
        ) : R.length !== 0 && R.length !== 2 && console.error(
          "forwardRef render functions accept exactly two parameters: props and ref. %s",
          R.length === 1 ? "Did you forget to use the ref parameter?" : "Any additional parameter will be undefined."
        ), R != null && R.defaultProps != null && console.error(
          "forwardRef render functions do not support defaultProps. Did you accidentally pass a React component?"
        );
        var L = { $$typeof: Be, render: R }, ne;
        return Object.defineProperty(L, "displayName", {
          enumerable: !1,
          configurable: !0,
          get: function() {
            return ne;
          },
          set: function(Ee) {
            ne = Ee, R.name || R.displayName || (Object.defineProperty(R, "name", { value: Ee }), R.displayName = Ee);
          }
        }), L;
      }, ue.isValidElement = Vn, ue.lazy = function(R) {
        R = { _status: -1, _result: R };
        var L = {
          $$typeof: tt,
          _payload: R,
          _init: si
        }, ne = {
          name: "lazy",
          start: -1,
          end: -1,
          value: null,
          owner: null,
          debugStack: Error("react-stack-top-frame"),
          debugTask: console.createTask ? console.createTask("lazy()") : null
        };
        return R._ioInfo = ne, L._debugInfo = [{ awaited: ne }], L;
      }, ue.memo = function(R, L) {
        R == null && console.error(
          "memo: The first argument must be a component. Instead received: %s",
          R === null ? "null" : typeof R
        ), L = {
          $$typeof: Rn,
          type: R,
          compare: L === void 0 ? null : L
        };
        var ne;
        return Object.defineProperty(L, "displayName", {
          enumerable: !1,
          configurable: !0,
          get: function() {
            return ne;
          },
          set: function(Ee) {
            ne = Ee, R.name || R.displayName || (Object.defineProperty(R, "name", { value: Ee }), R.displayName = Ee);
          }
        }), L;
      }, ue.startTransition = function(R) {
        var L = De.T, ne = {};
        ne._updatedFibers = /* @__PURE__ */ new Set(), De.T = ne;
        try {
          var Ee = R(), Fe = De.S;
          Fe !== null && Fe(ne, Ee), typeof Ee == "object" && Ee !== null && typeof Ee.then == "function" && (De.asyncTransitions++, Ee.then(qr, qr), Ee.then(Re, To));
        } catch (ln) {
          To(ln);
        } finally {
          L === null && ne._updatedFibers && (R = ne._updatedFibers.size, ne._updatedFibers.clear(), 10 < R && console.warn(
            "Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table."
          )), L !== null && ne.types !== null && (L.types !== null && L.types !== ne.types && console.error(
            "We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."
          ), L.types = ne.types), De.T = L;
        }
      }, ue.unstable_useCacheRefresh = function() {
        return Ln().useCacheRefresh();
      }, ue.use = function(R) {
        return Ln().use(R);
      }, ue.useActionState = function(R, L, ne) {
        return Ln().useActionState(
          R,
          L,
          ne
        );
      }, ue.useCallback = function(R, L) {
        return Ln().useCallback(R, L);
      }, ue.useContext = function(R) {
        var L = Ln();
        return R.$$typeof === Te && console.error(
          "Calling useContext(Context.Consumer) is not supported and will cause bugs. Did you mean to call useContext(Context) instead?"
        ), L.useContext(R);
      }, ue.useDebugValue = function(R, L) {
        return Ln().useDebugValue(R, L);
      }, ue.useDeferredValue = function(R, L) {
        return Ln().useDeferredValue(R, L);
      }, ue.useEffect = function(R, L) {
        return R == null && console.warn(
          "React Hook useEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        ), Ln().useEffect(R, L);
      }, ue.useEffectEvent = function(R) {
        return Ln().useEffectEvent(R);
      }, ue.useId = function() {
        return Ln().useId();
      }, ue.useImperativeHandle = function(R, L, ne) {
        return Ln().useImperativeHandle(R, L, ne);
      }, ue.useInsertionEffect = function(R, L) {
        return R == null && console.warn(
          "React Hook useInsertionEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        ), Ln().useInsertionEffect(R, L);
      }, ue.useLayoutEffect = function(R, L) {
        return R == null && console.warn(
          "React Hook useLayoutEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        ), Ln().useLayoutEffect(R, L);
      }, ue.useMemo = function(R, L) {
        return Ln().useMemo(R, L);
      }, ue.useOptimistic = function(R, L) {
        return Ln().useOptimistic(R, L);
      }, ue.useReducer = function(R, L, ne) {
        return Ln().useReducer(R, L, ne);
      }, ue.useRef = function(R) {
        return Ln().useRef(R);
      }, ue.useState = function(R) {
        return Ln().useState(R);
      }, ue.useSyncExternalStore = function(R, L, ne) {
        return Ln().useSyncExternalStore(
          R,
          L,
          ne
        );
      }, ue.useTransition = function() {
        return Ln().useTransition();
      }, ue.version = "19.2.6", typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop == "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
    })();
  })(of, of.exports)), of.exports;
}
var Bf;
function Ms() {
  return Bf || (Bf = 1, process.env.NODE_ENV === "production" ? df.exports = $f() : df.exports = eh()), df.exports;
}
var _f;
function nh() {
  return _f || (_f = 1, process.env.NODE_ENV !== "production" && (function() {
    function de(T) {
      if (T == null) return null;
      if (typeof T == "function")
        return T.$$typeof === si ? null : T.displayName || T.name || null;
      if (typeof T == "string") return T;
      switch (T) {
        case ft:
          return "Fragment";
        case Yt:
          return "Profiler";
        case tr:
          return "StrictMode";
        case Ie:
          return "Suspense";
        case Ve:
          return "SuspenseList";
        case Kn:
          return "Activity";
      }
      if (typeof T == "object")
        switch (typeof T.tag == "number" && console.error(
          "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
        ), T.$$typeof) {
          case X:
            return "Portal";
          case Hr:
            return T.displayName || "Context";
          case Gl:
            return (T._context.displayName || "Context") + ".Consumer";
          case Vn:
            var Y = T.render;
            return T = T.displayName, T || (T = Y.displayName || Y.name || "", T = T !== "" ? "ForwardRef(" + T + ")" : "ForwardRef"), T;
          case Et:
            return Y = T.displayName || null, Y !== null ? Y : de(T.type) || "Memo";
          case rn:
            Y = T._payload, T = T._init;
            try {
              return de(T(Y));
            } catch {
            }
        }
      return null;
    }
    function ue(T) {
      return "" + T;
    }
    function W(T) {
      try {
        ue(T);
        var Y = !1;
      } catch {
        Y = !0;
      }
      if (Y) {
        Y = console;
        var we = Y.error, Te = typeof Symbol == "function" && Symbol.toStringTag && T[Symbol.toStringTag] || T.constructor.name || "Object";
        return we.call(
          Y,
          "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
          Te
        ), ue(T);
      }
    }
    function ke(T) {
      if (T === ft) return "<>";
      if (typeof T == "object" && T !== null && T.$$typeof === rn)
        return "<...>";
      try {
        var Y = de(T);
        return Y ? "<" + Y + ">" : "<...>";
      } catch {
        return "<...>";
      }
    }
    function nn() {
      var T = Ln.A;
      return T === null ? null : T.getOwner();
    }
    function be() {
      return Error("react-stack-top-frame");
    }
    function Oe(T) {
      if (qr.call(T, "key")) {
        var Y = Object.getOwnPropertyDescriptor(T, "key").get;
        if (Y && Y.isReactWarning) return !1;
      }
      return T.key !== void 0;
    }
    function Tn(T, Y) {
      function we() {
        J || (J = !0, console.error(
          "%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)",
          Y
        ));
      }
      we.isReactWarning = !0, Object.defineProperty(T, "key", {
        get: we,
        configurable: !0
      });
    }
    function Re() {
      var T = de(this.type);
      return he[T] || (he[T] = !0, console.error(
        "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
      )), T = this.props.ref, T !== void 0 ? T : null;
    }
    function ie(T, Y, we, Te, me, Be) {
      var Se = we.ref;
      return T = {
        $$typeof: ee,
        type: T,
        key: Y,
        props: we,
        _owner: Te
      }, (Se !== void 0 ? Se : null) !== null ? Object.defineProperty(T, "ref", {
        enumerable: !1,
        get: Re
      }) : Object.defineProperty(T, "ref", { enumerable: !1, value: null }), T._store = {}, Object.defineProperty(T._store, "validated", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: 0
      }), Object.defineProperty(T, "_debugInfo", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: null
      }), Object.defineProperty(T, "_debugStack", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: me
      }), Object.defineProperty(T, "_debugTask", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: Be
      }), Object.freeze && (Object.freeze(T.props), Object.freeze(T)), T;
    }
    function He(T, Y, we, Te, me, Be) {
      var Se = Y.children;
      if (Se !== void 0)
        if (Te)
          if (nt(Se)) {
            for (Te = 0; Te < Se.length; Te++)
              P(Se[Te]);
            Object.freeze && Object.freeze(Se);
          } else
            console.error(
              "React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead."
            );
        else P(Se);
      if (qr.call(Y, "key")) {
        Se = de(T);
        var Rt = Object.keys(Y).filter(function(tt) {
          return tt !== "key";
        });
        Te = 0 < Rt.length ? "{key: someKey, " + Rt.join(": ..., ") + ": ...}" : "{key: someKey}", fe[Se + Te] || (Rt = 0 < Rt.length ? "{" + Rt.join(": ..., ") + ": ...}" : "{}", console.error(
          `A props object containing a "key" prop is being spread into JSX:
  let props = %s;
  <%s {...props} />
React keys must be passed directly to JSX without using spread:
  let props = %s;
  <%s key={someKey} {...props} />`,
          Te,
          Se,
          Rt,
          Se
        ), fe[Se + Te] = !0);
      }
      if (Se = null, we !== void 0 && (W(we), Se = "" + we), Oe(Y) && (W(Y.key), Se = "" + Y.key), "key" in Y) {
        we = {};
        for (var Rn in Y)
          Rn !== "key" && (we[Rn] = Y[Rn]);
      } else we = Y;
      return Se && Tn(
        we,
        typeof T == "function" ? T.displayName || T.name || "Unknown" : T
      ), ie(
        T,
        Se,
        we,
        nn(),
        me,
        Be
      );
    }
    function P(T) {
      N(T) ? T._store && (T._store.validated = 1) : typeof T == "object" && T !== null && T.$$typeof === rn && (T._payload.status === "fulfilled" ? N(T._payload.value) && T._payload.value._store && (T._payload.value._store.validated = 1) : T._store && (T._store.validated = 1));
    }
    function N(T) {
      return typeof T == "object" && T !== null && T.$$typeof === ee;
    }
    var Pe = Ms(), ee = /* @__PURE__ */ Symbol.for("react.transitional.element"), X = /* @__PURE__ */ Symbol.for("react.portal"), ft = /* @__PURE__ */ Symbol.for("react.fragment"), tr = /* @__PURE__ */ Symbol.for("react.strict_mode"), Yt = /* @__PURE__ */ Symbol.for("react.profiler"), Gl = /* @__PURE__ */ Symbol.for("react.consumer"), Hr = /* @__PURE__ */ Symbol.for("react.context"), Vn = /* @__PURE__ */ Symbol.for("react.forward_ref"), Ie = /* @__PURE__ */ Symbol.for("react.suspense"), Ve = /* @__PURE__ */ Symbol.for("react.suspense_list"), Et = /* @__PURE__ */ Symbol.for("react.memo"), rn = /* @__PURE__ */ Symbol.for("react.lazy"), Kn = /* @__PURE__ */ Symbol.for("react.activity"), si = /* @__PURE__ */ Symbol.for("react.client.reference"), Ln = Pe.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, qr = Object.prototype.hasOwnProperty, nt = Array.isArray, Ae = console.createTask ? console.createTask : function() {
      return null;
    };
    Pe = {
      react_stack_bottom_frame: function(T) {
        return T();
      }
    };
    var J, he = {}, Tr = Pe.react_stack_bottom_frame.bind(
      Pe,
      be
    )(), vl = Ae(ke(be)), fe = {};
    tf.Fragment = ft, tf.jsx = function(T, Y, we) {
      var Te = 1e4 > Ln.recentlyCreatedOwnerStacks++;
      return He(
        T,
        Y,
        we,
        !1,
        Te ? Error("react-stack-top-frame") : Tr,
        Te ? Ae(ke(T)) : vl
      );
    }, tf.jsxs = function(T, Y, we) {
      var Te = 1e4 > Ln.recentlyCreatedOwnerStacks++;
      return He(
        T,
        Y,
        we,
        !0,
        Te ? Error("react-stack-top-frame") : Tr,
        Te ? Ae(ke(T)) : vl
      );
    };
  })()), tf;
}
var zf;
function th() {
  return zf || (zf = 1, process.env.NODE_ENV === "production" ? hf.exports = qf() : hf.exports = nh()), hf.exports;
}
var q = th(), Ws = {}, rf = {}, gf = { exports: {} }, la = {};
var Hf;
function rh() {
  if (Hf) return la;
  Hf = 1;
  var de = Ms();
  function ue(Re) {
    var ie = "https://react.dev/errors/" + Re;
    if (1 < arguments.length) {
      ie += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var He = 2; He < arguments.length; He++)
        ie += "&args[]=" + encodeURIComponent(arguments[He]);
    }
    return "Minified React error #" + Re + "; visit " + ie + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function W() {
  }
  var ke = {
    d: {
      f: W,
      r: function() {
        throw Error(ue(522));
      },
      D: W,
      C: W,
      L: W,
      m: W,
      X: W,
      S: W,
      M: W
    },
    p: 0,
    findDOMNode: null
  }, nn = /* @__PURE__ */ Symbol.for("react.portal");
  function be(Re, ie, He) {
    var P = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return {
      $$typeof: nn,
      key: P == null ? null : "" + P,
      children: Re,
      containerInfo: ie,
      implementation: He
    };
  }
  var Oe = de.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  function Tn(Re, ie) {
    if (Re === "font") return "";
    if (typeof ie == "string")
      return ie === "use-credentials" ? ie : "";
  }
  return la.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ke, la.createPortal = function(Re, ie) {
    var He = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
    if (!ie || ie.nodeType !== 1 && ie.nodeType !== 9 && ie.nodeType !== 11)
      throw Error(ue(299));
    return be(Re, ie, null, He);
  }, la.flushSync = function(Re) {
    var ie = Oe.T, He = ke.p;
    try {
      if (Oe.T = null, ke.p = 2, Re) return Re();
    } finally {
      Oe.T = ie, ke.p = He, ke.d.f();
    }
  }, la.preconnect = function(Re, ie) {
    typeof Re == "string" && (ie ? (ie = ie.crossOrigin, ie = typeof ie == "string" ? ie === "use-credentials" ? ie : "" : void 0) : ie = null, ke.d.C(Re, ie));
  }, la.prefetchDNS = function(Re) {
    typeof Re == "string" && ke.d.D(Re);
  }, la.preinit = function(Re, ie) {
    if (typeof Re == "string" && ie && typeof ie.as == "string") {
      var He = ie.as, P = Tn(He, ie.crossOrigin), N = typeof ie.integrity == "string" ? ie.integrity : void 0, Pe = typeof ie.fetchPriority == "string" ? ie.fetchPriority : void 0;
      He === "style" ? ke.d.S(
        Re,
        typeof ie.precedence == "string" ? ie.precedence : void 0,
        {
          crossOrigin: P,
          integrity: N,
          fetchPriority: Pe
        }
      ) : He === "script" && ke.d.X(Re, {
        crossOrigin: P,
        integrity: N,
        fetchPriority: Pe,
        nonce: typeof ie.nonce == "string" ? ie.nonce : void 0
      });
    }
  }, la.preinitModule = function(Re, ie) {
    if (typeof Re == "string")
      if (typeof ie == "object" && ie !== null) {
        if (ie.as == null || ie.as === "script") {
          var He = Tn(
            ie.as,
            ie.crossOrigin
          );
          ke.d.M(Re, {
            crossOrigin: He,
            integrity: typeof ie.integrity == "string" ? ie.integrity : void 0,
            nonce: typeof ie.nonce == "string" ? ie.nonce : void 0
          });
        }
      } else ie == null && ke.d.M(Re);
  }, la.preload = function(Re, ie) {
    if (typeof Re == "string" && typeof ie == "object" && ie !== null && typeof ie.as == "string") {
      var He = ie.as, P = Tn(He, ie.crossOrigin);
      ke.d.L(Re, He, {
        crossOrigin: P,
        integrity: typeof ie.integrity == "string" ? ie.integrity : void 0,
        nonce: typeof ie.nonce == "string" ? ie.nonce : void 0,
        type: typeof ie.type == "string" ? ie.type : void 0,
        fetchPriority: typeof ie.fetchPriority == "string" ? ie.fetchPriority : void 0,
        referrerPolicy: typeof ie.referrerPolicy == "string" ? ie.referrerPolicy : void 0,
        imageSrcSet: typeof ie.imageSrcSet == "string" ? ie.imageSrcSet : void 0,
        imageSizes: typeof ie.imageSizes == "string" ? ie.imageSizes : void 0,
        media: typeof ie.media == "string" ? ie.media : void 0
      });
    }
  }, la.preloadModule = function(Re, ie) {
    if (typeof Re == "string")
      if (ie) {
        var He = Tn(ie.as, ie.crossOrigin);
        ke.d.m(Re, {
          as: typeof ie.as == "string" && ie.as !== "script" ? ie.as : void 0,
          crossOrigin: He,
          integrity: typeof ie.integrity == "string" ? ie.integrity : void 0
        });
      } else ke.d.m(Re);
  }, la.requestFormReset = function(Re) {
    ke.d.r(Re);
  }, la.unstable_batchedUpdates = function(Re, ie) {
    return Re(ie);
  }, la.useFormState = function(Re, ie, He) {
    return Oe.H.useFormState(Re, ie, He);
  }, la.useFormStatus = function() {
    return Oe.H.useHostTransitionStatus();
  }, la.version = "19.2.6", la;
}
var ia = {};
var Uf;
function lh() {
  return Uf || (Uf = 1, process.env.NODE_ENV !== "production" && (function() {
    function de() {
    }
    function ue(P) {
      return "" + P;
    }
    function W(P, N, Pe) {
      var ee = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
      try {
        ue(ee);
        var X = !1;
      } catch {
        X = !0;
      }
      return X && (console.error(
        "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
        typeof Symbol == "function" && Symbol.toStringTag && ee[Symbol.toStringTag] || ee.constructor.name || "Object"
      ), ue(ee)), {
        $$typeof: ie,
        key: ee == null ? null : "" + ee,
        children: P,
        containerInfo: N,
        implementation: Pe
      };
    }
    function ke(P, N) {
      if (P === "font") return "";
      if (typeof N == "string")
        return N === "use-credentials" ? N : "";
    }
    function nn(P) {
      return P === null ? "`null`" : P === void 0 ? "`undefined`" : P === "" ? "an empty string" : 'something with type "' + typeof P + '"';
    }
    function be(P) {
      return P === null ? "`null`" : P === void 0 ? "`undefined`" : P === "" ? "an empty string" : typeof P == "string" ? JSON.stringify(P) : typeof P == "number" ? "`" + P + "`" : 'something with type "' + typeof P + '"';
    }
    function Oe() {
      var P = He.H;
      return P === null && console.error(
        `Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:
1. You might have mismatching versions of React and the renderer (such as React DOM)
2. You might be breaking the Rules of Hooks
3. You might have more than one copy of React in the same app
See https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.`
      ), P;
    }
    typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart == "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
    var Tn = Ms(), Re = {
      d: {
        f: de,
        r: function() {
          throw Error(
            "Invalid form element. requestFormReset must be passed a form that was rendered by React."
          );
        },
        D: de,
        C: de,
        L: de,
        m: de,
        X: de,
        S: de,
        M: de
      },
      p: 0,
      findDOMNode: null
    }, ie = /* @__PURE__ */ Symbol.for("react.portal"), He = Tn.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    typeof Map == "function" && Map.prototype != null && typeof Map.prototype.forEach == "function" && typeof Set == "function" && Set.prototype != null && typeof Set.prototype.clear == "function" && typeof Set.prototype.forEach == "function" || console.error(
      "React depends on Map and Set built-in types. Make sure that you load a polyfill in older browsers. https://reactjs.org/link/react-polyfills"
    ), ia.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = Re, ia.createPortal = function(P, N) {
      var Pe = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
      if (!N || N.nodeType !== 1 && N.nodeType !== 9 && N.nodeType !== 11)
        throw Error("Target container is not a DOM element.");
      return W(P, N, null, Pe);
    }, ia.flushSync = function(P) {
      var N = He.T, Pe = Re.p;
      try {
        if (He.T = null, Re.p = 2, P)
          return P();
      } finally {
        He.T = N, Re.p = Pe, Re.d.f() && console.error(
          "flushSync was called from inside a lifecycle method. React cannot flush when React is already rendering. Consider moving this call to a scheduler task or micro task."
        );
      }
    }, ia.preconnect = function(P, N) {
      typeof P == "string" && P ? N != null && typeof N != "object" ? console.error(
        "ReactDOM.preconnect(): Expected the `options` argument (second) to be an object but encountered %s instead. The only supported option at this time is `crossOrigin` which accepts a string.",
        be(N)
      ) : N != null && typeof N.crossOrigin != "string" && console.error(
        "ReactDOM.preconnect(): Expected the `crossOrigin` option (second argument) to be a string but encountered %s instead. Try removing this option or passing a string value instead.",
        nn(N.crossOrigin)
      ) : console.error(
        "ReactDOM.preconnect(): Expected the `href` argument (first) to be a non-empty string but encountered %s instead.",
        nn(P)
      ), typeof P == "string" && (N ? (N = N.crossOrigin, N = typeof N == "string" ? N === "use-credentials" ? N : "" : void 0) : N = null, Re.d.C(P, N));
    }, ia.prefetchDNS = function(P) {
      if (typeof P != "string" || !P)
        console.error(
          "ReactDOM.prefetchDNS(): Expected the `href` argument (first) to be a non-empty string but encountered %s instead.",
          nn(P)
        );
      else if (1 < arguments.length) {
        var N = arguments[1];
        typeof N == "object" && N.hasOwnProperty("crossOrigin") ? console.error(
          "ReactDOM.prefetchDNS(): Expected only one argument, `href`, but encountered %s as a second argument instead. This argument is reserved for future options and is currently disallowed. It looks like the you are attempting to set a crossOrigin property for this DNS lookup hint. Browsers do not perform DNS queries using CORS and setting this attribute on the resource hint has no effect. Try calling ReactDOM.prefetchDNS() with just a single string argument, `href`.",
          be(N)
        ) : console.error(
          "ReactDOM.prefetchDNS(): Expected only one argument, `href`, but encountered %s as a second argument instead. This argument is reserved for future options and is currently disallowed. Try calling ReactDOM.prefetchDNS() with just a single string argument, `href`.",
          be(N)
        );
      }
      typeof P == "string" && Re.d.D(P);
    }, ia.preinit = function(P, N) {
      if (typeof P == "string" && P ? N == null || typeof N != "object" ? console.error(
        "ReactDOM.preinit(): Expected the `options` argument (second) to be an object with an `as` property describing the type of resource to be preinitialized but encountered %s instead.",
        be(N)
      ) : N.as !== "style" && N.as !== "script" && console.error(
        'ReactDOM.preinit(): Expected the `as` property in the `options` argument (second) to contain a valid value describing the type of resource to be preinitialized but encountered %s instead. Valid values for `as` are "style" and "script".',
        be(N.as)
      ) : console.error(
        "ReactDOM.preinit(): Expected the `href` argument (first) to be a non-empty string but encountered %s instead.",
        nn(P)
      ), typeof P == "string" && N && typeof N.as == "string") {
        var Pe = N.as, ee = ke(Pe, N.crossOrigin), X = typeof N.integrity == "string" ? N.integrity : void 0, ft = typeof N.fetchPriority == "string" ? N.fetchPriority : void 0;
        Pe === "style" ? Re.d.S(
          P,
          typeof N.precedence == "string" ? N.precedence : void 0,
          {
            crossOrigin: ee,
            integrity: X,
            fetchPriority: ft
          }
        ) : Pe === "script" && Re.d.X(P, {
          crossOrigin: ee,
          integrity: X,
          fetchPriority: ft,
          nonce: typeof N.nonce == "string" ? N.nonce : void 0
        });
      }
    }, ia.preinitModule = function(P, N) {
      var Pe = "";
      typeof P == "string" && P || (Pe += " The `href` argument encountered was " + nn(P) + "."), N !== void 0 && typeof N != "object" ? Pe += " The `options` argument encountered was " + nn(N) + "." : N && "as" in N && N.as !== "script" && (Pe += " The `as` option encountered was " + be(N.as) + "."), Pe ? console.error(
        "ReactDOM.preinitModule(): Expected up to two arguments, a non-empty `href` string and, optionally, an `options` object with a valid `as` property.%s",
        Pe
      ) : (Pe = N && typeof N.as == "string" ? N.as : "script", Pe) === "script" || (Pe = be(Pe), console.error(
        'ReactDOM.preinitModule(): Currently the only supported "as" type for this function is "script" but received "%s" instead. This warning was generated for `href` "%s". In the future other module types will be supported, aligning with the import-attributes proposal. Learn more here: (https://github.com/tc39/proposal-import-attributes)',
        Pe,
        P
      )), typeof P == "string" && (typeof N == "object" && N !== null ? (N.as == null || N.as === "script") && (Pe = ke(
        N.as,
        N.crossOrigin
      ), Re.d.M(P, {
        crossOrigin: Pe,
        integrity: typeof N.integrity == "string" ? N.integrity : void 0,
        nonce: typeof N.nonce == "string" ? N.nonce : void 0
      })) : N == null && Re.d.M(P));
    }, ia.preload = function(P, N) {
      var Pe = "";
      if (typeof P == "string" && P || (Pe += " The `href` argument encountered was " + nn(P) + "."), N == null || typeof N != "object" ? Pe += " The `options` argument encountered was " + nn(N) + "." : typeof N.as == "string" && N.as || (Pe += " The `as` option encountered was " + nn(N.as) + "."), Pe && console.error(
        'ReactDOM.preload(): Expected two arguments, a non-empty `href` string and an `options` object with an `as` property valid for a `<link rel="preload" as="..." />` tag.%s',
        Pe
      ), typeof P == "string" && typeof N == "object" && N !== null && typeof N.as == "string") {
        Pe = N.as;
        var ee = ke(
          Pe,
          N.crossOrigin
        );
        Re.d.L(P, Pe, {
          crossOrigin: ee,
          integrity: typeof N.integrity == "string" ? N.integrity : void 0,
          nonce: typeof N.nonce == "string" ? N.nonce : void 0,
          type: typeof N.type == "string" ? N.type : void 0,
          fetchPriority: typeof N.fetchPriority == "string" ? N.fetchPriority : void 0,
          referrerPolicy: typeof N.referrerPolicy == "string" ? N.referrerPolicy : void 0,
          imageSrcSet: typeof N.imageSrcSet == "string" ? N.imageSrcSet : void 0,
          imageSizes: typeof N.imageSizes == "string" ? N.imageSizes : void 0,
          media: typeof N.media == "string" ? N.media : void 0
        });
      }
    }, ia.preloadModule = function(P, N) {
      var Pe = "";
      typeof P == "string" && P || (Pe += " The `href` argument encountered was " + nn(P) + "."), N !== void 0 && typeof N != "object" ? Pe += " The `options` argument encountered was " + nn(N) + "." : N && "as" in N && typeof N.as != "string" && (Pe += " The `as` option encountered was " + nn(N.as) + "."), Pe && console.error(
        'ReactDOM.preloadModule(): Expected two arguments, a non-empty `href` string and, optionally, an `options` object with an `as` property valid for a `<link rel="modulepreload" as="..." />` tag.%s',
        Pe
      ), typeof P == "string" && (N ? (Pe = ke(
        N.as,
        N.crossOrigin
      ), Re.d.m(P, {
        as: typeof N.as == "string" && N.as !== "script" ? N.as : void 0,
        crossOrigin: Pe,
        integrity: typeof N.integrity == "string" ? N.integrity : void 0
      })) : Re.d.m(P));
    }, ia.requestFormReset = function(P) {
      Re.d.r(P);
    }, ia.unstable_batchedUpdates = function(P, N) {
      return P(N);
    }, ia.useFormState = function(P, N, Pe) {
      return Oe().useFormState(P, N, Pe);
    }, ia.useFormStatus = function() {
      return Oe().useHostTransitionStatus();
    }, ia.version = "19.2.6", typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop == "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
  })()), ia;
}
var Wf;
function yf() {
  if (Wf) return gf.exports;
  Wf = 1;
  function de() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function")) {
      if (process.env.NODE_ENV !== "production")
        throw new Error("^_^");
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(de);
      } catch (ue) {
        console.error(ue);
      }
    }
  }
  return process.env.NODE_ENV === "production" ? (de(), gf.exports = rh()) : gf.exports = lh(), gf.exports;
}
var Yf;
function ih() {
  if (Yf) return rf;
  Yf = 1;
  var de = Ms(), ue = yf();
  function W(i) {
    var o = "https://react.dev/errors/" + i;
    if (1 < arguments.length) {
      o += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var f = 2; f < arguments.length; f++)
        o += "&args[]=" + encodeURIComponent(arguments[f]);
    }
    return "Minified React error #" + i + "; visit " + o + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  var ke = /* @__PURE__ */ Symbol.for("react.transitional.element"), nn = /* @__PURE__ */ Symbol.for("react.portal"), be = /* @__PURE__ */ Symbol.for("react.fragment"), Oe = /* @__PURE__ */ Symbol.for("react.strict_mode"), Tn = /* @__PURE__ */ Symbol.for("react.profiler"), Re = /* @__PURE__ */ Symbol.for("react.consumer"), ie = /* @__PURE__ */ Symbol.for("react.context"), He = /* @__PURE__ */ Symbol.for("react.forward_ref"), P = /* @__PURE__ */ Symbol.for("react.suspense"), N = /* @__PURE__ */ Symbol.for("react.suspense_list"), Pe = /* @__PURE__ */ Symbol.for("react.memo"), ee = /* @__PURE__ */ Symbol.for("react.lazy"), X = /* @__PURE__ */ Symbol.for("react.scope"), ft = /* @__PURE__ */ Symbol.for("react.activity"), tr = /* @__PURE__ */ Symbol.for("react.legacy_hidden"), Yt = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), Gl = /* @__PURE__ */ Symbol.for("react.view_transition"), Hr = Symbol.iterator;
  function Vn(i) {
    return i === null || typeof i != "object" ? null : (i = Hr && i[Hr] || i["@@iterator"], typeof i == "function" ? i : null);
  }
  var Ie = Array.isArray;
  function Ve(i, o) {
    var f = i.length & 3, g = i.length - f, p = o;
    for (o = 0; o < g; ) {
      var m = i.charCodeAt(o) & 255 | (i.charCodeAt(++o) & 255) << 8 | (i.charCodeAt(++o) & 255) << 16 | (i.charCodeAt(++o) & 255) << 24;
      ++o, m = 3432918353 * (m & 65535) + ((3432918353 * (m >>> 16) & 65535) << 16) & 4294967295, m = m << 15 | m >>> 17, m = 461845907 * (m & 65535) + ((461845907 * (m >>> 16) & 65535) << 16) & 4294967295, p ^= m, p = p << 13 | p >>> 19, p = 5 * (p & 65535) + ((5 * (p >>> 16) & 65535) << 16) & 4294967295, p = (p & 65535) + 27492 + (((p >>> 16) + 58964 & 65535) << 16);
    }
    switch (m = 0, f) {
      case 3:
        m ^= (i.charCodeAt(o + 2) & 255) << 16;
      case 2:
        m ^= (i.charCodeAt(o + 1) & 255) << 8;
      case 1:
        m ^= i.charCodeAt(o) & 255, m = 3432918353 * (m & 65535) + ((3432918353 * (m >>> 16) & 65535) << 16) & 4294967295, m = m << 15 | m >>> 17, p ^= 461845907 * (m & 65535) + ((461845907 * (m >>> 16) & 65535) << 16) & 4294967295;
    }
    return p ^= i.length, p ^= p >>> 16, p = 2246822507 * (p & 65535) + ((2246822507 * (p >>> 16) & 65535) << 16) & 4294967295, p ^= p >>> 13, p = 3266489909 * (p & 65535) + ((3266489909 * (p >>> 16) & 65535) << 16) & 4294967295, (p ^ p >>> 16) >>> 0;
  }
  var Et = Object.assign, rn = Object.prototype.hasOwnProperty, Kn = RegExp(
    "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
  ), si = {}, Ln = {};
  function qr(i) {
    return rn.call(Ln, i) ? !0 : rn.call(si, i) ? !1 : Kn.test(i) ? Ln[i] = !0 : (si[i] = !0, !1);
  }
  var nt = new Set(
    "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
      " "
    )
  ), Ae = /* @__PURE__ */ new Map([
    ["acceptCharset", "accept-charset"],
    ["htmlFor", "for"],
    ["httpEquiv", "http-equiv"],
    ["crossOrigin", "crossorigin"],
    ["accentHeight", "accent-height"],
    ["alignmentBaseline", "alignment-baseline"],
    ["arabicForm", "arabic-form"],
    ["baselineShift", "baseline-shift"],
    ["capHeight", "cap-height"],
    ["clipPath", "clip-path"],
    ["clipRule", "clip-rule"],
    ["colorInterpolation", "color-interpolation"],
    ["colorInterpolationFilters", "color-interpolation-filters"],
    ["colorProfile", "color-profile"],
    ["colorRendering", "color-rendering"],
    ["dominantBaseline", "dominant-baseline"],
    ["enableBackground", "enable-background"],
    ["fillOpacity", "fill-opacity"],
    ["fillRule", "fill-rule"],
    ["floodColor", "flood-color"],
    ["floodOpacity", "flood-opacity"],
    ["fontFamily", "font-family"],
    ["fontSize", "font-size"],
    ["fontSizeAdjust", "font-size-adjust"],
    ["fontStretch", "font-stretch"],
    ["fontStyle", "font-style"],
    ["fontVariant", "font-variant"],
    ["fontWeight", "font-weight"],
    ["glyphName", "glyph-name"],
    ["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
    ["glyphOrientationVertical", "glyph-orientation-vertical"],
    ["horizAdvX", "horiz-adv-x"],
    ["horizOriginX", "horiz-origin-x"],
    ["imageRendering", "image-rendering"],
    ["letterSpacing", "letter-spacing"],
    ["lightingColor", "lighting-color"],
    ["markerEnd", "marker-end"],
    ["markerMid", "marker-mid"],
    ["markerStart", "marker-start"],
    ["overlinePosition", "overline-position"],
    ["overlineThickness", "overline-thickness"],
    ["paintOrder", "paint-order"],
    ["panose-1", "panose-1"],
    ["pointerEvents", "pointer-events"],
    ["renderingIntent", "rendering-intent"],
    ["shapeRendering", "shape-rendering"],
    ["stopColor", "stop-color"],
    ["stopOpacity", "stop-opacity"],
    ["strikethroughPosition", "strikethrough-position"],
    ["strikethroughThickness", "strikethrough-thickness"],
    ["strokeDasharray", "stroke-dasharray"],
    ["strokeDashoffset", "stroke-dashoffset"],
    ["strokeLinecap", "stroke-linecap"],
    ["strokeLinejoin", "stroke-linejoin"],
    ["strokeMiterlimit", "stroke-miterlimit"],
    ["strokeOpacity", "stroke-opacity"],
    ["strokeWidth", "stroke-width"],
    ["textAnchor", "text-anchor"],
    ["textDecoration", "text-decoration"],
    ["textRendering", "text-rendering"],
    ["transformOrigin", "transform-origin"],
    ["underlinePosition", "underline-position"],
    ["underlineThickness", "underline-thickness"],
    ["unicodeBidi", "unicode-bidi"],
    ["unicodeRange", "unicode-range"],
    ["unitsPerEm", "units-per-em"],
    ["vAlphabetic", "v-alphabetic"],
    ["vHanging", "v-hanging"],
    ["vIdeographic", "v-ideographic"],
    ["vMathematical", "v-mathematical"],
    ["vectorEffect", "vector-effect"],
    ["vertAdvY", "vert-adv-y"],
    ["vertOriginX", "vert-origin-x"],
    ["vertOriginY", "vert-origin-y"],
    ["wordSpacing", "word-spacing"],
    ["writingMode", "writing-mode"],
    ["xmlnsXlink", "xmlns:xlink"],
    ["xHeight", "x-height"]
  ]), J = /["'&<>]/;
  function he(i) {
    if (typeof i == "boolean" || typeof i == "number" || typeof i == "bigint")
      return "" + i;
    i = "" + i;
    var o = J.exec(i);
    if (o) {
      var f = "", g, p = 0;
      for (g = o.index; g < i.length; g++) {
        switch (i.charCodeAt(g)) {
          case 34:
            o = "&quot;";
            break;
          case 38:
            o = "&amp;";
            break;
          case 39:
            o = "&#x27;";
            break;
          case 60:
            o = "&lt;";
            break;
          case 62:
            o = "&gt;";
            break;
          default:
            continue;
        }
        p !== g && (f += i.slice(p, g)), p = g + 1, f += o;
      }
      i = p !== g ? f + i.slice(p, g) : f;
    }
    return i;
  }
  var Tr = /([A-Z])/g, vl = /^ms-/, fe = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function T(i) {
    return fe.test("" + i) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : i;
  }
  var Y = de.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, we = ue.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Te = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, me = we.d;
  we.d = {
    f: me.f,
    r: me.r,
    D: Vl,
    C: sr,
    L: Ba,
    m: Wc,
    X: ns,
    S: Er,
    M: ku
  };
  var Be = [], Se = null, Rt = /(<\/|<)(s)(cript)/gi;
  function Rn(i, o, f, g) {
    return "" + o + (f === "s" ? "\\u0073" : "\\u0053") + g;
  }
  function tt(i, o, f, g, p) {
    return {
      idPrefix: i === void 0 ? "" : i,
      nextFormID: 0,
      streamingFormat: 0,
      bootstrapScriptContent: f,
      bootstrapScripts: g,
      bootstrapModules: p,
      instructions: 0,
      hasBody: !1,
      hasHtml: !1,
      unknownResources: {},
      dnsResources: {},
      connectResources: { default: {}, anonymous: {}, credentials: {} },
      imageResources: {},
      styleResources: {},
      scriptResources: {},
      moduleUnknownResources: {},
      moduleScriptResources: {}
    };
  }
  function Ct(i, o, f, g) {
    return {
      insertionMode: i,
      selectedValue: o,
      tagScope: f,
      viewTransition: g
    };
  }
  function Da(i, o, f) {
    var g = i.tagScope & -25;
    switch (o) {
      case "noscript":
        return Ct(2, null, g | 1, null);
      case "select":
        return Ct(
          2,
          f.value != null ? f.value : f.defaultValue,
          g,
          null
        );
      case "svg":
        return Ct(4, null, g, null);
      case "picture":
        return Ct(2, null, g | 2, null);
      case "math":
        return Ct(5, null, g, null);
      case "foreignObject":
        return Ct(2, null, g, null);
      case "table":
        return Ct(6, null, g, null);
      case "thead":
      case "tbody":
      case "tfoot":
        return Ct(7, null, g, null);
      case "colgroup":
        return Ct(9, null, g, null);
      case "tr":
        return Ct(8, null, g, null);
      case "head":
        if (2 > i.insertionMode)
          return Ct(3, null, g, null);
        break;
      case "html":
        if (i.insertionMode === 0)
          return Ct(1, null, g, null);
    }
    return 6 <= i.insertionMode || 2 > i.insertionMode ? Ct(2, null, g, null) : i.tagScope !== g ? Ct(
      i.insertionMode,
      i.selectedValue,
      g,
      null
    ) : i;
  }
  function Ge(i) {
    return i === null ? null : {
      update: i.update,
      enter: "none",
      exit: "none",
      share: i.update,
      name: i.autoName,
      autoName: i.autoName,
      nameIdx: 0
    };
  }
  function mt(i, o) {
    return o.tagScope & 32 && (i.instructions |= 128), Ct(
      o.insertionMode,
      o.selectedValue,
      o.tagScope | 12,
      Ge(o.viewTransition)
    );
  }
  function xn(i, o) {
    i = Ge(o.viewTransition);
    var f = o.tagScope | 16;
    return i !== null && i.share !== "none" && (f |= 64), Ct(
      o.insertionMode,
      o.selectedValue,
      f,
      i
    );
  }
  var St = /* @__PURE__ */ new Map();
  function Gt(i, o) {
    if (typeof o != "object") throw Error(W(62));
    var f = !0, g;
    for (g in o)
      if (rn.call(o, g)) {
        var p = o[g];
        if (p != null && typeof p != "boolean" && p !== "") {
          if (g.indexOf("--") === 0) {
            var m = he(g);
            p = he(("" + p).trim());
          } else
            m = St.get(g), m === void 0 && (m = he(
              g.replace(Tr, "-$1").toLowerCase().replace(vl, "-ms-")
            ), St.set(g, m)), p = typeof p == "number" ? p === 0 || nt.has(g) ? "" + p : p + "px" : he(("" + p).trim());
          f ? (f = !1, i.push(' style="', m, ":", p)) : i.push(";", m, ":", p);
        }
      }
    f || i.push('"');
  }
  function Xl(i, o, f) {
    f && typeof f != "function" && typeof f != "symbol" && i.push(" ", o, '=""');
  }
  function Xt(i, o, f) {
    typeof f != "function" && typeof f != "symbol" && typeof f != "boolean" && i.push(" ", o, '="', he(f), '"');
  }
  var De = he(
    "javascript:throw new Error('React form unexpectedly submitted.')"
  );
  function xr(i, o) {
    this.push('<input type="hidden"'), At(i), Xt(this, "name", o), Xt(this, "value", i), this.push("/>");
  }
  function At(i) {
    if (typeof i != "string") throw Error(W(480));
  }
  function $r(i, o) {
    if (typeof o.$$FORM_ACTION == "function") {
      var f = i.nextFormID++;
      i = i.idPrefix + f;
      try {
        var g = o.$$FORM_ACTION(i);
        if (g) {
          var p = g.data;
          p?.forEach(At);
        }
        return g;
      } catch (m) {
        if (typeof m == "object" && m !== null && typeof m.then == "function")
          throw m;
      }
    }
    return null;
  }
  function Na(i, o, f, g, p, m, A, Q) {
    var I = null;
    if (typeof g == "function") {
      var G = $r(o, g);
      G !== null ? (Q = G.name, g = G.action || "", p = G.encType, m = G.method, A = G.target, I = G.data) : (i.push(" ", "formAction", '="', De, '"'), A = m = p = g = Q = null, rc(o, f));
    }
    return Q != null && vn(i, "name", Q), g != null && vn(i, "formAction", g), p != null && vn(i, "formEncType", p), m != null && vn(i, "formMethod", m), A != null && vn(i, "formTarget", A), I;
  }
  function vn(i, o, f) {
    switch (o) {
      case "className":
        Xt(i, "class", f);
        break;
      case "tabIndex":
        Xt(i, "tabindex", f);
        break;
      case "dir":
      case "role":
      case "viewBox":
      case "width":
      case "height":
        Xt(i, o, f);
        break;
      case "style":
        Gt(i, f);
        break;
      case "src":
      case "href":
        if (f === "") break;
      case "action":
      case "formAction":
        if (f == null || typeof f == "function" || typeof f == "symbol" || typeof f == "boolean")
          break;
        f = T("" + f), i.push(" ", o, '="', he(f), '"');
        break;
      case "defaultValue":
      case "defaultChecked":
      case "innerHTML":
      case "suppressContentEditableWarning":
      case "suppressHydrationWarning":
      case "ref":
        break;
      case "autoFocus":
      case "multiple":
      case "muted":
        Xl(i, o.toLowerCase(), f);
        break;
      case "xlinkHref":
        if (typeof f == "function" || typeof f == "symbol" || typeof f == "boolean")
          break;
        f = T("" + f), i.push(" ", "xlink:href", '="', he(f), '"');
        break;
      case "contentEditable":
      case "spellCheck":
      case "draggable":
      case "value":
      case "autoReverse":
      case "externalResourcesRequired":
      case "focusable":
      case "preserveAlpha":
        typeof f != "function" && typeof f != "symbol" && i.push(" ", o, '="', he(f), '"');
        break;
      case "inert":
      case "allowFullScreen":
      case "async":
      case "autoPlay":
      case "controls":
      case "default":
      case "defer":
      case "disabled":
      case "disablePictureInPicture":
      case "disableRemotePlayback":
      case "formNoValidate":
      case "hidden":
      case "loop":
      case "noModule":
      case "noValidate":
      case "open":
      case "playsInline":
      case "readOnly":
      case "required":
      case "reversed":
      case "scoped":
      case "seamless":
      case "itemScope":
        f && typeof f != "function" && typeof f != "symbol" && i.push(" ", o, '=""');
        break;
      case "capture":
      case "download":
        f === !0 ? i.push(" ", o, '=""') : f !== !1 && typeof f != "function" && typeof f != "symbol" && i.push(" ", o, '="', he(f), '"');
        break;
      case "cols":
      case "rows":
      case "size":
      case "span":
        typeof f != "function" && typeof f != "symbol" && !isNaN(f) && 1 <= f && i.push(" ", o, '="', he(f), '"');
        break;
      case "rowSpan":
      case "start":
        typeof f == "function" || typeof f == "symbol" || isNaN(f) || i.push(" ", o, '="', he(f), '"');
        break;
      case "xlinkActuate":
        Xt(i, "xlink:actuate", f);
        break;
      case "xlinkArcrole":
        Xt(i, "xlink:arcrole", f);
        break;
      case "xlinkRole":
        Xt(i, "xlink:role", f);
        break;
      case "xlinkShow":
        Xt(i, "xlink:show", f);
        break;
      case "xlinkTitle":
        Xt(i, "xlink:title", f);
        break;
      case "xlinkType":
        Xt(i, "xlink:type", f);
        break;
      case "xmlBase":
        Xt(i, "xml:base", f);
        break;
      case "xmlLang":
        Xt(i, "xml:lang", f);
        break;
      case "xmlSpace":
        Xt(i, "xml:space", f);
        break;
      default:
        if ((!(2 < o.length) || o[0] !== "o" && o[0] !== "O" || o[1] !== "n" && o[1] !== "N") && (o = Ae.get(o) || o, qr(o))) {
          switch (typeof f) {
            case "function":
            case "symbol":
              return;
            case "boolean":
              var g = o.toLowerCase().slice(0, 5);
              if (g !== "data-" && g !== "aria-") return;
          }
          i.push(" ", o, '="', he(f), '"');
        }
    }
  }
  function rr(i, o, f) {
    if (o != null) {
      if (f != null) throw Error(W(60));
      if (typeof o != "object" || !("__html" in o))
        throw Error(W(61));
      o = o.__html, o != null && i.push("" + o);
    }
  }
  function Bn(i) {
    var o = "";
    return de.Children.forEach(i, function(f) {
      f != null && (o += f);
    }), o;
  }
  function rc(i, o) {
    if ((i.instructions & 16) === 0) {
      i.instructions |= 16;
      var f = o.preamble, g = o.bootstrapChunks;
      (f.htmlChunks || f.headChunks) && g.length === 0 ? (g.push(o.startInlineScript), oc(g, i), g.push(
        ">",
        `addEventListener("submit",function(a){if(!a.defaultPrevented){var c=a.target,d=a.submitter,e=c.action,b=d;if(d){var f=d.getAttribute("formAction");null!=f&&(e=f,b=null)}"javascript:throw new Error('React form unexpectedly submitted.')"===e&&(a.preventDefault(),b?(a=document.createElement("input"),a.name=b.name,a.value=b.value,b.parentNode.insertBefore(a,b),b=new FormData(c),a.parentNode.removeChild(a)):b=new FormData(c),a=c.ownerDocument||c,(a.$$reactFormReplay=a.$$reactFormReplay||[]).push(c,d,b))}});`,
        "<\/script>"
      )) : g.unshift(
        o.startInlineScript,
        ">",
        `addEventListener("submit",function(a){if(!a.defaultPrevented){var c=a.target,d=a.submitter,e=c.action,b=d;if(d){var f=d.getAttribute("formAction");null!=f&&(e=f,b=null)}"javascript:throw new Error('React form unexpectedly submitted.')"===e&&(a.preventDefault(),b?(a=document.createElement("input"),a.name=b.name,a.value=b.value,b.parentNode.insertBefore(a,b),b=new FormData(c),a.parentNode.removeChild(a)):b=new FormData(c),a=c.ownerDocument||c,(a.$$reactFormReplay=a.$$reactFormReplay||[]).push(c,d,b))}});`,
        "<\/script>"
      );
    }
  }
  function ht(i, o) {
    i.push(L("link"));
    for (var f in o)
      if (rn.call(o, f)) {
        var g = o[f];
        if (g != null)
          switch (f) {
            case "children":
            case "dangerouslySetInnerHTML":
              throw Error(W(399, "link"));
            default:
              vn(i, f, g);
          }
      }
    return i.push("/>"), null;
  }
  var To = /(<\/|<)(s)(tyle)/gi;
  function xo(i, o, f, g) {
    return "" + o + (f === "s" ? "\\73 " : "\\53 ") + g;
  }
  function el(i, o, f) {
    i.push(L(f));
    for (var g in o)
      if (rn.call(o, g)) {
        var p = o[g];
        if (p != null)
          switch (g) {
            case "children":
            case "dangerouslySetInnerHTML":
              throw Error(W(399, f));
            default:
              vn(i, g, p);
          }
      }
    return i.push("/>"), null;
  }
  function aa(i, o) {
    i.push(L("title"));
    var f = null, g = null, p;
    for (p in o)
      if (rn.call(o, p)) {
        var m = o[p];
        if (m != null)
          switch (p) {
            case "children":
              f = m;
              break;
            case "dangerouslySetInnerHTML":
              g = m;
              break;
            default:
              vn(i, p, m);
          }
      }
    return i.push(">"), o = Array.isArray(f) ? 2 > f.length ? f[0] : null : f, typeof o != "function" && typeof o != "symbol" && o !== null && o !== void 0 && i.push(he("" + o)), rr(i, g, f), i.push(Fe("title")), null;
  }
  function fi(i, o) {
    i.push(L("script"));
    var f = null, g = null, p;
    for (p in o)
      if (rn.call(o, p)) {
        var m = o[p];
        if (m != null)
          switch (p) {
            case "children":
              f = m;
              break;
            case "dangerouslySetInnerHTML":
              g = m;
              break;
            default:
              vn(i, p, m);
          }
      }
    return i.push(">"), rr(i, g, f), typeof f == "string" && i.push(("" + f).replace(Rt, Rn)), i.push(Fe("script")), null;
  }
  function Zl(i, o, f) {
    i.push(L(f));
    var g = f = null, p;
    for (p in o)
      if (rn.call(o, p)) {
        var m = o[p];
        if (m != null)
          switch (p) {
            case "children":
              f = m;
              break;
            case "dangerouslySetInnerHTML":
              g = m;
              break;
            default:
              vn(i, p, m);
          }
      }
    return i.push(">"), rr(i, g, f), f;
  }
  function Ql(i, o, f) {
    i.push(L(f));
    var g = f = null, p;
    for (p in o)
      if (rn.call(o, p)) {
        var m = o[p];
        if (m != null)
          switch (p) {
            case "children":
              f = m;
              break;
            case "dangerouslySetInnerHTML":
              g = m;
              break;
            default:
              vn(i, p, m);
          }
      }
    return i.push(">"), rr(i, g, f), typeof f == "string" ? (i.push(he(f)), null) : f;
  }
  var yl = /^[a-zA-Z][a-zA-Z:_\.\-\d]*$/, R = /* @__PURE__ */ new Map();
  function L(i) {
    var o = R.get(i);
    if (o === void 0) {
      if (!yl.test(i))
        throw Error(W(65, i));
      o = "<" + i, R.set(i, o);
    }
    return o;
  }
  function ne(i, o, f, g, p, m, A, Q, I) {
    switch (o) {
      case "div":
      case "span":
      case "svg":
      case "path":
        break;
      case "a":
        i.push(L("a"));
        var G = null, re = null, $;
        for ($ in f)
          if (rn.call(f, $)) {
            var ve = f[$];
            if (ve != null)
              switch ($) {
                case "children":
                  G = ve;
                  break;
                case "dangerouslySetInnerHTML":
                  re = ve;
                  break;
                case "href":
                  ve === "" ? Xt(i, "href", "") : vn(i, $, ve);
                  break;
                default:
                  vn(i, $, ve);
              }
          }
        if (i.push(">"), rr(i, re, G), typeof G == "string") {
          i.push(he(G));
          var Ne = null;
        } else Ne = G;
        return Ne;
      case "g":
      case "p":
      case "li":
        break;
      case "select":
        i.push(L("select"));
        var on = null, Ze = null, ze;
        for (ze in f)
          if (rn.call(f, ze)) {
            var je = f[ze];
            if (je != null)
              switch (ze) {
                case "children":
                  on = je;
                  break;
                case "dangerouslySetInnerHTML":
                  Ze = je;
                  break;
                case "defaultValue":
                case "value":
                  break;
                default:
                  vn(
                    i,
                    ze,
                    je
                  );
              }
          }
        return i.push(">"), rr(i, Ze, on), on;
      case "option":
        var Xe = Q.selectedValue;
        i.push(L("option"));
        var at = null, cn = null, wn = null, Mn = null, en;
        for (en in f)
          if (rn.call(f, en)) {
            var vt = f[en];
            if (vt != null)
              switch (en) {
                case "children":
                  at = vt;
                  break;
                case "selected":
                  wn = vt;
                  break;
                case "dangerouslySetInnerHTML":
                  Mn = vt;
                  break;
                case "value":
                  cn = vt;
                default:
                  vn(
                    i,
                    en,
                    vt
                  );
              }
          }
        if (Xe != null) {
          var Sn = cn !== null ? "" + cn : Bn(at);
          if (Ie(Xe)) {
            for (var Rr = 0; Rr < Xe.length; Rr++)
              if ("" + Xe[Rr] === Sn) {
                i.push(' selected=""');
                break;
              }
          } else
            "" + Xe === Sn && i.push(' selected=""');
        } else wn && i.push(' selected=""');
        return i.push(">"), rr(i, Mn, at), at;
      case "textarea":
        i.push(L("textarea"));
        var Dn = null, En = null, An = null, qe;
        for (qe in f)
          if (rn.call(f, qe)) {
            var Pn = f[qe];
            if (Pn != null)
              switch (qe) {
                case "children":
                  An = Pn;
                  break;
                case "value":
                  Dn = Pn;
                  break;
                case "defaultValue":
                  En = Pn;
                  break;
                case "dangerouslySetInnerHTML":
                  throw Error(W(91));
                default:
                  vn(
                    i,
                    qe,
                    Pn
                  );
              }
          }
        if (Dn === null && En !== null && (Dn = En), i.push(">"), An != null) {
          if (Dn != null) throw Error(W(92));
          if (Ie(An)) {
            if (1 < An.length)
              throw Error(W(93));
            Dn = "" + An[0];
          }
          Dn = "" + An;
        }
        return typeof Dn == "string" && Dn[0] === `
` && i.push(`
`), Dn !== null && i.push(he("" + Dn)), null;
      case "input":
        i.push(L("input"));
        var qt = null, sn = null, wa = null, Zi = null, Cr = null, Al = null, Pl = null, Fl = null, Ei = null, Qi;
        for (Qi in f)
          if (rn.call(f, Qi)) {
            var Jt = f[Qi];
            if (Jt != null)
              switch (Qi) {
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(W(399, "input"));
                case "name":
                  qt = Jt;
                  break;
                case "formAction":
                  sn = Jt;
                  break;
                case "formEncType":
                  wa = Jt;
                  break;
                case "formMethod":
                  Zi = Jt;
                  break;
                case "formTarget":
                  Cr = Jt;
                  break;
                case "defaultChecked":
                  Ei = Jt;
                  break;
                case "defaultValue":
                  Pl = Jt;
                  break;
                case "checked":
                  Fl = Jt;
                  break;
                case "value":
                  Al = Jt;
                  break;
                default:
                  vn(
                    i,
                    Qi,
                    Jt
                  );
              }
          }
        var Va = Na(
          i,
          g,
          p,
          sn,
          wa,
          Zi,
          Cr,
          qt
        );
        return Fl !== null ? Xl(i, "checked", Fl) : Ei !== null && Xl(i, "checked", Ei), Al !== null ? vn(i, "value", Al) : Pl !== null && vn(i, "value", Pl), i.push("/>"), Va?.forEach(xr, i), null;
      case "button":
        i.push(L("button"));
        var Ka = null, xc = null, eu = null, No = null, pa = null, mr = null, Ec = null, kr;
        for (kr in f)
          if (rn.call(f, kr)) {
            var Rl = f[kr];
            if (Rl != null)
              switch (kr) {
                case "children":
                  Ka = Rl;
                  break;
                case "dangerouslySetInnerHTML":
                  xc = Rl;
                  break;
                case "name":
                  eu = Rl;
                  break;
                case "formAction":
                  No = Rl;
                  break;
                case "formEncType":
                  pa = Rl;
                  break;
                case "formMethod":
                  mr = Rl;
                  break;
                case "formTarget":
                  Ec = Rl;
                  break;
                default:
                  vn(
                    i,
                    kr,
                    Rl
                  );
              }
          }
        var Ji = Na(
          i,
          g,
          p,
          No,
          pa,
          mr,
          Ec,
          eu
        );
        if (i.push(">"), Ji?.forEach(xr, i), rr(i, xc, Ka), typeof Ka == "string") {
          i.push(he(Ka));
          var Rc = null;
        } else Rc = Ka;
        return Rc;
      case "form":
        i.push(L("form"));
        var Vi = null, nu = null, Lt = null, Cc = null, Ta = null, Lo = null, ja;
        for (ja in f)
          if (rn.call(f, ja)) {
            var Ot = f[ja];
            if (Ot != null)
              switch (ja) {
                case "children":
                  Vi = Ot;
                  break;
                case "dangerouslySetInnerHTML":
                  nu = Ot;
                  break;
                case "action":
                  Lt = Ot;
                  break;
                case "encType":
                  Cc = Ot;
                  break;
                case "method":
                  Ta = Ot;
                  break;
                case "target":
                  Lo = Ot;
                  break;
                default:
                  vn(
                    i,
                    ja,
                    Ot
                  );
              }
          }
        var Cl = null, un = null;
        if (typeof Lt == "function") {
          var Ki = $r(
            g,
            Lt
          );
          Ki !== null ? (Lt = Ki.action || "", Cc = Ki.encType, Ta = Ki.method, Lo = Ki.target, Cl = Ki.data, un = Ki.name) : (i.push(
            " ",
            "action",
            '="',
            De,
            '"'
          ), Lo = Ta = Cc = Lt = null, rc(g, p));
        }
        if (Lt != null && vn(i, "action", Lt), Cc != null && vn(i, "encType", Cc), Ta != null && vn(i, "method", Ta), Lo != null && vn(i, "target", Lo), i.push(">"), un !== null && (i.push('<input type="hidden"'), Xt(i, "name", un), i.push("/>"), Cl?.forEach(xr, i)), rr(i, nu, Vi), typeof Vi == "string") {
          i.push(he(Vi));
          var Bo = null;
        } else Bo = Vi;
        return Bo;
      case "menuitem":
        i.push(L("menuitem"));
        for (var xa in f)
          if (rn.call(f, xa)) {
            var yt = f[xa];
            if (yt != null)
              switch (xa) {
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(W(400));
                default:
                  vn(
                    i,
                    xa,
                    yt
                  );
              }
          }
        return i.push(">"), null;
      case "object":
        i.push(L("object"));
        var Zr = null, Ea = null, qa;
        for (qa in f)
          if (rn.call(f, qa)) {
            var Ol = f[qa];
            if (Ol != null)
              switch (qa) {
                case "children":
                  Zr = Ol;
                  break;
                case "dangerouslySetInnerHTML":
                  Ea = Ol;
                  break;
                case "data":
                  var dr = T("" + Ol);
                  if (dr === "") break;
                  i.push(
                    " ",
                    "data",
                    '="',
                    he(dr),
                    '"'
                  );
                  break;
                default:
                  vn(
                    i,
                    qa,
                    Ol
                  );
              }
          }
        if (i.push(">"), rr(i, Ea, Zr), typeof Zr == "string") {
          i.push(he(Zr));
          var _o = null;
        } else _o = Zr;
        return _o;
      case "title":
        var Sr = Q.tagScope & 1, Bu = Q.tagScope & 4;
        if (Q.insertionMode === 4 || Sr || f.itemProp != null)
          var $a = aa(
            i,
            f
          );
        else
          Bu ? $a = null : (aa(p.hoistableChunks, f), $a = void 0);
        return $a;
      case "link":
        var mc = Q.tagScope & 1, tu = Q.tagScope & 4, ru = f.rel, Ri = f.href, eo = f.precedence;
        if (Q.insertionMode === 4 || mc || f.itemProp != null || typeof ru != "string" || typeof Ri != "string" || Ri === "") {
          ht(i, f);
          var no = null;
        } else if (f.rel === "stylesheet")
          if (typeof eo != "string" || f.disabled != null || f.onLoad || f.onError)
            no = ht(
              i,
              f
            );
          else {
            var Ar = p.styles.get(eo), kc = g.styleResources.hasOwnProperty(Ri) ? g.styleResources[Ri] : void 0;
            if (kc !== null) {
              g.styleResources[Ri] = null, Ar || (Ar = {
                precedence: he(eo),
                rules: [],
                hrefs: [],
                sheets: /* @__PURE__ */ new Map()
              }, p.styles.set(eo, Ar));
              var Sc = {
                state: 0,
                props: Et({}, f, {
                  "data-precedence": f.precedence,
                  precedence: null
                })
              };
              if (kc) {
                kc.length === 2 && Yc(Sc.props, kc);
                var _u = p.preloads.stylesheets.get(Ri);
                _u && 0 < _u.length ? _u.length = 0 : Sc.state = 1;
              }
              Ar.sheets.set(Ri, Sc), A && A.stylesheets.add(Sc);
            } else if (Ar) {
              var zu = Ar.sheets.get(Ri);
              zu && A && A.stylesheets.add(zu);
            }
            I && i.push("<!-- -->"), no = null;
          }
        else
          f.onLoad || f.onError ? no = ht(
            i,
            f
          ) : (I && i.push("<!-- -->"), no = tu ? null : ht(p.hoistableChunks, f));
        return no;
      case "script":
        var lu = Q.tagScope & 1, Hu = f.async;
        if (typeof f.src != "string" || !f.src || !Hu || typeof Hu == "function" || typeof Hu == "symbol" || f.onLoad || f.onError || Q.insertionMode === 4 || lu || f.itemProp != null)
          var Uu = fi(
            i,
            f
          );
        else {
          var Bt = f.src;
          if (f.type === "module")
            var iu = g.moduleScriptResources, Ac = p.preloads.moduleScripts;
          else
            iu = g.scriptResources, Ac = p.preloads.scripts;
          var Pc = iu.hasOwnProperty(Bt) ? iu[Bt] : void 0;
          if (Pc !== null) {
            iu[Bt] = null;
            var au = f;
            if (Pc) {
              Pc.length === 2 && (au = Et({}, f), Yc(au, Pc));
              var Wu = Ac.get(Bt);
              Wu && (Wu.length = 0);
            }
            var ou = [];
            p.scripts.add(ou), fi(ou, au);
          }
          I && i.push("<!-- -->"), Uu = null;
        }
        return Uu;
      case "style":
        var cu = Q.tagScope & 1, Ra = f.precedence, Ml = f.href, cs = f.nonce;
        if (Q.insertionMode === 4 || cu || f.itemProp != null || typeof Ra != "string" || typeof Ml != "string" || Ml === "") {
          i.push(L("style"));
          var to = null, Fc = null, ri;
          for (ri in f)
            if (rn.call(f, ri)) {
              var zo = f[ri];
              if (zo != null)
                switch (ri) {
                  case "children":
                    to = zo;
                    break;
                  case "dangerouslySetInnerHTML":
                    Fc = zo;
                    break;
                  default:
                    vn(
                      i,
                      ri,
                      zo
                    );
                }
            }
          i.push(">");
          var Ca = Array.isArray(to) ? 2 > to.length ? to[0] : null : to;
          typeof Ca != "function" && typeof Ca != "symbol" && Ca !== null && Ca !== void 0 && i.push(("" + Ca).replace(To, xo)), rr(i, Fc, to), i.push(Fe("style"));
          var Oc = null;
        } else {
          var ma = p.styles.get(Ra);
          if ((g.styleResources.hasOwnProperty(Ml) ? g.styleResources[Ml] : void 0) !== null) {
            g.styleResources[Ml] = null, ma || (ma = {
              precedence: he(Ra),
              rules: [],
              hrefs: [],
              sheets: /* @__PURE__ */ new Map()
            }, p.styles.set(Ra, ma));
            var us = p.nonce.style;
            if (!us || us === cs) {
              ma.hrefs.push(he(Ml));
              var ss = ma.rules, li = null, Ho = null, ml;
              for (ml in f)
                if (rn.call(f, ml)) {
                  var ka = f[ml];
                  if (ka != null)
                    switch (ml) {
                      case "children":
                        li = ka;
                        break;
                      case "dangerouslySetInnerHTML":
                        Ho = ka;
                    }
                }
              var ro = Array.isArray(li) ? 2 > li.length ? li[0] : null : li;
              typeof ro != "function" && typeof ro != "symbol" && ro !== null && ro !== void 0 && ss.push(
                ("" + ro).replace(To, xo)
              ), rr(ss, Ho, li);
            }
          }
          ma && A && A.styles.add(ma), I && i.push("<!-- -->"), Oc = void 0;
        }
        return Oc;
      case "meta":
        var Il = Q.tagScope & 1, Yu = Q.tagScope & 4;
        if (Q.insertionMode === 4 || Il || f.itemProp != null)
          var fs = el(
            i,
            f,
            "meta"
          );
        else
          I && i.push("<!-- -->"), fs = Yu ? null : typeof f.charSet == "string" ? el(p.charsetChunks, f, "meta") : f.name === "viewport" ? el(p.viewportChunks, f, "meta") : el(p.hoistableChunks, f, "meta");
        return fs;
      case "listing":
      case "pre":
        i.push(L(o));
        var Uo = null, l = null, a;
        for (a in f)
          if (rn.call(f, a)) {
            var s = f[a];
            if (s != null)
              switch (a) {
                case "children":
                  Uo = s;
                  break;
                case "dangerouslySetInnerHTML":
                  l = s;
                  break;
                default:
                  vn(
                    i,
                    a,
                    s
                  );
              }
          }
        if (i.push(">"), l != null) {
          if (Uo != null) throw Error(W(60));
          if (typeof l != "object" || !("__html" in l))
            throw Error(W(61));
          var v = l.__html;
          v != null && (typeof v == "string" && 0 < v.length && v[0] === `
` ? i.push(`
`, v) : i.push("" + v));
        }
        return typeof Uo == "string" && Uo[0] === `
` && i.push(`
`), Uo;
      case "img":
        var w = Q.tagScope & 3, C = f.src, k = f.srcSet;
        if (!(f.loading === "lazy" || !C && !k || typeof C != "string" && C != null || typeof k != "string" && k != null || f.fetchPriority === "low" || w) && (typeof C != "string" || C[4] !== ":" || C[0] !== "d" && C[0] !== "D" || C[1] !== "a" && C[1] !== "A" || C[2] !== "t" && C[2] !== "T" || C[3] !== "a" && C[3] !== "A") && (typeof k != "string" || k[4] !== ":" || k[0] !== "d" && k[0] !== "D" || k[1] !== "a" && k[1] !== "A" || k[2] !== "t" && k[2] !== "T" || k[3] !== "a" && k[3] !== "A")) {
          A !== null && Q.tagScope & 64 && (A.suspenseyImages = !0);
          var _ = typeof f.sizes == "string" ? f.sizes : void 0, O = k ? k + `
` + (_ || "") : C, z = p.preloads.images, Z = z.get(O);
          if (Z)
            (f.fetchPriority === "high" || 10 > p.highImagePreloads.size) && (z.delete(O), p.highImagePreloads.add(Z));
          else if (!g.imageResources.hasOwnProperty(O)) {
            g.imageResources[O] = Be;
            var K = f.crossOrigin, xe = typeof K == "string" ? K === "use-credentials" ? K : "" : void 0, pe = p.headers, yn;
            pe && 0 < pe.remainingCapacity && typeof f.srcSet != "string" && (f.fetchPriority === "high" || 500 > pe.highImagePreloads.length) && (yn = rt(C, "image", {
              imageSrcSet: f.srcSet,
              imageSizes: f.sizes,
              crossOrigin: xe,
              integrity: f.integrity,
              nonce: f.nonce,
              type: f.type,
              fetchPriority: f.fetchPriority,
              referrerPolicy: f.refererPolicy
            }), 0 <= (pe.remainingCapacity -= yn.length + 2)) ? (p.resets.image[O] = Be, pe.highImagePreloads && (pe.highImagePreloads += ", "), pe.highImagePreloads += yn) : (Z = [], ht(Z, {
              rel: "preload",
              as: "image",
              href: k ? void 0 : C,
              imageSrcSet: k,
              imageSizes: _,
              crossOrigin: xe,
              integrity: f.integrity,
              type: f.type,
              fetchPriority: f.fetchPriority,
              referrerPolicy: f.referrerPolicy
            }), f.fetchPriority === "high" || 10 > p.highImagePreloads.size ? p.highImagePreloads.add(Z) : (p.bulkPreloads.add(Z), z.set(O, Z)));
          }
        }
        return el(i, f, "img");
      case "base":
      case "area":
      case "br":
      case "col":
      case "embed":
      case "hr":
      case "keygen":
      case "param":
      case "source":
      case "track":
      case "wbr":
        return el(i, f, o);
      case "annotation-xml":
      case "color-profile":
      case "font-face":
      case "font-face-src":
      case "font-face-uri":
      case "font-face-format":
      case "font-face-name":
      case "missing-glyph":
        break;
      case "head":
        if (2 > Q.insertionMode) {
          var Qe = m || p.preamble;
          if (Qe.headChunks)
            throw Error(W(545, "`<head>`"));
          m !== null && i.push("<!--head-->"), Qe.headChunks = [];
          var bn = Zl(
            Qe.headChunks,
            f,
            "head"
          );
        } else
          bn = Ql(
            i,
            f,
            "head"
          );
        return bn;
      case "body":
        if (2 > Q.insertionMode) {
          var bt = m || p.preamble;
          if (bt.bodyChunks)
            throw Error(W(545, "`<body>`"));
          m !== null && i.push("<!--body-->"), bt.bodyChunks = [];
          var $n = Zl(
            bt.bodyChunks,
            f,
            "body"
          );
        } else
          $n = Ql(
            i,
            f,
            "body"
          );
        return $n;
      case "html":
        if (Q.insertionMode === 0) {
          var gr = m || p.preamble;
          if (gr.htmlChunks)
            throw Error(W(545, "`<html>`"));
          m !== null && i.push("<!--html-->"), gr.htmlChunks = [""];
          var ll = Zl(
            gr.htmlChunks,
            f,
            "html"
          );
        } else
          ll = Ql(
            i,
            f,
            "html"
          );
        return ll;
      default:
        if (o.indexOf("-") !== -1) {
          i.push(L(o));
          var Dl = null, Je = null, Pr;
          for (Pr in f)
            if (rn.call(f, Pr)) {
              var Mt = f[Pr];
              if (Mt != null) {
                var Qr = Pr;
                switch (Pr) {
                  case "children":
                    Dl = Mt;
                    break;
                  case "dangerouslySetInnerHTML":
                    Je = Mt;
                    break;
                  case "style":
                    Gt(i, Mt);
                    break;
                  case "suppressContentEditableWarning":
                  case "suppressHydrationWarning":
                  case "ref":
                    break;
                  case "className":
                    Qr = "class";
                  default:
                    if (qr(Pr) && typeof Mt != "function" && typeof Mt != "symbol" && Mt !== !1) {
                      if (Mt === !0) Mt = "";
                      else if (typeof Mt == "object") continue;
                      i.push(
                        " ",
                        Qr,
                        '="',
                        he(Mt),
                        '"'
                      );
                    }
                }
              }
            }
          return i.push(">"), rr(i, Je, Dl), Dl;
        }
    }
    return Ql(i, f, o);
  }
  var Ee = /* @__PURE__ */ new Map();
  function Fe(i) {
    var o = Ee.get(i);
    return o === void 0 && (o = "</" + i + ">", Ee.set(i, o)), o;
  }
  function ln(i, o) {
    i = i.preamble, i.htmlChunks === null && o.htmlChunks && (i.htmlChunks = o.htmlChunks), i.headChunks === null && o.headChunks && (i.headChunks = o.headChunks), i.bodyChunks === null && o.bodyChunks && (i.bodyChunks = o.bodyChunks);
  }
  function Ke(i, o) {
    o = o.bootstrapChunks;
    for (var f = 0; f < o.length - 1; f++)
      i.push(o[f]);
    return f < o.length ? (f = o[f], o.length = 0, i.push(f)) : !0;
  }
  function an(i, o, f) {
    if (i.push('<!--$?--><template id="'), f === null) throw Error(W(395));
    return i.push(o.boundaryPrefix), o = f.toString(16), i.push(o), i.push('"></template>');
  }
  function We(i, o, f, g) {
    switch (f.insertionMode) {
      case 0:
      case 1:
      case 3:
      case 2:
        return i.push('<div hidden id="'), i.push(o.segmentPrefix), o = g.toString(16), i.push(o), i.push('">');
      case 4:
        return i.push('<svg aria-hidden="true" style="display:none" id="'), i.push(o.segmentPrefix), o = g.toString(16), i.push(o), i.push('">');
      case 5:
        return i.push('<math aria-hidden="true" style="display:none" id="'), i.push(o.segmentPrefix), o = g.toString(16), i.push(o), i.push('">');
      case 6:
        return i.push('<table hidden id="'), i.push(o.segmentPrefix), o = g.toString(16), i.push(o), i.push('">');
      case 7:
        return i.push('<table hidden><tbody id="'), i.push(o.segmentPrefix), o = g.toString(16), i.push(o), i.push('">');
      case 8:
        return i.push('<table hidden><tr id="'), i.push(o.segmentPrefix), o = g.toString(16), i.push(o), i.push('">');
      case 9:
        return i.push('<table hidden><colgroup id="'), i.push(o.segmentPrefix), o = g.toString(16), i.push(o), i.push('">');
      default:
        throw Error(W(397));
    }
  }
  function Jl(i, o) {
    switch (o.insertionMode) {
      case 0:
      case 1:
      case 3:
      case 2:
        return i.push("</div>");
      case 4:
        return i.push("</svg>");
      case 5:
        return i.push("</math>");
      case 6:
        return i.push("</table>");
      case 7:
        return i.push("</tbody></table>");
      case 8:
        return i.push("</tr></table>");
      case 9:
        return i.push("</colgroup></table>");
      default:
        throw Error(W(397));
    }
  }
  var nl = /[<\u2028\u2029]/g;
  function dt(i) {
    return JSON.stringify(i).replace(
      nl,
      function(o) {
        switch (o) {
          case "<":
            return "\\u003c";
          case "\u2028":
            return "\\u2028";
          case "\u2029":
            return "\\u2029";
          default:
            throw Error(
              "escapeJSStringsForInstructionScripts encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
            );
        }
      }
    );
  }
  var hi = /[&><\u2028\u2029]/g;
  function oa(i) {
    return JSON.stringify(i).replace(
      hi,
      function(o) {
        switch (o) {
          case "&":
            return "\\u0026";
          case ">":
            return "\\u003e";
          case "<":
            return "\\u003c";
          case "\u2028":
            return "\\u2028";
          case "\u2029":
            return "\\u2029";
          default:
            throw Error(
              "escapeJSObjectForInstructionScripts encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
            );
        }
      }
    );
  }
  var La = !1, ur = !0;
  function tl(i) {
    var o = i.rules, f = i.hrefs, g = 0;
    if (f.length) {
      for (this.push(Se.startInlineStyle), this.push(' media="not all" data-precedence="'), this.push(i.precedence), this.push('" data-href="'); g < f.length - 1; g++)
        this.push(f[g]), this.push(" ");
      for (this.push(f[g]), this.push('">'), g = 0; g < o.length; g++) this.push(o[g]);
      ur = this.push("</style>"), La = !0, o.length = 0, f.length = 0;
    }
  }
  function Yn(i) {
    return i.state !== 2 ? La = !0 : !1;
  }
  function lc(i, o, f) {
    return La = !1, ur = !0, Se = f, o.styles.forEach(tl, i), Se = null, o.stylesheets.forEach(Yn), La && (f.stylesToHoist = !0), ur;
  }
  function bl(i) {
    for (var o = 0; o < i.length; o++) this.push(i[o]);
    i.length = 0;
  }
  var Cn = [];
  function es(i) {
    ht(Cn, i.props);
    for (var o = 0; o < Cn.length; o++)
      this.push(Cn[o]);
    Cn.length = 0, i.state = 2;
  }
  function dn(i) {
    var o = 0 < i.sheets.size;
    i.sheets.forEach(es, this), i.sheets.clear();
    var f = i.rules, g = i.hrefs;
    if (!o || g.length) {
      if (this.push(Se.startInlineStyle), this.push(' data-precedence="'), this.push(i.precedence), i = 0, g.length) {
        for (this.push('" data-href="'); i < g.length - 1; i++)
          this.push(g[i]), this.push(" ");
        this.push(g[i]);
      }
      for (this.push('">'), i = 0; i < f.length; i++)
        this.push(f[i]);
      this.push("</style>"), f.length = 0, g.length = 0;
    }
  }
  function ic(i) {
    if (i.state === 0) {
      i.state = 1;
      var o = i.props;
      for (ht(Cn, {
        rel: "preload",
        as: "style",
        href: i.props.href,
        crossOrigin: o.crossOrigin,
        fetchPriority: o.fetchPriority,
        integrity: o.integrity,
        media: o.media,
        hrefLang: o.hrefLang,
        referrerPolicy: o.referrerPolicy
      }), i = 0; i < Cn.length; i++)
        this.push(Cn[i]);
      Cn.length = 0;
    }
  }
  function ac(i) {
    i.sheets.forEach(ic, this), i.sheets.clear();
  }
  function oc(i, o) {
    (o.instructions & 32) === 0 && (o.instructions |= 32, i.push(
      ' id="',
      he("_" + o.idPrefix + "R_"),
      '"'
    ));
  }
  function di(i, o) {
    i.push("[");
    var f = "[";
    o.stylesheets.forEach(function(g) {
      if (g.state !== 2)
        if (g.state === 3)
          i.push(f), g = oa(
            "" + g.props.href
          ), i.push(g), i.push("]"), f = ",[";
        else {
          i.push(f);
          var p = g.props["data-precedence"], m = g.props, A = T("" + g.props.href);
          A = oa(A), i.push(A), p = "" + p, i.push(","), p = oa(p), i.push(p);
          for (var Q in m)
            if (rn.call(m, Q) && (p = m[Q], p != null))
              switch (Q) {
                case "href":
                case "rel":
                case "precedence":
                case "data-precedence":
                  break;
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(W(399, "link"));
                default:
                  _n(
                    i,
                    Q,
                    p
                  );
              }
          i.push("]"), f = ",[", g.state = 3;
        }
    }), i.push("]");
  }
  function _n(i, o, f) {
    var g = o.toLowerCase();
    switch (typeof f) {
      case "function":
      case "symbol":
        return;
    }
    switch (o) {
      case "innerHTML":
      case "dangerouslySetInnerHTML":
      case "suppressContentEditableWarning":
      case "suppressHydrationWarning":
      case "style":
      case "ref":
        return;
      case "className":
        g = "class", o = "" + f;
        break;
      case "hidden":
        if (f === !1) return;
        o = "";
        break;
      case "src":
      case "href":
        f = T(f), o = "" + f;
        break;
      default:
        if (2 < o.length && (o[0] === "o" || o[0] === "O") && (o[1] === "n" || o[1] === "N") || !qr(o))
          return;
        o = "" + f;
    }
    i.push(","), g = oa(g), i.push(g), i.push(","), g = oa(o), i.push(g);
  }
  function mn() {
    return { styles: /* @__PURE__ */ new Set(), stylesheets: /* @__PURE__ */ new Set(), suspenseyImages: !1 };
  }
  function Vl(i) {
    var o = Nt || null;
    if (o) {
      var f = o.resumableState, g = o.renderState;
      if (typeof i == "string" && i) {
        if (!f.dnsResources.hasOwnProperty(i)) {
          f.dnsResources[i] = null, f = g.headers;
          var p, m;
          (m = f && 0 < f.remainingCapacity) && (m = (p = "<" + ("" + i).replace(
            Gc,
            Eo
          ) + ">; rel=dns-prefetch", 0 <= (f.remainingCapacity -= p.length + 2))), m ? (g.resets.dns[i] = null, f.preconnects && (f.preconnects += ", "), f.preconnects += p) : (p = [], ht(p, { href: i, rel: "dns-prefetch" }), g.preconnects.add(p));
        }
        Do(o);
      }
    } else me.D(i);
  }
  function sr(i, o) {
    var f = Nt || null;
    if (f) {
      var g = f.resumableState, p = f.renderState;
      if (typeof i == "string" && i) {
        var m = o === "use-credentials" ? "credentials" : typeof o == "string" ? "anonymous" : "default";
        if (!g.connectResources[m].hasOwnProperty(i)) {
          g.connectResources[m][i] = null, g = p.headers;
          var A, Q;
          if (Q = g && 0 < g.remainingCapacity) {
            if (Q = "<" + ("" + i).replace(
              Gc,
              Eo
            ) + ">; rel=preconnect", typeof o == "string") {
              var I = ("" + o).replace(
                wl,
                _a
              );
              Q += '; crossorigin="' + I + '"';
            }
            Q = (A = Q, 0 <= (g.remainingCapacity -= A.length + 2));
          }
          Q ? (p.resets.connect[m][i] = null, g.preconnects && (g.preconnects += ", "), g.preconnects += A) : (m = [], ht(m, {
            rel: "preconnect",
            href: i,
            crossOrigin: o
          }), p.preconnects.add(m));
        }
        Do(f);
      }
    } else me.C(i, o);
  }
  function Ba(i, o, f) {
    var g = Nt || null;
    if (g) {
      var p = g.resumableState, m = g.renderState;
      if (o && i) {
        switch (o) {
          case "image":
            if (f)
              var A = f.imageSrcSet, Q = f.imageSizes, I = f.fetchPriority;
            var G = A ? A + `
` + (Q || "") : i;
            if (p.imageResources.hasOwnProperty(G)) return;
            p.imageResources[G] = Be, p = m.headers;
            var re;
            p && 0 < p.remainingCapacity && typeof A != "string" && I === "high" && (re = rt(i, o, f), 0 <= (p.remainingCapacity -= re.length + 2)) ? (m.resets.image[G] = Be, p.highImagePreloads && (p.highImagePreloads += ", "), p.highImagePreloads += re) : (p = [], ht(
              p,
              Et(
                { rel: "preload", href: A ? void 0 : i, as: o },
                f
              )
            ), I === "high" ? m.highImagePreloads.add(p) : (m.bulkPreloads.add(p), m.preloads.images.set(G, p)));
            break;
          case "style":
            if (p.styleResources.hasOwnProperty(i)) return;
            A = [], ht(
              A,
              Et({ rel: "preload", href: i, as: o }, f)
            ), p.styleResources[i] = !f || typeof f.crossOrigin != "string" && typeof f.integrity != "string" ? Be : [f.crossOrigin, f.integrity], m.preloads.stylesheets.set(i, A), m.bulkPreloads.add(A);
            break;
          case "script":
            if (p.scriptResources.hasOwnProperty(i)) return;
            A = [], m.preloads.scripts.set(i, A), m.bulkPreloads.add(A), ht(
              A,
              Et({ rel: "preload", href: i, as: o }, f)
            ), p.scriptResources[i] = !f || typeof f.crossOrigin != "string" && typeof f.integrity != "string" ? Be : [f.crossOrigin, f.integrity];
            break;
          default:
            if (p.unknownResources.hasOwnProperty(o)) {
              if (A = p.unknownResources[o], A.hasOwnProperty(i))
                return;
            } else
              A = {}, p.unknownResources[o] = A;
            A[i] = Be, (p = m.headers) && 0 < p.remainingCapacity && o === "font" && (G = rt(i, o, f), 0 <= (p.remainingCapacity -= G.length + 2)) ? (m.resets.font[i] = Be, p.fontPreloads && (p.fontPreloads += ", "), p.fontPreloads += G) : (p = [], i = Et({ rel: "preload", href: i, as: o }, f), ht(p, i), o) === "font" ? m.fontPreloads.add(p) : m.bulkPreloads.add(p);
        }
        Do(g);
      }
    } else me.L(i, o, f);
  }
  function Wc(i, o) {
    var f = Nt || null;
    if (f) {
      var g = f.resumableState, p = f.renderState;
      if (i) {
        var m = o && typeof o.as == "string" ? o.as : "script";
        switch (m) {
          case "script":
            if (g.moduleScriptResources.hasOwnProperty(i)) return;
            m = [], g.moduleScriptResources[i] = !o || typeof o.crossOrigin != "string" && typeof o.integrity != "string" ? Be : [o.crossOrigin, o.integrity], p.preloads.moduleScripts.set(i, m);
            break;
          default:
            if (g.moduleUnknownResources.hasOwnProperty(m)) {
              var A = g.unknownResources[m];
              if (A.hasOwnProperty(i)) return;
            } else
              A = {}, g.moduleUnknownResources[m] = A;
            m = [], A[i] = Be;
        }
        ht(m, Et({ rel: "modulepreload", href: i }, o)), p.bulkPreloads.add(m), Do(f);
      }
    } else me.m(i, o);
  }
  function Er(i, o, f) {
    var g = Nt || null;
    if (g) {
      var p = g.resumableState, m = g.renderState;
      if (i) {
        o = o || "default";
        var A = m.styles.get(o), Q = p.styleResources.hasOwnProperty(i) ? p.styleResources[i] : void 0;
        Q !== null && (p.styleResources[i] = null, A || (A = {
          precedence: he(o),
          rules: [],
          hrefs: [],
          sheets: /* @__PURE__ */ new Map()
        }, m.styles.set(o, A)), o = {
          state: 0,
          props: Et(
            { rel: "stylesheet", href: i, "data-precedence": o },
            f
          )
        }, Q && (Q.length === 2 && Yc(o.props, Q), (m = m.preloads.stylesheets.get(i)) && 0 < m.length ? m.length = 0 : o.state = 1), A.sheets.set(i, o), Do(g));
      }
    } else me.S(i, o, f);
  }
  function ns(i, o) {
    var f = Nt || null;
    if (f) {
      var g = f.resumableState, p = f.renderState;
      if (i) {
        var m = g.scriptResources.hasOwnProperty(i) ? g.scriptResources[i] : void 0;
        m !== null && (g.scriptResources[i] = null, o = Et({ src: i, async: !0 }, o), m && (m.length === 2 && Yc(o, m), i = p.preloads.scripts.get(i)) && (i.length = 0), i = [], p.scripts.add(i), fi(i, o), Do(f));
      }
    } else me.X(i, o);
  }
  function ku(i, o) {
    var f = Nt || null;
    if (f) {
      var g = f.resumableState, p = f.renderState;
      if (i) {
        var m = g.moduleScriptResources.hasOwnProperty(
          i
        ) ? g.moduleScriptResources[i] : void 0;
        m !== null && (g.moduleScriptResources[i] = null, o = Et({ src: i, type: "module", async: !0 }, o), m && (m.length === 2 && Yc(o, m), i = p.preloads.moduleScripts.get(i)) && (i.length = 0), i = [], p.scripts.add(i), fi(i, o), Do(f));
      }
    } else me.M(i, o);
  }
  function Yc(i, o) {
    i.crossOrigin == null && (i.crossOrigin = o[0]), i.integrity == null && (i.integrity = o[1]);
  }
  function rt(i, o, f) {
    i = ("" + i).replace(
      Gc,
      Eo
    ), o = ("" + o).replace(
      wl,
      _a
    ), o = "<" + i + '>; rel=preload; as="' + o + '"';
    for (var g in f)
      rn.call(f, g) && (i = f[g], typeof i == "string" && (o += "; " + g.toLowerCase() + '="' + ("" + i).replace(
        wl,
        _a
      ) + '"'));
    return o;
  }
  var Gc = /[<>\r\n]/g;
  function Eo(i) {
    switch (i) {
      case "<":
        return "%3C";
      case ">":
        return "%3E";
      case `
`:
        return "%0A";
      case "\r":
        return "%0D";
      default:
        throw Error(
          "escapeLinkHrefForHeaderContextReplacer encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
        );
    }
  }
  var wl = /["';,\r\n]/g;
  function _a(i) {
    switch (i) {
      case '"':
        return "%22";
      case "'":
        return "%27";
      case ";":
        return "%3B";
      case ",":
        return "%2C";
      case `
`:
        return "%0A";
      case "\r":
        return "%0D";
      default:
        throw Error(
          "escapeStringForLinkHeaderQuotedParamValueContextReplacer encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
        );
    }
  }
  function ts(i) {
    this.styles.add(i);
  }
  function rs(i) {
    this.stylesheets.add(i);
  }
  function Ro(i, o) {
    o.styles.forEach(ts, i), o.stylesheets.forEach(rs, i), o.suspenseyImages && (i.suspenseyImages = !0);
  }
  function Co(i, o) {
    var f = i.idPrefix, g = [], p = i.bootstrapScriptContent, m = i.bootstrapScripts, A = i.bootstrapModules;
    p !== void 0 && (g.push("<script"), oc(g, i), g.push(
      ">",
      ("" + p).replace(Rt, Rn),
      "<\/script>"
    )), p = f + "P:";
    var Q = f + "S:";
    f += "B:";
    var I = /* @__PURE__ */ new Set(), G = /* @__PURE__ */ new Set(), re = /* @__PURE__ */ new Set(), $ = /* @__PURE__ */ new Map(), ve = /* @__PURE__ */ new Set(), Ne = /* @__PURE__ */ new Set(), on = /* @__PURE__ */ new Set(), Ze = {
      images: /* @__PURE__ */ new Map(),
      stylesheets: /* @__PURE__ */ new Map(),
      scripts: /* @__PURE__ */ new Map(),
      moduleScripts: /* @__PURE__ */ new Map()
    };
    if (m !== void 0)
      for (var ze = 0; ze < m.length; ze++) {
        var je = m[ze], Xe, at = void 0, cn = void 0, wn = {
          rel: "preload",
          as: "script",
          fetchPriority: "low",
          nonce: void 0
        };
        typeof je == "string" ? wn.href = Xe = je : (wn.href = Xe = je.src, wn.integrity = cn = typeof je.integrity == "string" ? je.integrity : void 0, wn.crossOrigin = at = typeof je == "string" || je.crossOrigin == null ? void 0 : je.crossOrigin === "use-credentials" ? "use-credentials" : ""), je = i;
        var Mn = Xe;
        je.scriptResources[Mn] = null, je.moduleScriptResources[Mn] = null, je = [], ht(je, wn), ve.add(je), g.push('<script src="', he(Xe), '"'), typeof cn == "string" && g.push(
          ' integrity="',
          he(cn),
          '"'
        ), typeof at == "string" && g.push(
          ' crossorigin="',
          he(at),
          '"'
        ), oc(g, i), g.push(' async=""><\/script>');
      }
    if (A !== void 0)
      for (m = 0; m < A.length; m++)
        wn = A[m], at = Xe = void 0, cn = {
          rel: "modulepreload",
          fetchPriority: "low",
          nonce: void 0
        }, typeof wn == "string" ? cn.href = ze = wn : (cn.href = ze = wn.src, cn.integrity = at = typeof wn.integrity == "string" ? wn.integrity : void 0, cn.crossOrigin = Xe = typeof wn == "string" || wn.crossOrigin == null ? void 0 : wn.crossOrigin === "use-credentials" ? "use-credentials" : ""), wn = i, je = ze, wn.scriptResources[je] = null, wn.moduleScriptResources[je] = null, wn = [], ht(wn, cn), ve.add(wn), g.push(
          '<script type="module" src="',
          he(ze),
          '"'
        ), typeof at == "string" && g.push(
          ' integrity="',
          he(at),
          '"'
        ), typeof Xe == "string" && g.push(
          ' crossorigin="',
          he(Xe),
          '"'
        ), oc(g, i), g.push(' async=""><\/script>');
    return {
      placeholderPrefix: p,
      segmentPrefix: Q,
      boundaryPrefix: f,
      startInlineScript: "<script",
      startInlineStyle: "<style",
      preamble: { htmlChunks: null, headChunks: null, bodyChunks: null },
      externalRuntimeScript: null,
      bootstrapChunks: g,
      importMapChunks: [],
      onHeaders: void 0,
      headers: null,
      resets: {
        font: {},
        dns: {},
        connect: { default: {}, anonymous: {}, credentials: {} },
        image: {},
        style: {}
      },
      charsetChunks: [],
      viewportChunks: [],
      hoistableChunks: [],
      preconnects: I,
      fontPreloads: G,
      highImagePreloads: re,
      styles: $,
      bootstrapScripts: ve,
      scripts: Ne,
      bulkPreloads: on,
      preloads: Ze,
      nonce: { script: void 0, style: void 0 },
      stylesToHoist: !1,
      generateStaticMarkup: o
    };
  }
  function gi(i, o, f, g) {
    return f.generateStaticMarkup ? (i.push(he(o)), !1) : (o === "" ? i = g : (g && i.push("<!-- -->"), i.push(he(o)), i = !0), i);
  }
  function vi(i, o, f, g) {
    o.generateStaticMarkup || f && g && i.push("<!-- -->");
  }
  var Xc = Function.prototype.bind, cc = /* @__PURE__ */ Symbol.for("react.client.reference");
  function uc(i) {
    if (i == null) return null;
    if (typeof i == "function")
      return i.$$typeof === cc ? null : i.displayName || i.name || null;
    if (typeof i == "string") return i;
    switch (i) {
      case be:
        return "Fragment";
      case Tn:
        return "Profiler";
      case Oe:
        return "StrictMode";
      case P:
        return "Suspense";
      case N:
        return "SuspenseList";
      case ft:
        return "Activity";
    }
    if (typeof i == "object")
      switch (i.$$typeof) {
        case nn:
          return "Portal";
        case ie:
          return i.displayName || "Context";
        case Re:
          return (i._context.displayName || "Context") + ".Consumer";
        case He:
          var o = i.render;
          return i = i.displayName, i || (i = o.displayName || o.name || "", i = i !== "" ? "ForwardRef(" + i + ")" : "ForwardRef"), i;
        case Pe:
          return o = i.displayName || null, o !== null ? o : uc(i.type) || "Memo";
        case ee:
          o = i._payload, i = i._init;
          try {
            return uc(i(o));
          } catch {
          }
      }
    return null;
  }
  var Zt = {}, mo = null;
  function sc(i, o) {
    if (i !== o) {
      i.context._currentValue2 = i.parentValue, i = i.parent;
      var f = o.parent;
      if (i === null) {
        if (f !== null) throw Error(W(401));
      } else {
        if (f === null) throw Error(W(401));
        sc(i, f);
      }
      o.context._currentValue2 = o.value;
    }
  }
  function Zc(i) {
    i.context._currentValue2 = i.parentValue, i = i.parent, i !== null && Zc(i);
  }
  function yi(i) {
    var o = i.parent;
    o !== null && yi(o), i.context._currentValue2 = i.value;
  }
  function fc(i, o) {
    if (i.context._currentValue2 = i.parentValue, i = i.parent, i === null) throw Error(W(402));
    i.depth === o.depth ? sc(i, o) : fc(i, o);
  }
  function Ur(i, o) {
    var f = o.parent;
    if (f === null) throw Error(W(402));
    i.depth === f.depth ? sc(i, f) : Ur(i, f), o.context._currentValue2 = o.value;
  }
  function Kl(i) {
    var o = mo;
    o !== i && (o === null ? yi(i) : i === null ? Zc(o) : o.depth === i.depth ? sc(o, i) : o.depth > i.depth ? fc(o, i) : Ur(o, i), mo = i);
  }
  var Su = {
    enqueueSetState: function(i, o) {
      i = i._reactInternals, i.queue !== null && i.queue.push(o);
    },
    enqueueReplaceState: function(i, o) {
      i = i._reactInternals, i.replace = !0, i.queue = [o];
    },
    enqueueForceUpdate: function() {
    }
  }, hc = { id: 1, overflow: "" };
  function Wr(i, o, f) {
    var g = i.id;
    i = i.overflow;
    var p = 32 - dc(g) - 1;
    g &= ~(1 << p), f += 1;
    var m = 32 - dc(o) + p;
    if (30 < m) {
      var A = p - p % 5;
      return m = (g & (1 << A) - 1).toString(32), g >>= A, p -= A, {
        id: 1 << 32 - dc(o) + p | f << p | g,
        overflow: m + i
      };
    }
    return {
      id: 1 << m | f << p | g,
      overflow: i
    };
  }
  var dc = Math.clz32 ? Math.clz32 : Yr, ca = Math.log, ko = Math.LN2;
  function Yr(i) {
    return i >>>= 0, i === 0 ? 32 : 31 - (ca(i) / ko | 0) | 0;
  }
  function Kt() {
  }
  var jn = Error(W(460));
  function Au(i, o, f) {
    switch (f = i[f], f === void 0 ? i.push(o) : f !== o && (o.then(Kt, Kt), o = f), o.status) {
      case "fulfilled":
        return o.value;
      case "rejected":
        throw o.reason;
      default:
        switch (typeof o.status == "string" ? o.then(Kt, Kt) : (i = o, i.status = "pending", i.then(
          function(g) {
            if (o.status === "pending") {
              var p = o;
              p.status = "fulfilled", p.value = g;
            }
          },
          function(g) {
            if (o.status === "pending") {
              var p = o;
              p.status = "rejected", p.reason = g;
            }
          }
        )), o.status) {
          case "fulfilled":
            return o.value;
          case "rejected":
            throw o.reason;
        }
        throw Ni = o, jn;
    }
  }
  var Ni = null;
  function jl() {
    if (Ni === null) throw Error(W(459));
    var i = Ni;
    return Ni = null, i;
  }
  function Pu(i, o) {
    return i === o && (i !== 0 || 1 / i === 1 / o) || i !== i && o !== o;
  }
  var Li = typeof Object.is == "function" ? Object.is : Pu, bi = null, So = null, Bi = null, _i = null, Ao = null, $e = null, ql = !1, It = !1, wi = 0, Qt = 0, ua = -1, za = 0, pi = null, zi = null, Dt = 0;
  function Hi() {
    if (bi === null)
      throw Error(W(321));
    return bi;
  }
  function Ui() {
    if (0 < Dt) throw Error(W(312));
    return { memoizedState: null, queue: null, next: null };
  }
  function Ha() {
    return $e === null ? Ao === null ? (ql = !1, Ao = $e = Ui()) : (ql = !0, $e = Ao) : $e.next === null ? (ql = !1, $e = $e.next = Ui()) : (ql = !0, $e = $e.next), $e;
  }
  function sa() {
    var i = pi;
    return pi = null, i;
  }
  function Ua() {
    _i = Bi = So = bi = null, It = !1, Ao = null, Dt = 0, $e = zi = null;
  }
  function Gr(i, o) {
    return typeof o == "function" ? o(i) : o;
  }
  function Wa(i, o, f) {
    if (bi = Hi(), $e = Ha(), ql) {
      var g = $e.queue;
      if (o = g.dispatch, zi !== null && (f = zi.get(g), f !== void 0)) {
        zi.delete(g), g = $e.memoizedState;
        do
          g = i(g, f.action), f = f.next;
        while (f !== null);
        return $e.memoizedState = g, [g, o];
      }
      return [$e.memoizedState, o];
    }
    return i = i === Gr ? typeof o == "function" ? o() : o : f !== void 0 ? f(o) : o, $e.memoizedState = i, i = $e.queue = { last: null, dispatch: null }, i = i.dispatch = Fu.bind(
      null,
      bi,
      i
    ), [$e.memoizedState, i];
  }
  function $l(i, o) {
    if (bi = Hi(), $e = Ha(), o = o === void 0 ? null : o, $e !== null) {
      var f = $e.memoizedState;
      if (f !== null && o !== null) {
        var g = f[1];
        e: if (g === null) g = !1;
        else {
          for (var p = 0; p < g.length && p < o.length; p++)
            if (!Li(o[p], g[p])) {
              g = !1;
              break e;
            }
          g = !0;
        }
        if (g) return f[0];
      }
    }
    return i = i(), $e.memoizedState = [i, o], i;
  }
  function Fu(i, o, f) {
    if (25 <= Dt) throw Error(W(301));
    if (i === bi)
      if (It = !0, i = { action: f, next: null }, zi === null && (zi = /* @__PURE__ */ new Map()), f = zi.get(o), f === void 0)
        zi.set(o, i);
      else {
        for (o = f; o.next !== null; ) o = o.next;
        o.next = i;
      }
  }
  function Ou() {
    throw Error(W(440));
  }
  function Mu() {
    throw Error(W(394));
  }
  function Po() {
    throw Error(W(479));
  }
  function Fo(i, o, f) {
    Hi();
    var g = Qt++, p = Bi;
    if (typeof i.$$FORM_ACTION == "function") {
      var m = null, A = _i;
      p = p.formState;
      var Q = i.$$IS_SIGNATURE_EQUAL;
      if (p !== null && typeof Q == "function") {
        var I = p[1];
        Q.call(i, p[2], p[3]) && (m = f !== void 0 ? "p" + f : "k" + Ve(
          JSON.stringify([A, null, g]),
          0
        ), I === m && (ua = g, o = p[0]));
      }
      var G = i.bind(null, o);
      return i = function($) {
        G($);
      }, typeof G.$$FORM_ACTION == "function" && (i.$$FORM_ACTION = function($) {
        $ = G.$$FORM_ACTION($), f !== void 0 && (f += "", $.action = f);
        var ve = $.data;
        return ve && (m === null && (m = f !== void 0 ? "p" + f : "k" + Ve(
          JSON.stringify([
            A,
            null,
            g
          ]),
          0
        )), ve.append("$ACTION_KEY", m)), $;
      }), [o, i, !1];
    }
    var re = i.bind(null, o);
    return [
      o,
      function($) {
        re($);
      },
      !1
    ];
  }
  function Oo(i) {
    var o = za;
    return za += 1, pi === null && (pi = []), Au(pi, i, o);
  }
  function jt() {
    throw Error(W(393));
  }
  var ls = {
    readContext: function(i) {
      return i._currentValue2;
    },
    use: function(i) {
      if (i !== null && typeof i == "object") {
        if (typeof i.then == "function") return Oo(i);
        if (i.$$typeof === ie)
          return i._currentValue2;
      }
      throw Error(W(438, String(i)));
    },
    useContext: function(i) {
      return Hi(), i._currentValue2;
    },
    useMemo: $l,
    useReducer: Wa,
    useRef: function(i) {
      bi = Hi(), $e = Ha();
      var o = $e.memoizedState;
      return o === null ? (i = { current: i }, $e.memoizedState = i) : o;
    },
    useState: function(i) {
      return Wa(Gr, i);
    },
    useInsertionEffect: Kt,
    useLayoutEffect: Kt,
    useCallback: function(i, o) {
      return $l(function() {
        return i;
      }, o);
    },
    useImperativeHandle: Kt,
    useEffect: Kt,
    useDebugValue: Kt,
    useDeferredValue: function(i, o) {
      return Hi(), o !== void 0 ? o : i;
    },
    useTransition: function() {
      return Hi(), [!1, Mu];
    },
    useId: function() {
      var i = So.treeContext, o = i.overflow;
      i = i.id, i = (i & ~(1 << 32 - dc(i) - 1)).toString(32) + o;
      var f = fa;
      if (f === null) throw Error(W(404));
      return o = wi++, i = "_" + f.idPrefix + "R_" + i, 0 < o && (i += "H" + o.toString(32)), i + "_";
    },
    useSyncExternalStore: function(i, o, f) {
      if (f === void 0)
        throw Error(W(407));
      return f();
    },
    useOptimistic: function(i) {
      return Hi(), [i, Po];
    },
    useActionState: Fo,
    useFormState: Fo,
    useHostTransitionStatus: function() {
      return Hi(), Te;
    },
    useMemoCache: function(i) {
      for (var o = Array(i), f = 0; f < i; f++)
        o[f] = Yt;
      return o;
    },
    useCacheRefresh: function() {
      return jt;
    },
    useEffectEvent: function() {
      return Ou;
    }
  }, fa = null, gc = {
    getCacheForType: function() {
      throw Error(W(248));
    },
    cacheSignal: function() {
      throw Error(W(248));
    }
  }, Qc, Wi;
  function ha(i) {
    if (Qc === void 0)
      try {
        throw Error();
      } catch (f) {
        var o = f.stack.trim().match(/\n( *(at )?)/);
        Qc = o && o[1] || "", Wi = -1 < f.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < f.stack.indexOf("@") ? "@unknown:0:0" : "";
      }
    return `
` + Qc + i + Wi;
  }
  var Mo = !1;
  function ei(i, o) {
    if (!i || Mo) return "";
    Mo = !0;
    var f = Error.prepareStackTrace;
    Error.prepareStackTrace = void 0;
    try {
      var g = {
        DetermineComponentFrameRoot: function() {
          try {
            if (o) {
              var $ = function() {
                throw Error();
              };
              if (Object.defineProperty($.prototype, "props", {
                set: function() {
                  throw Error();
                }
              }), typeof Reflect == "object" && Reflect.construct) {
                try {
                  Reflect.construct($, []);
                } catch (Ne) {
                  var ve = Ne;
                }
                Reflect.construct(i, [], $);
              } else {
                try {
                  $.call();
                } catch (Ne) {
                  ve = Ne;
                }
                i.call($.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (Ne) {
                ve = Ne;
              }
              ($ = i()) && typeof $.catch == "function" && $.catch(function() {
              });
            }
          } catch (Ne) {
            if (Ne && ve && typeof Ne.stack == "string")
              return [Ne.stack, ve.stack];
          }
          return [null, null];
        }
      };
      g.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
      var p = Object.getOwnPropertyDescriptor(
        g.DetermineComponentFrameRoot,
        "name"
      );
      p && p.configurable && Object.defineProperty(
        g.DetermineComponentFrameRoot,
        "name",
        { value: "DetermineComponentFrameRoot" }
      );
      var m = g.DetermineComponentFrameRoot(), A = m[0], Q = m[1];
      if (A && Q) {
        var I = A.split(`
`), G = Q.split(`
`);
        for (p = g = 0; g < I.length && !I[g].includes("DetermineComponentFrameRoot"); )
          g++;
        for (; p < G.length && !G[p].includes(
          "DetermineComponentFrameRoot"
        ); )
          p++;
        if (g === I.length || p === G.length)
          for (g = I.length - 1, p = G.length - 1; 1 <= g && 0 <= p && I[g] !== G[p]; )
            p--;
        for (; 1 <= g && 0 <= p; g--, p--)
          if (I[g] !== G[p]) {
            if (g !== 1 || p !== 1)
              do
                if (g--, p--, 0 > p || I[g] !== G[p]) {
                  var re = `
` + I[g].replace(" at new ", " at ");
                  return i.displayName && re.includes("<anonymous>") && (re = re.replace("<anonymous>", i.displayName)), re;
                }
              while (1 <= g && 0 <= p);
            break;
          }
      }
    } finally {
      Mo = !1, Error.prepareStackTrace = f;
    }
    return (f = i ? i.displayName || i.name : "") ? ha(f) : "";
  }
  function da(i) {
    if (typeof i == "string") return ha(i);
    if (typeof i == "function")
      return i.prototype && i.prototype.isReactComponent ? ei(i, !0) : ei(i, !1);
    if (typeof i == "object" && i !== null) {
      switch (i.$$typeof) {
        case He:
          return ei(i.render, !1);
        case Pe:
          return ei(i.type, !1);
        case ee:
          var o = i, f = o._payload;
          o = o._init;
          try {
            i = o(f);
          } catch {
            return ha("Lazy");
          }
          return da(i);
      }
      if (typeof i.name == "string") {
        e: {
          f = i.name, o = i.env;
          var g = i.debugLocation;
          if (g != null && (i = Error.prepareStackTrace, Error.prepareStackTrace = void 0, g = g.stack, Error.prepareStackTrace = i, g.startsWith(`Error: react-stack-top-frame
`) && (g = g.slice(29)), i = g.indexOf(`
`), i !== -1 && (g = g.slice(i + 1)), i = g.indexOf("react_stack_bottom_frame"), i !== -1 && (i = g.lastIndexOf(`
`, i)), i = i !== -1 ? g = g.slice(0, i) : "", g = i.lastIndexOf(`
`), i = g === -1 ? i : i.slice(g + 1), i.indexOf(f) !== -1)) {
            f = `
` + i;
            break e;
          }
          f = ha(
            f + (o ? " [" + o + "]" : "")
          );
        }
        return f;
      }
    }
    switch (i) {
      case N:
        return ha("SuspenseList");
      case P:
        return ha("Suspense");
    }
    return "";
  }
  function ga(i, o) {
    return (500 < o.byteSize || !1) && o.contentPreamble === null;
  }
  function Iu(i) {
    if (typeof i == "object" && i !== null && typeof i.environmentName == "string") {
      var o = i.environmentName;
      i = [i].slice(0), typeof i[0] == "string" ? i.splice(
        0,
        1,
        "[%s] " + i[0],
        " " + o + " "
      ) : i.splice(0, 0, "[%s]", " " + o + " "), i.unshift(console), o = Xc.apply(console.error, i), o();
    } else console.error(i);
    return null;
  }
  function Es(i, o, f, g, p, m, A, Q, I, G, re) {
    var $ = /* @__PURE__ */ new Set();
    this.destination = null, this.flushScheduled = !1, this.resumableState = i, this.renderState = o, this.rootFormatContext = f, this.progressiveChunkSize = g === void 0 ? 12800 : g, this.status = 10, this.fatalError = null, this.pendingRootTasks = this.allPendingTasks = this.nextSegmentId = 0, this.completedPreambleSegments = this.completedRootSegment = null, this.byteSize = 0, this.abortableTasks = $, this.pingedTasks = [], this.clientRenderedBoundaries = [], this.completedBoundaries = [], this.partialBoundaries = [], this.trackedPostpones = null, this.onError = p === void 0 ? Iu : p, this.onPostpone = G === void 0 ? Kt : G, this.onAllReady = m === void 0 ? Kt : m, this.onShellReady = A === void 0 ? Kt : A, this.onShellError = Q === void 0 ? Kt : Q, this.onFatalError = I === void 0 ? Kt : I, this.formState = re === void 0 ? null : re;
  }
  function Ya(i, o, f, g, p, m, A, Q, I, G, re, $) {
    return o = new Es(
      o,
      f,
      g,
      p,
      m,
      A,
      Q,
      I,
      G,
      re,
      $
    ), f = pl(
      o,
      0,
      null,
      g,
      !1,
      !1
    ), f.parentFlushed = !0, i = yc(
      o,
      null,
      i,
      -1,
      null,
      f,
      null,
      null,
      o.abortableTasks,
      null,
      g,
      null,
      hc,
      null,
      null
    ), Tl(i), o.pingedTasks.push(i), o;
  }
  var Nt = null;
  function Ti(i, o) {
    i.pingedTasks.push(o), i.pingedTasks.length === 1 && (i.flushScheduled = i.destination !== null, as(i));
  }
  function vc(i, o, f, g, p) {
    return f = {
      status: 0,
      rootSegmentID: -1,
      parentFlushed: !1,
      pendingTasks: 0,
      row: o,
      completedSegments: [],
      byteSize: 0,
      fallbackAbortableTasks: f,
      errorDigest: null,
      contentState: mn(),
      fallbackState: mn(),
      contentPreamble: g,
      fallbackPreamble: p,
      trackedContentKeyPath: null,
      trackedFallbackNode: null
    }, o !== null && (o.pendingTasks++, g = o.boundaries, g !== null && (i.allPendingTasks++, f.pendingTasks++, g.push(f)), i = o.inheritedHoistables, i !== null && Ro(f.contentState, i)), f;
  }
  function yc(i, o, f, g, p, m, A, Q, I, G, re, $, ve, Ne, on) {
    i.allPendingTasks++, p === null ? i.pendingRootTasks++ : p.pendingTasks++, Ne !== null && Ne.pendingTasks++;
    var Ze = {
      replay: null,
      node: f,
      childIndex: g,
      ping: function() {
        return Ti(i, Ze);
      },
      blockedBoundary: p,
      blockedSegment: m,
      blockedPreamble: A,
      hoistableState: Q,
      abortSet: I,
      keyPath: G,
      formatContext: re,
      context: $,
      treeContext: ve,
      row: Ne,
      componentStack: on,
      thenableState: o
    };
    return I.add(Ze), Ze;
  }
  function Jc(i, o, f, g, p, m, A, Q, I, G, re, $, ve, Ne) {
    i.allPendingTasks++, m === null ? i.pendingRootTasks++ : m.pendingTasks++, ve !== null && ve.pendingTasks++, f.pendingTasks++;
    var on = {
      replay: f,
      node: g,
      childIndex: p,
      ping: function() {
        return Ti(i, on);
      },
      blockedBoundary: m,
      blockedSegment: null,
      blockedPreamble: null,
      hoistableState: A,
      abortSet: Q,
      keyPath: I,
      formatContext: G,
      context: re,
      treeContext: $,
      row: ve,
      componentStack: Ne,
      thenableState: o
    };
    return Q.add(on), on;
  }
  function pl(i, o, f, g, p, m) {
    return {
      status: 0,
      parentFlushed: !1,
      id: -1,
      index: o,
      chunks: [],
      children: [],
      preambleChildren: [],
      parentFormatContext: g,
      boundary: f,
      lastPushedText: p,
      textEmbedded: m
    };
  }
  function Tl(i) {
    var o = i.node;
    typeof o == "object" && o !== null && o.$$typeof === ke && (i.componentStack = { parent: i.componentStack, type: o.type });
  }
  function rl(i) {
    return i === null ? null : { parent: i.parent, type: "Suspense Fallback" };
  }
  function xl(i) {
    var o = {};
    return i && Object.defineProperty(o, "componentStack", {
      configurable: !0,
      enumerable: !0,
      get: function() {
        try {
          var f = "", g = i;
          do
            f += da(g.type), g = g.parent;
          while (g);
          var p = f;
        } catch (m) {
          p = `
Error generating stack: ` + m.message + `
` + m.stack;
        }
        return Object.defineProperty(o, "componentStack", {
          value: p
        }), p;
      }
    }), o;
  }
  function Gn(i, o, f) {
    if (i = i.onError, o = i(o, f), o == null || typeof o == "string") return o;
  }
  function El(i, o) {
    var f = i.onShellError, g = i.onFatalError;
    f(o), g(o), i.destination !== null ? (i.status = 14, i.destination.destroy(o)) : (i.status = 13, i.fatalError = o);
  }
  function lt(i, o) {
    ni(i, o.next, o.hoistables);
  }
  function ni(i, o, f) {
    for (; o !== null; ) {
      f !== null && (Ro(o.hoistables, f), o.inheritedHoistables = f);
      var g = o.boundaries;
      if (g !== null) {
        o.boundaries = null;
        for (var p = 0; p < g.length; p++) {
          var m = g[p];
          f !== null && Ro(m.contentState, f), Gi(i, m, null, null);
        }
      }
      if (o.pendingTasks--, 0 < o.pendingTasks) break;
      f = o.hoistables, o = o.next;
    }
  }
  function Vc(i, o) {
    var f = o.boundaries;
    if (f !== null && o.pendingTasks === f.length) {
      for (var g = !0, p = 0; p < f.length; p++) {
        var m = f[p];
        if (m.pendingTasks !== 1 || m.parentFlushed || ga(i, m)) {
          g = !1;
          break;
        }
      }
      g && ni(i, o, o.hoistables);
    }
  }
  function Kc(i) {
    var o = {
      pendingTasks: 1,
      boundaries: null,
      hoistables: mn(),
      inheritedHoistables: null,
      together: !1,
      next: null
    };
    return i !== null && 0 < i.pendingTasks && (o.pendingTasks++, o.boundaries = [], i.next = o), o;
  }
  function jc(i, o, f, g, p) {
    var m = o.keyPath, A = o.treeContext, Q = o.row;
    o.keyPath = f, f = g.length;
    var I = null;
    if (o.replay !== null) {
      var G = o.replay.slots;
      if (G !== null && typeof G == "object")
        for (var re = 0; re < f; re++) {
          var $ = p !== "backwards" && p !== "unstable_legacy-backwards" ? re : f - 1 - re, ve = g[$];
          o.row = I = Kc(
            I
          ), o.treeContext = Wr(A, f, $);
          var Ne = G[$];
          typeof Ne == "number" ? (pc(i, o, Ne, ve, $), delete G[$]) : lr(i, o, ve, $), --I.pendingTasks === 0 && lt(i, I);
        }
      else
        for (G = 0; G < f; G++)
          re = p !== "backwards" && p !== "unstable_legacy-backwards" ? G : f - 1 - G, $ = g[re], o.row = I = Kc(I), o.treeContext = Wr(A, f, re), lr(i, o, $, re), --I.pendingTasks === 0 && lt(i, I);
    } else if (p !== "backwards" && p !== "unstable_legacy-backwards")
      for (p = 0; p < f; p++)
        G = g[p], o.row = I = Kc(I), o.treeContext = Wr(
          A,
          f,
          p
        ), lr(i, o, G, p), --I.pendingTasks === 0 && lt(i, I);
    else {
      for (p = o.blockedSegment, G = p.children.length, re = p.chunks.length, $ = f - 1; 0 <= $; $--) {
        ve = g[$], o.row = I = Kc(
          I
        ), o.treeContext = Wr(A, f, $), Ne = pl(
          i,
          re,
          null,
          o.formatContext,
          $ === 0 ? p.lastPushedText : !0,
          !0
        ), p.children.splice(G, 0, Ne), o.blockedSegment = Ne;
        try {
          lr(i, o, ve, $), vi(
            Ne.chunks,
            i.renderState,
            Ne.lastPushedText,
            Ne.textEmbedded
          ), Ne.status = 1, --I.pendingTasks === 0 && lt(i, I);
        } catch (on) {
          throw Ne.status = i.status === 12 ? 3 : 4, on;
        }
      }
      o.blockedSegment = p, p.lastPushedText = !1;
    }
    Q !== null && I !== null && 0 < I.pendingTasks && (Q.pendingTasks++, I.next = Q), o.treeContext = A, o.row = Q, o.keyPath = m;
  }
  function bc(i, o, f, g, p, m) {
    var A = o.thenableState;
    for (o.thenableState = null, bi = {}, So = o, Bi = i, _i = f, Qt = wi = 0, ua = -1, za = 0, pi = A, i = g(p, m); It; )
      It = !1, Qt = wi = 0, ua = -1, za = 0, Dt += 1, $e = null, i = g(p, m);
    return Ua(), i;
  }
  function Yi(i, o, f, g, p, m, A) {
    var Q = !1;
    if (m !== 0 && i.formState !== null) {
      var I = o.blockedSegment;
      if (I !== null) {
        Q = !0, I = I.chunks;
        for (var G = 0; G < m; G++)
          G === A ? I.push("<!--F!-->") : I.push("<!--F-->");
      }
    }
    m = o.keyPath, o.keyPath = f, p ? (f = o.treeContext, o.treeContext = Wr(f, 1, 0), lr(i, o, g, -1), o.treeContext = f) : Q ? lr(i, o, g, -1) : Xr(i, o, g, -1), o.keyPath = m;
  }
  function wc(i, o, f, g, p, m) {
    if (typeof g == "function")
      if (g.prototype && g.prototype.isReactComponent) {
        var A = p;
        if ("ref" in p) {
          A = {};
          for (var Q in p)
            Q !== "ref" && (A[Q] = p[Q]);
        }
        var I = g.defaultProps;
        if (I) {
          A === p && (A = Et({}, A, p));
          for (var G in I)
            A[G] === void 0 && (A[G] = I[G]);
        }
        p = A, A = Zt, I = g.contextType, typeof I == "object" && I !== null && (A = I._currentValue2), A = new g(p, A);
        var re = A.state !== void 0 ? A.state : null;
        if (A.updater = Su, A.props = p, A.state = re, I = { queue: [], replace: !1 }, A._reactInternals = I, m = g.contextType, A.context = typeof m == "object" && m !== null ? m._currentValue2 : Zt, m = g.getDerivedStateFromProps, typeof m == "function" && (m = m(p, re), re = m == null ? re : Et({}, re, m), A.state = re), typeof g.getDerivedStateFromProps != "function" && typeof A.getSnapshotBeforeUpdate != "function" && (typeof A.UNSAFE_componentWillMount == "function" || typeof A.componentWillMount == "function"))
          if (g = A.state, typeof A.componentWillMount == "function" && A.componentWillMount(), typeof A.UNSAFE_componentWillMount == "function" && A.UNSAFE_componentWillMount(), g !== A.state && Su.enqueueReplaceState(
            A,
            A.state,
            null
          ), I.queue !== null && 0 < I.queue.length)
            if (g = I.queue, m = I.replace, I.queue = null, I.replace = !1, m && g.length === 1)
              A.state = g[0];
            else {
              for (I = m ? g[0] : A.state, re = !0, m = m ? 1 : 0; m < g.length; m++)
                G = g[m], G = typeof G == "function" ? G.call(A, I, p, void 0) : G, G != null && (re ? (re = !1, I = Et({}, I, G)) : Et(I, G));
              A.state = I;
            }
          else I.queue = null;
        if (g = A.render(), i.status === 12) throw null;
        p = o.keyPath, o.keyPath = f, Xr(i, o, g, -1), o.keyPath = p;
      } else {
        if (g = bc(i, o, f, g, p, void 0), i.status === 12) throw null;
        Yi(
          i,
          o,
          f,
          g,
          wi !== 0,
          Qt,
          ua
        );
      }
    else if (typeof g == "string")
      if (A = o.blockedSegment, A === null)
        A = p.children, I = o.formatContext, re = o.keyPath, o.formatContext = Da(I, g, p), o.keyPath = f, lr(i, o, A, -1), o.formatContext = I, o.keyPath = re;
      else {
        if (re = ne(
          A.chunks,
          g,
          p,
          i.resumableState,
          i.renderState,
          o.blockedPreamble,
          o.hoistableState,
          o.formatContext,
          A.lastPushedText
        ), A.lastPushedText = !1, I = o.formatContext, m = o.keyPath, o.keyPath = f, (o.formatContext = Da(I, g, p)).insertionMode === 3) {
          f = pl(
            i,
            0,
            null,
            o.formatContext,
            !1,
            !1
          ), A.preambleChildren.push(f), o.blockedSegment = f;
          try {
            f.status = 6, lr(i, o, re, -1), vi(
              f.chunks,
              i.renderState,
              f.lastPushedText,
              f.textEmbedded
            ), f.status = 1;
          } finally {
            o.blockedSegment = A;
          }
        } else lr(i, o, re, -1);
        o.formatContext = I, o.keyPath = m;
        e: {
          switch (o = A.chunks, i = i.resumableState, g) {
            case "title":
            case "style":
            case "script":
            case "area":
            case "base":
            case "br":
            case "col":
            case "embed":
            case "hr":
            case "img":
            case "input":
            case "keygen":
            case "link":
            case "meta":
            case "param":
            case "source":
            case "track":
            case "wbr":
              break e;
            case "body":
              if (1 >= I.insertionMode) {
                i.hasBody = !0;
                break e;
              }
              break;
            case "html":
              if (I.insertionMode === 0) {
                i.hasHtml = !0;
                break e;
              }
              break;
            case "head":
              if (1 >= I.insertionMode) break e;
          }
          o.push(Fe(g));
        }
        A.lastPushedText = !1;
      }
    else {
      switch (g) {
        case tr:
        case Oe:
        case Tn:
        case be:
          g = o.keyPath, o.keyPath = f, Xr(i, o, p.children, -1), o.keyPath = g;
          return;
        case ft:
          g = o.blockedSegment, g === null ? p.mode !== "hidden" && (g = o.keyPath, o.keyPath = f, lr(i, o, p.children, -1), o.keyPath = g) : p.mode !== "hidden" && (i.renderState.generateStaticMarkup || g.chunks.push("<!--&-->"), g.lastPushedText = !1, A = o.keyPath, o.keyPath = f, lr(i, o, p.children, -1), o.keyPath = A, i.renderState.generateStaticMarkup || g.chunks.push("<!--/&-->"), g.lastPushedText = !1);
          return;
        case N:
          e: {
            if (g = p.children, p = p.revealOrder, p === "forwards" || p === "backwards" || p === "unstable_legacy-backwards") {
              if (Ie(g)) {
                jc(i, o, f, g, p);
                break e;
              }
              if ((A = Vn(g)) && (A = A.call(g))) {
                if (I = A.next(), !I.done) {
                  do
                    I = A.next();
                  while (!I.done);
                  jc(i, o, f, g, p);
                }
                break e;
              }
            }
            p === "together" ? (p = o.keyPath, A = o.row, I = o.row = Kc(null), I.boundaries = [], I.together = !0, o.keyPath = f, Xr(i, o, g, -1), --I.pendingTasks === 0 && lt(i, I), o.keyPath = p, o.row = A, A !== null && 0 < I.pendingTasks && (A.pendingTasks++, I.next = A)) : (p = o.keyPath, o.keyPath = f, Xr(i, o, g, -1), o.keyPath = p);
          }
          return;
        case Gl:
        case X:
          throw Error(W(343));
        case P:
          e: if (o.replay !== null) {
            g = o.keyPath, A = o.formatContext, I = o.row, o.keyPath = f, o.formatContext = xn(
              i.resumableState,
              A
            ), o.row = null, f = p.children;
            try {
              lr(i, o, f, -1);
            } finally {
              o.keyPath = g, o.formatContext = A, o.row = I;
            }
          } else {
            g = o.keyPath, m = o.formatContext;
            var $ = o.row, ve = o.blockedBoundary;
            G = o.blockedPreamble;
            var Ne = o.hoistableState;
            Q = o.blockedSegment;
            var on = p.fallback;
            p = p.children;
            var Ze = /* @__PURE__ */ new Set(), ze = vc(
              i,
              o.row,
              Ze,
              null,
              null
            );
            i.trackedPostpones !== null && (ze.trackedContentKeyPath = f);
            var je = pl(
              i,
              Q.chunks.length,
              ze,
              o.formatContext,
              !1,
              !1
            );
            Q.children.push(je), Q.lastPushedText = !1;
            var Xe = pl(
              i,
              0,
              null,
              o.formatContext,
              !1,
              !1
            );
            if (Xe.parentFlushed = !0, i.trackedPostpones !== null) {
              A = o.componentStack, I = [f[0], "Suspense Fallback", f[2]], re = [I[1], I[2], [], null], i.trackedPostpones.workingMap.set(I, re), ze.trackedFallbackNode = re, o.blockedSegment = je, o.blockedPreamble = ze.fallbackPreamble, o.keyPath = I, o.formatContext = mt(
                i.resumableState,
                m
              ), o.componentStack = rl(A), je.status = 6;
              try {
                lr(i, o, on, -1), vi(
                  je.chunks,
                  i.renderState,
                  je.lastPushedText,
                  je.textEmbedded
                ), je.status = 1;
              } catch (at) {
                throw je.status = i.status === 12 ? 3 : 4, at;
              } finally {
                o.blockedSegment = Q, o.blockedPreamble = G, o.keyPath = g, o.formatContext = m;
              }
              o = yc(
                i,
                null,
                p,
                -1,
                ze,
                Xe,
                ze.contentPreamble,
                ze.contentState,
                o.abortSet,
                f,
                xn(
                  i.resumableState,
                  o.formatContext
                ),
                o.context,
                o.treeContext,
                null,
                A
              ), Tl(o), i.pingedTasks.push(o);
            } else {
              o.blockedBoundary = ze, o.blockedPreamble = ze.contentPreamble, o.hoistableState = ze.contentState, o.blockedSegment = Xe, o.keyPath = f, o.formatContext = xn(
                i.resumableState,
                m
              ), o.row = null, Xe.status = 6;
              try {
                if (lr(i, o, p, -1), vi(
                  Xe.chunks,
                  i.renderState,
                  Xe.lastPushedText,
                  Xe.textEmbedded
                ), Xe.status = 1, fr(ze, Xe), ze.pendingTasks === 0 && ze.status === 0) {
                  if (ze.status = 1, !ga(i, ze)) {
                    $ !== null && --$.pendingTasks === 0 && lt(i, $), i.pendingRootTasks === 0 && o.blockedPreamble && Qa(i);
                    break e;
                  }
                } else
                  $ !== null && $.together && Vc(i, $);
              } catch (at) {
                ze.status = 4, i.status === 12 ? (Xe.status = 3, A = i.fatalError) : (Xe.status = 4, A = at), I = xl(o.componentStack), re = Gn(
                  i,
                  A,
                  I
                ), ze.errorDigest = re, Xa(i, ze);
              } finally {
                o.blockedBoundary = ve, o.blockedPreamble = G, o.hoistableState = Ne, o.blockedSegment = Q, o.keyPath = g, o.formatContext = m, o.row = $;
              }
              o = yc(
                i,
                null,
                on,
                -1,
                ve,
                je,
                ze.fallbackPreamble,
                ze.fallbackState,
                Ze,
                [f[0], "Suspense Fallback", f[2]],
                mt(
                  i.resumableState,
                  o.formatContext
                ),
                o.context,
                o.treeContext,
                o.row,
                rl(
                  o.componentStack
                )
              ), Tl(o), i.pingedTasks.push(o);
            }
          }
          return;
      }
      if (typeof g == "object" && g !== null)
        switch (g.$$typeof) {
          case He:
            if ("ref" in p)
              for (on in A = {}, p)
                on !== "ref" && (A[on] = p[on]);
            else A = p;
            g = bc(
              i,
              o,
              f,
              g.render,
              A,
              m
            ), Yi(
              i,
              o,
              f,
              g,
              wi !== 0,
              Qt,
              ua
            );
            return;
          case Pe:
            wc(i, o, f, g.type, p, m);
            return;
          case ie:
            if (I = p.children, A = o.keyPath, p = p.value, re = g._currentValue2, g._currentValue2 = p, m = mo, mo = g = {
              parent: m,
              depth: m === null ? 0 : m.depth + 1,
              context: g,
              parentValue: re,
              value: p
            }, o.context = g, o.keyPath = f, Xr(i, o, I, -1), i = mo, i === null) throw Error(W(403));
            i.context._currentValue2 = i.parentValue, i = mo = i.parent, o.context = i, o.keyPath = A;
            return;
          case Re:
            p = p.children, g = p(g._context._currentValue2), p = o.keyPath, o.keyPath = f, Xr(i, o, g, -1), o.keyPath = p;
            return;
          case ee:
            if (A = g._init, g = A(g._payload), i.status === 12) throw null;
            wc(i, o, f, g, p, m);
            return;
        }
      throw Error(
        W(130, g == null ? g : typeof g, "")
      );
    }
  }
  function pc(i, o, f, g, p) {
    var m = o.replay, A = o.blockedBoundary, Q = pl(
      i,
      0,
      null,
      o.formatContext,
      !1,
      !1
    );
    Q.id = f, Q.parentFlushed = !0;
    try {
      o.replay = null, o.blockedSegment = Q, lr(i, o, g, p), Q.status = 1, A === null ? i.completedRootSegment = Q : (fr(A, Q), A.parentFlushed && i.partialBoundaries.push(A));
    } finally {
      o.replay = m, o.blockedSegment = null;
    }
  }
  function Xr(i, o, f, g) {
    o.replay !== null && typeof o.replay.slots == "number" ? pc(i, o, o.replay.slots, f, g) : (o.node = f, o.childIndex = g, f = o.componentStack, Tl(o), it(i, o), o.componentStack = f);
  }
  function it(i, o) {
    var f = o.node, g = o.childIndex;
    if (f !== null) {
      if (typeof f == "object") {
        switch (f.$$typeof) {
          case ke:
            var p = f.type, m = f.key, A = f.props;
            f = A.ref;
            var Q = f !== void 0 ? f : null, I = uc(p), G = m ?? (g === -1 ? 0 : g);
            if (m = [o.keyPath, I, G], o.replay !== null)
              e: {
                var re = o.replay;
                for (g = re.nodes, f = 0; f < g.length; f++) {
                  var $ = g[f];
                  if (G === $[1]) {
                    if ($.length === 4) {
                      if (I !== null && I !== $[0])
                        throw Error(
                          W(490, $[0], I)
                        );
                      var ve = $[2];
                      I = $[3], G = o.node, o.replay = {
                        nodes: ve,
                        slots: I,
                        pendingTasks: 1
                      };
                      try {
                        if (wc(i, o, m, p, A, Q), o.replay.pendingTasks === 1 && 0 < o.replay.nodes.length)
                          throw Error(W(488));
                        o.replay.pendingTasks--;
                      } catch (Mn) {
                        if (typeof Mn == "object" && Mn !== null && (Mn === jn || typeof Mn.then == "function"))
                          throw o.node === G ? o.replay = re : g.splice(f, 1), Mn;
                        o.replay.pendingTasks--, A = xl(o.componentStack), m = i, i = o.blockedBoundary, p = Mn, A = Gn(m, p, A), ti(
                          m,
                          i,
                          ve,
                          I,
                          p,
                          A
                        );
                      }
                      o.replay = re;
                    } else {
                      if (p !== P)
                        throw Error(
                          W(
                            490,
                            "Suspense",
                            uc(p) || "Unknown"
                          )
                        );
                      n: {
                        re = void 0, p = $[5], Q = $[2], I = $[3], G = $[4] === null ? [] : $[4][2], $ = $[4] === null ? null : $[4][3];
                        var Ne = o.keyPath, on = o.formatContext, Ze = o.row, ze = o.replay, je = o.blockedBoundary, Xe = o.hoistableState, at = A.children, cn = A.fallback, wn = /* @__PURE__ */ new Set();
                        A = vc(
                          i,
                          o.row,
                          wn,
                          null,
                          null
                        ), A.parentFlushed = !0, A.rootSegmentID = p, o.blockedBoundary = A, o.hoistableState = A.contentState, o.keyPath = m, o.formatContext = xn(
                          i.resumableState,
                          on
                        ), o.row = null, o.replay = {
                          nodes: Q,
                          slots: I,
                          pendingTasks: 1
                        };
                        try {
                          if (lr(i, o, at, -1), o.replay.pendingTasks === 1 && 0 < o.replay.nodes.length)
                            throw Error(W(488));
                          if (o.replay.pendingTasks--, A.pendingTasks === 0 && A.status === 0) {
                            A.status = 1, i.completedBoundaries.push(A);
                            break n;
                          }
                        } catch (Mn) {
                          A.status = 4, ve = xl(o.componentStack), re = Gn(
                            i,
                            Mn,
                            ve
                          ), A.errorDigest = re, o.replay.pendingTasks--, i.clientRenderedBoundaries.push(A);
                        } finally {
                          o.blockedBoundary = je, o.hoistableState = Xe, o.replay = ze, o.keyPath = Ne, o.formatContext = on, o.row = Ze;
                        }
                        ve = Jc(
                          i,
                          null,
                          {
                            nodes: G,
                            slots: $,
                            pendingTasks: 0
                          },
                          cn,
                          -1,
                          je,
                          A.fallbackState,
                          wn,
                          [m[0], "Suspense Fallback", m[2]],
                          mt(
                            i.resumableState,
                            o.formatContext
                          ),
                          o.context,
                          o.treeContext,
                          o.row,
                          rl(
                            o.componentStack
                          )
                        ), Tl(ve), i.pingedTasks.push(ve);
                      }
                    }
                    g.splice(f, 1);
                    break e;
                  }
                }
              }
            else wc(i, o, m, p, A, Q);
            return;
          case nn:
            throw Error(W(257));
          case ee:
            if (ve = f._init, f = ve(f._payload), i.status === 12) throw null;
            Xr(i, o, f, g);
            return;
        }
        if (Ie(f)) {
          kn(i, o, f, g);
          return;
        }
        if ((ve = Vn(f)) && (ve = ve.call(f))) {
          if (f = ve.next(), !f.done) {
            A = [];
            do
              A.push(f.value), f = ve.next();
            while (!f.done);
            kn(i, o, A, g);
          }
          return;
        }
        if (typeof f.then == "function")
          return o.thenableState = null, Xr(i, o, Oo(f), g);
        if (f.$$typeof === ie)
          return Xr(
            i,
            o,
            f._currentValue2,
            g
          );
        throw g = Object.prototype.toString.call(f), Error(
          W(
            31,
            g === "[object Object]" ? "object with keys {" + Object.keys(f).join(", ") + "}" : g
          )
        );
      }
      typeof f == "string" ? (g = o.blockedSegment, g !== null && (g.lastPushedText = gi(
        g.chunks,
        f,
        i.renderState,
        g.lastPushedText
      ))) : (typeof f == "number" || typeof f == "bigint") && (g = o.blockedSegment, g !== null && (g.lastPushedText = gi(
        g.chunks,
        "" + f,
        i.renderState,
        g.lastPushedText
      )));
    }
  }
  function kn(i, o, f, g) {
    var p = o.keyPath;
    if (g !== -1 && (o.keyPath = [o.keyPath, "Fragment", g], o.replay !== null)) {
      for (var m = o.replay, A = m.nodes, Q = 0; Q < A.length; Q++) {
        var I = A[Q];
        if (I[1] === g) {
          g = I[2], I = I[3], o.replay = { nodes: g, slots: I, pendingTasks: 1 };
          try {
            if (kn(i, o, f, -1), o.replay.pendingTasks === 1 && 0 < o.replay.nodes.length)
              throw Error(W(488));
            o.replay.pendingTasks--;
          } catch ($) {
            if (typeof $ == "object" && $ !== null && ($ === jn || typeof $.then == "function"))
              throw $;
            o.replay.pendingTasks--, f = xl(o.componentStack);
            var G = o.blockedBoundary, re = $;
            f = Gn(i, re, f), ti(
              i,
              G,
              g,
              I,
              re,
              f
            );
          }
          o.replay = m, A.splice(Q, 1);
          break;
        }
      }
      o.keyPath = p;
      return;
    }
    if (m = o.treeContext, A = f.length, o.replay !== null && (Q = o.replay.slots, Q !== null && typeof Q == "object")) {
      for (g = 0; g < A; g++)
        I = f[g], o.treeContext = Wr(m, A, g), G = Q[g], typeof G == "number" ? (pc(i, o, G, I, g), delete Q[g]) : lr(i, o, I, g);
      o.treeContext = m, o.keyPath = p;
      return;
    }
    for (Q = 0; Q < A; Q++)
      g = f[Q], o.treeContext = Wr(m, A, Q), lr(i, o, g, Q);
    o.treeContext = m, o.keyPath = p;
  }
  function va(i, o, f) {
    if (f.status = 5, f.rootSegmentID = i.nextSegmentId++, i = f.trackedContentKeyPath, i === null) throw Error(W(486));
    var g = f.trackedFallbackNode, p = [], m = o.workingMap.get(i);
    return m === void 0 ? (f = [
      i[1],
      i[2],
      p,
      null,
      g,
      f.rootSegmentID
    ], o.workingMap.set(i, f), gt(f, i[0], o), f) : (m[4] = g, m[5] = f.rootSegmentID, m);
  }
  function Ga(i, o, f, g) {
    g.status = 5;
    var p = f.keyPath, m = f.blockedBoundary;
    if (m === null)
      g.id = i.nextSegmentId++, o.rootSlots = g.id, i.completedRootSegment !== null && (i.completedRootSegment.status = 5);
    else {
      if (m !== null && m.status === 0) {
        var A = va(
          i,
          o,
          m
        );
        if (m.trackedContentKeyPath === p && f.childIndex === -1) {
          g.id === -1 && (g.id = g.parentFlushed ? m.rootSegmentID : i.nextSegmentId++), A[3] = g.id;
          return;
        }
      }
      if (g.id === -1 && (g.id = g.parentFlushed && m !== null ? m.rootSegmentID : i.nextSegmentId++), f.childIndex === -1)
        p === null ? o.rootSlots = g.id : (f = o.workingMap.get(p), f === void 0 ? (f = [p[1], p[2], [], g.id], gt(f, p[0], o)) : f[3] = g.id);
      else {
        if (p === null) {
          if (i = o.rootSlots, i === null)
            i = o.rootSlots = {};
          else if (typeof i == "number")
            throw Error(W(491));
        } else if (m = o.workingMap, A = m.get(p), A === void 0)
          i = {}, A = [p[1], p[2], [], i], m.set(p, A), gt(A, p[0], o);
        else if (i = A[3], i === null)
          i = A[3] = {};
        else if (typeof i == "number")
          throw Error(W(491));
        i[f.childIndex] = g.id;
      }
    }
  }
  function Xa(i, o) {
    i = i.trackedPostpones, i !== null && (o = o.trackedContentKeyPath, o !== null && (o = i.workingMap.get(o), o !== void 0 && (o.length = 4, o[2] = [], o[3] = null)));
  }
  function ya(i, o, f) {
    return Jc(
      i,
      f,
      o.replay,
      o.node,
      o.childIndex,
      o.blockedBoundary,
      o.hoistableState,
      o.abortSet,
      o.keyPath,
      o.formatContext,
      o.context,
      o.treeContext,
      o.row,
      o.componentStack
    );
  }
  function Du(i, o, f) {
    var g = o.blockedSegment, p = pl(
      i,
      g.chunks.length,
      null,
      o.formatContext,
      g.lastPushedText,
      !0
    );
    return g.children.push(p), g.lastPushedText = !1, yc(
      i,
      f,
      o.node,
      o.childIndex,
      o.blockedBoundary,
      p,
      o.blockedPreamble,
      o.hoistableState,
      o.abortSet,
      o.keyPath,
      o.formatContext,
      o.context,
      o.treeContext,
      o.row,
      o.componentStack
    );
  }
  function lr(i, o, f, g) {
    var p = o.formatContext, m = o.context, A = o.keyPath, Q = o.treeContext, I = o.componentStack, G = o.blockedSegment;
    if (G === null) {
      G = o.replay;
      try {
        return Xr(i, o, f, g);
      } catch (ve) {
        if (Ua(), f = ve === jn ? jl() : ve, i.status !== 12 && typeof f == "object" && f !== null) {
          if (typeof f.then == "function") {
            g = ve === jn ? sa() : null, i = ya(i, o, g).ping, f.then(i, i), o.formatContext = p, o.context = m, o.keyPath = A, o.treeContext = Q, o.componentStack = I, o.replay = G, Kl(m);
            return;
          }
          if (f.message === "Maximum call stack size exceeded") {
            f = ve === jn ? sa() : null, f = ya(i, o, f), i.pingedTasks.push(f), o.formatContext = p, o.context = m, o.keyPath = A, o.treeContext = Q, o.componentStack = I, o.replay = G, Kl(m);
            return;
          }
        }
      }
    } else {
      var re = G.children.length, $ = G.chunks.length;
      try {
        return Xr(i, o, f, g);
      } catch (ve) {
        if (Ua(), G.children.length = re, G.chunks.length = $, f = ve === jn ? jl() : ve, i.status !== 12 && typeof f == "object" && f !== null) {
          if (typeof f.then == "function") {
            G = f, f = ve === jn ? sa() : null, i = Du(i, o, f).ping, G.then(i, i), o.formatContext = p, o.context = m, o.keyPath = A, o.treeContext = Q, o.componentStack = I, Kl(m);
            return;
          }
          if (f.message === "Maximum call stack size exceeded") {
            G = ve === jn ? sa() : null, G = Du(i, o, G), i.pingedTasks.push(G), o.formatContext = p, o.context = m, o.keyPath = A, o.treeContext = Q, o.componentStack = I, Kl(m);
            return;
          }
        }
      }
    }
    throw o.formatContext = p, o.context = m, o.keyPath = A, o.treeContext = Q, Kl(m), f;
  }
  function Rs(i) {
    var o = i.blockedBoundary, f = i.blockedSegment;
    f !== null && (f.status = 3, Gi(this, o, i.row, f));
  }
  function ti(i, o, f, g, p, m) {
    for (var A = 0; A < f.length; A++) {
      var Q = f[A];
      if (Q.length === 4)
        ti(
          i,
          o,
          Q[2],
          Q[3],
          p,
          m
        );
      else {
        Q = Q[5];
        var I = i, G = m, re = vc(
          I,
          null,
          /* @__PURE__ */ new Set(),
          null,
          null
        );
        re.parentFlushed = !0, re.rootSegmentID = Q, re.status = 4, re.errorDigest = G, re.parentFlushed && I.clientRenderedBoundaries.push(re);
      }
    }
    if (f.length = 0, g !== null) {
      if (o === null) throw Error(W(487));
      if (o.status !== 4 && (o.status = 4, o.errorDigest = m, o.parentFlushed && i.clientRenderedBoundaries.push(o)), typeof g == "object") for (var $ in g) delete g[$];
    }
  }
  function is(i, o, f) {
    var g = i.blockedBoundary, p = i.blockedSegment;
    if (p !== null) {
      if (p.status === 6) return;
      p.status = 3;
    }
    var m = xl(i.componentStack);
    if (g === null) {
      if (o.status !== 13 && o.status !== 14) {
        if (g = i.replay, g === null) {
          o.trackedPostpones !== null && p !== null ? (g = o.trackedPostpones, Gn(o, f, m), Ga(o, g, i, p), Gi(o, null, i.row, p)) : (Gn(o, f, m), El(o, f));
          return;
        }
        g.pendingTasks--, g.pendingTasks === 0 && 0 < g.nodes.length && (p = Gn(o, f, m), ti(
          o,
          null,
          g.nodes,
          g.slots,
          f,
          p
        )), o.pendingRootTasks--, o.pendingRootTasks === 0 && xi(o);
      }
    } else {
      var A = o.trackedPostpones;
      if (g.status !== 4) {
        if (A !== null && p !== null)
          return Gn(o, f, m), Ga(o, A, i, p), g.fallbackAbortableTasks.forEach(function(Q) {
            return is(Q, o, f);
          }), g.fallbackAbortableTasks.clear(), Gi(o, g, i.row, p);
        g.status = 4, p = Gn(o, f, m), g.status = 4, g.errorDigest = p, Xa(o, g), g.parentFlushed && o.clientRenderedBoundaries.push(g);
      }
      g.pendingTasks--, p = g.row, p !== null && --p.pendingTasks === 0 && lt(o, p), g.fallbackAbortableTasks.forEach(function(Q) {
        return is(Q, o, f);
      }), g.fallbackAbortableTasks.clear();
    }
    i = i.row, i !== null && --i.pendingTasks === 0 && lt(o, i), o.allPendingTasks--, o.allPendingTasks === 0 && Tc(o);
  }
  function Nu(i, o) {
    try {
      var f = i.renderState, g = f.onHeaders;
      if (g) {
        var p = f.headers;
        if (p) {
          f.headers = null;
          var m = p.preconnects;
          if (p.fontPreloads && (m && (m += ", "), m += p.fontPreloads), p.highImagePreloads && (m && (m += ", "), m += p.highImagePreloads), !o) {
            var A = f.styles.values(), Q = A.next();
            e: for (; 0 < p.remainingCapacity && !Q.done; Q = A.next())
              for (var I = Q.value.sheets.values(), G = I.next(); 0 < p.remainingCapacity && !G.done; G = I.next()) {
                var re = G.value, $ = re.props, ve = $.href, Ne = re.props, on = rt(Ne.href, "style", {
                  crossOrigin: Ne.crossOrigin,
                  integrity: Ne.integrity,
                  nonce: Ne.nonce,
                  type: Ne.type,
                  fetchPriority: Ne.fetchPriority,
                  referrerPolicy: Ne.referrerPolicy,
                  media: Ne.media
                });
                if (0 <= (p.remainingCapacity -= on.length + 2))
                  f.resets.style[ve] = Be, m && (m += ", "), m += on, f.resets.style[ve] = typeof $.crossOrigin == "string" || typeof $.integrity == "string" ? [$.crossOrigin, $.integrity] : Be;
                else break e;
              }
          }
          g(m ? { Link: m } : {});
        }
      }
    } catch (Ze) {
      Gn(i, Ze, {});
    }
  }
  function xi(i) {
    i.trackedPostpones === null && Nu(i, !0), i.trackedPostpones === null && Qa(i), i.onShellError = Kt, i = i.onShellReady, i();
  }
  function Tc(i) {
    Nu(
      i,
      i.trackedPostpones === null ? !0 : i.completedRootSegment === null || i.completedRootSegment.status !== 5
    ), Qa(i), i = i.onAllReady, i();
  }
  function fr(i, o) {
    if (o.chunks.length === 0 && o.children.length === 1 && o.children[0].boundary === null && o.children[0].id === -1) {
      var f = o.children[0];
      f.id = o.id, f.parentFlushed = !0, f.status !== 1 && f.status !== 3 && f.status !== 4 || fr(i, f);
    } else i.completedSegments.push(o);
  }
  function Gi(i, o, f, g) {
    if (f !== null && (--f.pendingTasks === 0 ? lt(i, f) : f.together && Vc(i, f)), i.allPendingTasks--, o === null) {
      if (g !== null && g.parentFlushed) {
        if (i.completedRootSegment !== null)
          throw Error(W(389));
        i.completedRootSegment = g;
      }
      i.pendingRootTasks--, i.pendingRootTasks === 0 && xi(i);
    } else if (o.pendingTasks--, o.status !== 4)
      if (o.pendingTasks === 0) {
        if (o.status === 0 && (o.status = 1), g !== null && g.parentFlushed && (g.status === 1 || g.status === 3) && fr(o, g), o.parentFlushed && i.completedBoundaries.push(o), o.status === 1)
          f = o.row, f !== null && Ro(f.hoistables, o.contentState), ga(i, o) || (o.fallbackAbortableTasks.forEach(Rs, i), o.fallbackAbortableTasks.clear(), f !== null && --f.pendingTasks === 0 && lt(i, f)), i.pendingRootTasks === 0 && i.trackedPostpones === null && o.contentPreamble !== null && Qa(i);
        else if (o.status === 5 && (o = o.row, o !== null)) {
          if (i.trackedPostpones !== null) {
            f = i.trackedPostpones;
            var p = o.next;
            if (p !== null && (g = p.boundaries, g !== null))
              for (p.boundaries = null, p = 0; p < g.length; p++) {
                var m = g[p];
                va(i, f, m), Gi(i, m, null, null);
              }
          }
          --o.pendingTasks === 0 && lt(i, o);
        }
      } else
        g === null || !g.parentFlushed || g.status !== 1 && g.status !== 3 || (fr(o, g), o.completedSegments.length === 1 && o.parentFlushed && i.partialBoundaries.push(o)), o = o.row, o !== null && o.together && Vc(i, o);
    i.allPendingTasks === 0 && Tc(i);
  }
  function as(i) {
    if (i.status !== 14 && i.status !== 13) {
      var o = mo, f = Y.H;
      Y.H = ls;
      var g = Y.A;
      Y.A = gc;
      var p = Nt;
      Nt = i;
      var m = fa;
      fa = i.resumableState;
      try {
        var A = i.pingedTasks, Q;
        for (Q = 0; Q < A.length; Q++) {
          var I = A[Q], G = i, re = I.blockedSegment;
          if (re === null) {
            var $ = G;
            if (I.replay.pendingTasks !== 0) {
              Kl(I.context);
              try {
                if (typeof I.replay.slots == "number" ? pc(
                  $,
                  I,
                  I.replay.slots,
                  I.node,
                  I.childIndex
                ) : it($, I), I.replay.pendingTasks === 1 && 0 < I.replay.nodes.length)
                  throw Error(W(488));
                I.replay.pendingTasks--, I.abortSet.delete(I), Gi(
                  $,
                  I.blockedBoundary,
                  I.row,
                  null
                );
              } catch (qe) {
                Ua();
                var ve = qe === jn ? jl() : qe;
                if (typeof ve == "object" && ve !== null && typeof ve.then == "function") {
                  var Ne = I.ping;
                  ve.then(Ne, Ne), I.thenableState = qe === jn ? sa() : null;
                } else {
                  I.replay.pendingTasks--, I.abortSet.delete(I);
                  var on = xl(I.componentStack);
                  G = void 0;
                  var Ze = $, ze = I.blockedBoundary, je = $.status === 12 ? $.fatalError : ve, Xe = I.replay.nodes, at = I.replay.slots;
                  G = Gn(
                    Ze,
                    je,
                    on
                  ), ti(
                    Ze,
                    ze,
                    Xe,
                    at,
                    je,
                    G
                  ), $.pendingRootTasks--, $.pendingRootTasks === 0 && xi($), $.allPendingTasks--, $.allPendingTasks === 0 && Tc($);
                }
              }
            }
          } else if ($ = void 0, Ze = re, Ze.status === 0) {
            Ze.status = 6, Kl(I.context);
            var cn = Ze.children.length, wn = Ze.chunks.length;
            try {
              it(G, I), vi(
                Ze.chunks,
                G.renderState,
                Ze.lastPushedText,
                Ze.textEmbedded
              ), I.abortSet.delete(I), Ze.status = 1, Gi(
                G,
                I.blockedBoundary,
                I.row,
                Ze
              );
            } catch (qe) {
              Ua(), Ze.children.length = cn, Ze.chunks.length = wn;
              var Mn = qe === jn ? jl() : G.status === 12 ? G.fatalError : qe;
              if (G.status === 12 && G.trackedPostpones !== null) {
                var en = G.trackedPostpones, vt = xl(I.componentStack);
                I.abortSet.delete(I), Gn(G, Mn, vt), Ga(G, en, I, Ze), Gi(
                  G,
                  I.blockedBoundary,
                  I.row,
                  Ze
                );
              } else if (typeof Mn == "object" && Mn !== null && typeof Mn.then == "function") {
                Ze.status = 0, I.thenableState = qe === jn ? sa() : null;
                var Sn = I.ping;
                Mn.then(Sn, Sn);
              } else {
                var Rr = xl(I.componentStack);
                I.abortSet.delete(I), Ze.status = 4;
                var Dn = I.blockedBoundary, En = I.row;
                if (En !== null && --En.pendingTasks === 0 && lt(G, En), G.allPendingTasks--, $ = Gn(
                  G,
                  Mn,
                  Rr
                ), Dn === null) El(G, Mn);
                else if (Dn.pendingTasks--, Dn.status !== 4) {
                  Dn.status = 4, Dn.errorDigest = $, Xa(G, Dn);
                  var An = Dn.row;
                  An !== null && --An.pendingTasks === 0 && lt(G, An), Dn.parentFlushed && G.clientRenderedBoundaries.push(Dn), G.pendingRootTasks === 0 && G.trackedPostpones === null && Dn.contentPreamble !== null && Qa(G);
                }
                G.allPendingTasks === 0 && Tc(G);
              }
            }
          }
        }
        A.splice(0, Q), i.destination !== null && $c(i, i.destination);
      } catch (qe) {
        Gn(i, qe, {}), El(i, qe);
      } finally {
        fa = m, Y.H = f, Y.A = g, f === ls && Kl(o), Nt = p;
      }
    }
  }
  function Za(i, o, f) {
    o.preambleChildren.length && f.push(o.preambleChildren);
    for (var g = !1, p = 0; p < o.children.length; p++)
      g = qc(
        i,
        o.children[p],
        f
      ) || g;
    return g;
  }
  function qc(i, o, f) {
    var g = o.boundary;
    if (g === null)
      return Za(
        i,
        o,
        f
      );
    var p = g.contentPreamble, m = g.fallbackPreamble;
    if (p === null || m === null) return !1;
    switch (g.status) {
      case 1:
        if (ln(i.renderState, p), i.byteSize += g.byteSize, o = g.completedSegments[0], !o) throw Error(W(391));
        return Za(
          i,
          o,
          f
        );
      case 5:
        if (i.trackedPostpones !== null) return !0;
      case 4:
        if (o.status === 1)
          return ln(i.renderState, m), Za(
            i,
            o,
            f
          );
      default:
        return !0;
    }
  }
  function Qa(i) {
    if (i.completedRootSegment && i.completedPreambleSegments === null) {
      var o = [], f = i.byteSize, g = qc(
        i,
        i.completedRootSegment,
        o
      ), p = i.renderState.preamble;
      g === !1 || p.headChunks && p.bodyChunks ? i.completedPreambleSegments = o : i.byteSize = f;
    }
  }
  function hr(i, o, f, g) {
    switch (f.parentFlushed = !0, f.status) {
      case 0:
        f.id = i.nextSegmentId++;
      case 5:
        return g = f.id, f.lastPushedText = !1, f.textEmbedded = !1, i = i.renderState, o.push('<template id="'), o.push(i.placeholderPrefix), i = g.toString(16), o.push(i), o.push('"></template>');
      case 1:
        f.status = 2;
        var p = !0, m = f.chunks, A = 0;
        f = f.children;
        for (var Q = 0; Q < f.length; Q++) {
          for (p = f[Q]; A < p.index; A++)
            o.push(m[A]);
          p = ba(i, o, p, g);
        }
        for (; A < m.length - 1; A++)
          o.push(m[A]);
        return A < m.length && (p = o.push(m[A])), p;
      case 3:
        return !0;
      default:
        throw Error(W(390));
    }
  }
  var ir = 0;
  function ba(i, o, f, g) {
    var p = f.boundary;
    if (p === null)
      return hr(i, o, f, g);
    if (p.parentFlushed = !0, p.status === 4) {
      var m = p.row;
      return m !== null && --m.pendingTasks === 0 && lt(i, m), i.renderState.generateStaticMarkup || (p = p.errorDigest, o.push("<!--$!-->"), o.push("<template"), p && (o.push(' data-dgst="'), p = he(p), o.push(p), o.push('"')), o.push("></template>")), hr(i, o, f, g), i = i.renderState.generateStaticMarkup ? !0 : o.push("<!--/$-->"), i;
    }
    if (p.status !== 1)
      return p.status === 0 && (p.rootSegmentID = i.nextSegmentId++), 0 < p.completedSegments.length && i.partialBoundaries.push(p), an(
        o,
        i.renderState,
        p.rootSegmentID
      ), g && Ro(g, p.fallbackState), hr(i, o, f, g), o.push("<!--/$-->");
    if (!Io && ga(i, p) && ir + p.byteSize > i.progressiveChunkSize)
      return p.rootSegmentID = i.nextSegmentId++, i.completedBoundaries.push(p), an(
        o,
        i.renderState,
        p.rootSegmentID
      ), hr(i, o, f, g), o.push("<!--/$-->");
    if (ir += p.byteSize, g && Ro(g, p.contentState), f = p.row, f !== null && ga(i, p) && --f.pendingTasks === 0 && lt(i, f), i.renderState.generateStaticMarkup || o.push("<!--$-->"), f = p.completedSegments, f.length !== 1) throw Error(W(391));
    return ba(i, o, f[0], g), i = i.renderState.generateStaticMarkup ? !0 : o.push("<!--/$-->"), i;
  }
  function qn(i, o, f, g) {
    return We(
      o,
      i.renderState,
      f.parentFormatContext,
      f.id
    ), ba(i, o, f, g), Jl(o, f.parentFormatContext);
  }
  function zn(i, o, f) {
    ir = f.byteSize;
    for (var g = f.completedSegments, p = 0; p < g.length; p++)
      Ja(
        i,
        o,
        f,
        g[p]
      );
    g.length = 0, g = f.row, g !== null && ga(i, f) && --g.pendingTasks === 0 && lt(i, g), lc(
      o,
      f.contentState,
      i.renderState
    ), g = i.resumableState, i = i.renderState, p = f.rootSegmentID, f = f.contentState;
    var m = i.stylesToHoist;
    return i.stylesToHoist = !1, o.push(i.startInlineScript), o.push(">"), m ? ((g.instructions & 4) === 0 && (g.instructions |= 4, o.push(
      '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};'
    )), (g.instructions & 2) === 0 && (g.instructions |= 2, o.push(
      `$RB=[];$RV=function(a){$RT=performance.now();for(var b=0;b<a.length;b+=2){var c=a[b],e=a[b+1];null!==e.parentNode&&e.parentNode.removeChild(e);var f=c.parentNode;if(f){var g=c.previousSibling,h=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d||"/&"===d)if(0===h)break;else h--;else"$"!==d&&"$?"!==d&&"$~"!==d&&"$!"!==d&&"&"!==d||h++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;e.firstChild;)f.insertBefore(e.firstChild,c);g.data="$";g._reactRetry&&requestAnimationFrame(g._reactRetry)}}a.length=0};
$RC=function(a,b){if(b=document.getElementById(b))(a=document.getElementById(a))?(a.previousSibling.data="$~",$RB.push(a,b),2===$RB.length&&("number"!==typeof $RT?requestAnimationFrame($RV.bind(null,$RB)):(a=performance.now(),setTimeout($RV.bind(null,$RB),2300>a&&2E3<a?2300-a:$RT+300-a)))):b.parentNode.removeChild(b)};`
    )), (g.instructions & 8) === 0 ? (g.instructions |= 8, o.push(
      `$RM=new Map;$RR=function(n,w,p){function u(q){this._p=null;q()}for(var r=new Map,t=document,h,b,e=t.querySelectorAll("link[data-precedence],style[data-precedence]"),v=[],k=0;b=e[k++];)"not all"===b.getAttribute("media")?v.push(b):("LINK"===b.tagName&&$RM.set(b.getAttribute("href"),b),r.set(b.dataset.precedence,h=b));e=0;b=[];var l,a;for(k=!0;;){if(k){var f=p[e++];if(!f){k=!1;e=0;continue}var c=!1,m=0;var d=f[m++];if(a=$RM.get(d)){var g=a._p;c=!0}else{a=t.createElement("link");a.href=d;a.rel=
"stylesheet";for(a.dataset.precedence=l=f[m++];g=f[m++];)a.setAttribute(g,f[m++]);g=a._p=new Promise(function(q,x){a.onload=u.bind(a,q);a.onerror=u.bind(a,x)});$RM.set(d,a)}d=a.getAttribute("media");!g||d&&!matchMedia(d).matches||b.push(g);if(c)continue}else{a=v[e++];if(!a)break;l=a.getAttribute("data-precedence");a.removeAttribute("media")}c=r.get(l)||h;c===h&&(h=a);r.set(l,a);c?c.parentNode.insertBefore(a,c.nextSibling):(c=t.head,c.insertBefore(a,c.firstChild))}if(p=document.getElementById(n))p.previousSibling.data=
"$~";Promise.all(b).then($RC.bind(null,n,w),$RX.bind(null,n,"CSS failed to load"))};$RR("`
    )) : o.push('$RR("')) : ((g.instructions & 2) === 0 && (g.instructions |= 2, o.push(
      `$RB=[];$RV=function(a){$RT=performance.now();for(var b=0;b<a.length;b+=2){var c=a[b],e=a[b+1];null!==e.parentNode&&e.parentNode.removeChild(e);var f=c.parentNode;if(f){var g=c.previousSibling,h=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d||"/&"===d)if(0===h)break;else h--;else"$"!==d&&"$?"!==d&&"$~"!==d&&"$!"!==d&&"&"!==d||h++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;e.firstChild;)f.insertBefore(e.firstChild,c);g.data="$";g._reactRetry&&requestAnimationFrame(g._reactRetry)}}a.length=0};
$RC=function(a,b){if(b=document.getElementById(b))(a=document.getElementById(a))?(a.previousSibling.data="$~",$RB.push(a,b),2===$RB.length&&("number"!==typeof $RT?requestAnimationFrame($RV.bind(null,$RB)):(a=performance.now(),setTimeout($RV.bind(null,$RB),2300>a&&2E3<a?2300-a:$RT+300-a)))):b.parentNode.removeChild(b)};`
    )), o.push('$RC("')), g = p.toString(16), o.push(i.boundaryPrefix), o.push(g), o.push('","'), o.push(i.segmentPrefix), o.push(g), m ? (o.push('",'), di(o, f)) : o.push('"'), f = o.push(")<\/script>"), Ke(o, i) && f;
  }
  function Ja(i, o, f, g) {
    if (g.status === 2) return !0;
    var p = f.contentState, m = g.id;
    if (m === -1) {
      if ((g.id = f.rootSegmentID) === -1)
        throw Error(W(392));
      return qn(i, o, g, p);
    }
    return m === f.rootSegmentID ? qn(i, o, g, p) : (qn(i, o, g, p), f = i.resumableState, i = i.renderState, o.push(i.startInlineScript), o.push(">"), (f.instructions & 1) === 0 ? (f.instructions |= 1, o.push(
      '$RS=function(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};$RS("'
    )) : o.push('$RS("'), o.push(i.segmentPrefix), m = m.toString(16), o.push(m), o.push('","'), o.push(i.placeholderPrefix), o.push(m), o = o.push('")<\/script>'), o);
  }
  var Io = !1;
  function $c(i, o) {
    try {
      if (!(0 < i.pendingRootTasks)) {
        var f, g = i.completedRootSegment;
        if (g !== null) {
          if (g.status === 5) return;
          var p = i.completedPreambleSegments;
          if (p === null) return;
          ir = i.byteSize;
          var m = i.resumableState, A = i.renderState, Q = A.preamble, I = Q.htmlChunks, G = Q.headChunks, re;
          if (I) {
            for (re = 0; re < I.length; re++)
              o.push(I[re]);
            if (G)
              for (re = 0; re < G.length; re++)
                o.push(G[re]);
            else {
              var $ = L("head");
              o.push($), o.push(">");
            }
          } else if (G)
            for (re = 0; re < G.length; re++)
              o.push(G[re]);
          var ve = A.charsetChunks;
          for (re = 0; re < ve.length; re++)
            o.push(ve[re]);
          ve.length = 0, A.preconnects.forEach(bl, o), A.preconnects.clear();
          var Ne = A.viewportChunks;
          for (re = 0; re < Ne.length; re++)
            o.push(Ne[re]);
          Ne.length = 0, A.fontPreloads.forEach(bl, o), A.fontPreloads.clear(), A.highImagePreloads.forEach(bl, o), A.highImagePreloads.clear(), Se = A, A.styles.forEach(dn, o), Se = null;
          var on = A.importMapChunks;
          for (re = 0; re < on.length; re++)
            o.push(on[re]);
          on.length = 0, A.bootstrapScripts.forEach(bl, o), A.scripts.forEach(bl, o), A.scripts.clear(), A.bulkPreloads.forEach(bl, o), A.bulkPreloads.clear(), m.instructions |= 32;
          var Ze = A.hoistableChunks;
          for (re = 0; re < Ze.length; re++)
            o.push(Ze[re]);
          for (m = Ze.length = 0; m < p.length; m++) {
            var ze = p[m];
            for (A = 0; A < ze.length; A++)
              ba(i, o, ze[A], null);
          }
          var je = i.renderState.preamble, Xe = je.headChunks;
          if (je.htmlChunks || Xe) {
            var at = Fe("head");
            o.push(at);
          }
          var cn = je.bodyChunks;
          if (cn)
            for (p = 0; p < cn.length; p++)
              o.push(cn[p]);
          ba(i, o, g, null), i.completedRootSegment = null;
          var wn = i.renderState;
          if (i.allPendingTasks !== 0 || i.clientRenderedBoundaries.length !== 0 || i.completedBoundaries.length !== 0 || i.trackedPostpones !== null && (i.trackedPostpones.rootNodes.length !== 0 || i.trackedPostpones.rootSlots !== null)) {
            var Mn = i.resumableState;
            if ((Mn.instructions & 64) === 0) {
              if (Mn.instructions |= 64, o.push(wn.startInlineScript), (Mn.instructions & 32) === 0) {
                Mn.instructions |= 32;
                var en = "_" + Mn.idPrefix + "R_";
                o.push(' id="');
                var vt = he(en);
                o.push(vt), o.push('"');
              }
              o.push(">"), o.push(
                "requestAnimationFrame(function(){$RT=performance.now()});"
              ), o.push("<\/script>");
            }
          }
          Ke(o, wn);
        }
        var Sn = i.renderState;
        g = 0;
        var Rr = Sn.viewportChunks;
        for (g = 0; g < Rr.length; g++)
          o.push(Rr[g]);
        Rr.length = 0, Sn.preconnects.forEach(bl, o), Sn.preconnects.clear(), Sn.fontPreloads.forEach(bl, o), Sn.fontPreloads.clear(), Sn.highImagePreloads.forEach(
          bl,
          o
        ), Sn.highImagePreloads.clear(), Sn.styles.forEach(ac, o), Sn.scripts.forEach(bl, o), Sn.scripts.clear(), Sn.bulkPreloads.forEach(bl, o), Sn.bulkPreloads.clear();
        var Dn = Sn.hoistableChunks;
        for (g = 0; g < Dn.length; g++)
          o.push(Dn[g]);
        Dn.length = 0;
        var En = i.clientRenderedBoundaries;
        for (f = 0; f < En.length; f++) {
          var An = En[f];
          Sn = o;
          var qe = i.resumableState, Pn = i.renderState, qt = An.rootSegmentID, sn = An.errorDigest;
          Sn.push(Pn.startInlineScript), Sn.push(">"), (qe.instructions & 4) === 0 ? (qe.instructions |= 4, Sn.push(
            '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};;$RX("'
          )) : Sn.push('$RX("'), Sn.push(Pn.boundaryPrefix);
          var wa = qt.toString(16);
          if (Sn.push(wa), Sn.push('"'), sn) {
            Sn.push(",");
            var Zi = dt(
              sn || ""
            );
            Sn.push(Zi);
          }
          var Cr = Sn.push(")<\/script>");
          if (!Cr) {
            i.destination = null, f++, En.splice(0, f);
            return;
          }
        }
        En.splice(0, f);
        var Al = i.completedBoundaries;
        for (f = 0; f < Al.length; f++)
          if (!zn(i, o, Al[f])) {
            i.destination = null, f++, Al.splice(0, f);
            return;
          }
        Al.splice(0, f), Io = !0;
        var Pl = i.partialBoundaries;
        for (f = 0; f < Pl.length; f++) {
          var Fl = Pl[f];
          e: {
            En = i, An = o, ir = Fl.byteSize;
            var Ei = Fl.completedSegments;
            for (Cr = 0; Cr < Ei.length; Cr++)
              if (!Ja(
                En,
                An,
                Fl,
                Ei[Cr]
              )) {
                Cr++, Ei.splice(0, Cr);
                var Qi = !1;
                break e;
              }
            Ei.splice(0, Cr);
            var Jt = Fl.row;
            Jt !== null && Jt.together && Fl.pendingTasks === 1 && (Jt.pendingTasks === 1 ? ni(
              En,
              Jt,
              Jt.hoistables
            ) : Jt.pendingTasks--), Qi = lc(
              An,
              Fl.contentState,
              En.renderState
            );
          }
          if (!Qi) {
            i.destination = null, f++, Pl.splice(0, f);
            return;
          }
        }
        Pl.splice(0, f), Io = !1;
        var Va = i.completedBoundaries;
        for (f = 0; f < Va.length; f++)
          if (!zn(i, o, Va[f])) {
            i.destination = null, f++, Va.splice(0, f);
            return;
          }
        Va.splice(0, f);
      }
    } finally {
      Io = !1, i.allPendingTasks === 0 && i.clientRenderedBoundaries.length === 0 && i.completedBoundaries.length === 0 && (i.flushScheduled = !1, f = i.resumableState, f.hasBody && (Pl = Fe("body"), o.push(Pl)), f.hasHtml && (f = Fe("html"), o.push(f)), i.status = 14, o.push(null), i.destination = null);
    }
  }
  function Do(i) {
    if (i.flushScheduled === !1 && i.pingedTasks.length === 0 && i.destination !== null) {
      i.flushScheduled = !0;
      var o = i.destination;
      o ? $c(i, o) : i.flushScheduled = !1;
    }
  }
  function Lu(i, o) {
    if (i.status === 13)
      i.status = 14, o.destroy(i.fatalError);
    else if (i.status !== 14 && i.destination === null) {
      i.destination = o;
      try {
        $c(i, o);
      } catch (f) {
        Gn(i, f, {}), El(i, f);
      }
    }
  }
  function Cs(i, o) {
    (i.status === 11 || i.status === 10) && (i.status = 12);
    try {
      var f = i.abortableTasks;
      if (0 < f.size) {
        var g = o === void 0 ? Error(W(432)) : typeof o == "object" && o !== null && typeof o.then == "function" ? Error(W(530)) : o;
        i.fatalError = g, f.forEach(function(p) {
          return is(p, i, g);
        }), f.clear();
      }
      i.destination !== null && $c(i, i.destination);
    } catch (p) {
      Gn(i, p, {}), El(i, p);
    }
  }
  function gt(i, o, f) {
    if (o === null) f.rootNodes.push(i);
    else {
      var g = f.workingMap, p = g.get(o);
      p === void 0 && (p = [o[1], o[2], [], null], g.set(o, p), gt(p, o[0], f)), p[2].push(i);
    }
  }
  function Xi() {
  }
  function os(i, o, f, g) {
    var p = !1, m = null, A = "", Q = !1;
    if (o = tt(o ? o.identifierPrefix : void 0), i = Ya(
      i,
      o,
      Co(o, f),
      Ct(0, null, 0, null),
      1 / 0,
      Xi,
      void 0,
      function() {
        Q = !0;
      },
      void 0,
      void 0,
      void 0
    ), i.flushScheduled = i.destination !== null, as(i), i.status === 10 && (i.status = 11), i.trackedPostpones === null && Nu(i, i.pendingRootTasks === 0), Cs(i, g), Lu(i, {
      push: function(I) {
        return I !== null && (A += I), !0;
      },
      destroy: function(I) {
        p = !0, m = I;
      }
    }), p && m !== g) throw m;
    if (!Q) throw Error(W(426));
    return A;
  }
  return rf.renderToStaticMarkup = function(i, o) {
    return os(
      i,
      o,
      !0,
      'The server used "renderToStaticMarkup" which does not support Suspense. If you intended to have the server wait for the suspended component please switch to "renderToReadableStream" which supports Suspense on the server'
    );
  }, rf.renderToString = function(i, o) {
    return os(
      i,
      o,
      !1,
      'The server used "renderToString" which does not support Suspense. If you intended for this Suspense boundary to render the fallback content on the server consider throwing an Error somewhere within the Suspense boundary. If you intended to have the server wait for the suspended component please switch to "renderToReadableStream" which supports Suspense on the server'
    );
  }, rf.version = "19.2.6", rf;
}
var Ys = {};
var Gf;
function ah() {
  if (Gf) return Ys;
  Gf = 1;
  var de = Ms(), ue = yf();
  function W(l) {
    var a = "https://react.dev/errors/" + l;
    if (1 < arguments.length) {
      a += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var s = 2; s < arguments.length; s++)
        a += "&args[]=" + encodeURIComponent(arguments[s]);
    }
    return "Minified React error #" + l + "; visit " + a + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  var ke = /* @__PURE__ */ Symbol.for("react.transitional.element"), nn = /* @__PURE__ */ Symbol.for("react.portal"), be = /* @__PURE__ */ Symbol.for("react.fragment"), Oe = /* @__PURE__ */ Symbol.for("react.strict_mode"), Tn = /* @__PURE__ */ Symbol.for("react.profiler"), Re = /* @__PURE__ */ Symbol.for("react.consumer"), ie = /* @__PURE__ */ Symbol.for("react.context"), He = /* @__PURE__ */ Symbol.for("react.forward_ref"), P = /* @__PURE__ */ Symbol.for("react.suspense"), N = /* @__PURE__ */ Symbol.for("react.suspense_list"), Pe = /* @__PURE__ */ Symbol.for("react.memo"), ee = /* @__PURE__ */ Symbol.for("react.lazy"), X = /* @__PURE__ */ Symbol.for("react.scope"), ft = /* @__PURE__ */ Symbol.for("react.activity"), tr = /* @__PURE__ */ Symbol.for("react.legacy_hidden"), Yt = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), Gl = /* @__PURE__ */ Symbol.for("react.view_transition"), Hr = Symbol.iterator;
  function Vn(l) {
    return l === null || typeof l != "object" ? null : (l = Hr && l[Hr] || l["@@iterator"], typeof l == "function" ? l : null);
  }
  var Ie = Array.isArray;
  function Ve(l, a) {
    var s = l.length & 3, v = l.length - s, w = a;
    for (a = 0; a < v; ) {
      var C = l.charCodeAt(a) & 255 | (l.charCodeAt(++a) & 255) << 8 | (l.charCodeAt(++a) & 255) << 16 | (l.charCodeAt(++a) & 255) << 24;
      ++a, C = 3432918353 * (C & 65535) + ((3432918353 * (C >>> 16) & 65535) << 16) & 4294967295, C = C << 15 | C >>> 17, C = 461845907 * (C & 65535) + ((461845907 * (C >>> 16) & 65535) << 16) & 4294967295, w ^= C, w = w << 13 | w >>> 19, w = 5 * (w & 65535) + ((5 * (w >>> 16) & 65535) << 16) & 4294967295, w = (w & 65535) + 27492 + (((w >>> 16) + 58964 & 65535) << 16);
    }
    switch (C = 0, s) {
      case 3:
        C ^= (l.charCodeAt(a + 2) & 255) << 16;
      case 2:
        C ^= (l.charCodeAt(a + 1) & 255) << 8;
      case 1:
        C ^= l.charCodeAt(a) & 255, C = 3432918353 * (C & 65535) + ((3432918353 * (C >>> 16) & 65535) << 16) & 4294967295, C = C << 15 | C >>> 17, w ^= 461845907 * (C & 65535) + ((461845907 * (C >>> 16) & 65535) << 16) & 4294967295;
    }
    return w ^= l.length, w ^= w >>> 16, w = 2246822507 * (w & 65535) + ((2246822507 * (w >>> 16) & 65535) << 16) & 4294967295, w ^= w >>> 13, w = 3266489909 * (w & 65535) + ((3266489909 * (w >>> 16) & 65535) << 16) & 4294967295, (w ^ w >>> 16) >>> 0;
  }
  var Et = new MessageChannel(), rn = [];
  Et.port1.onmessage = function() {
    var l = rn.shift();
    l && l();
  };
  function Kn(l) {
    rn.push(l), Et.port2.postMessage(null);
  }
  function si(l) {
    setTimeout(function() {
      throw l;
    });
  }
  var Ln = Promise, qr = typeof queueMicrotask == "function" ? queueMicrotask : function(l) {
    Ln.resolve(null).then(l).catch(si);
  }, nt = null, Ae = 0;
  function J(l, a) {
    if (a.byteLength !== 0)
      if (2048 < a.byteLength)
        0 < Ae && (l.enqueue(
          new Uint8Array(nt.buffer, 0, Ae)
        ), nt = new Uint8Array(2048), Ae = 0), l.enqueue(a);
      else {
        var s = nt.length - Ae;
        s < a.byteLength && (s === 0 ? l.enqueue(nt) : (nt.set(a.subarray(0, s), Ae), l.enqueue(nt), a = a.subarray(s)), nt = new Uint8Array(2048), Ae = 0), nt.set(a, Ae), Ae += a.byteLength;
      }
  }
  function he(l, a) {
    return J(l, a), !0;
  }
  function Tr(l) {
    nt && 0 < Ae && (l.enqueue(new Uint8Array(nt.buffer, 0, Ae)), nt = null, Ae = 0);
  }
  var vl = new TextEncoder();
  function fe(l) {
    return vl.encode(l);
  }
  function T(l) {
    return vl.encode(l);
  }
  function Y(l) {
    return l.byteLength;
  }
  function we(l, a) {
    typeof l.error == "function" ? l.error(a) : l.close();
  }
  var Te = Object.assign, me = Object.prototype.hasOwnProperty, Be = RegExp(
    "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
  ), Se = {}, Rt = {};
  function Rn(l) {
    return me.call(Rt, l) ? !0 : me.call(Se, l) ? !1 : Be.test(l) ? Rt[l] = !0 : (Se[l] = !0, !1);
  }
  var tt = new Set(
    "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
      " "
    )
  ), Ct = /* @__PURE__ */ new Map([
    ["acceptCharset", "accept-charset"],
    ["htmlFor", "for"],
    ["httpEquiv", "http-equiv"],
    ["crossOrigin", "crossorigin"],
    ["accentHeight", "accent-height"],
    ["alignmentBaseline", "alignment-baseline"],
    ["arabicForm", "arabic-form"],
    ["baselineShift", "baseline-shift"],
    ["capHeight", "cap-height"],
    ["clipPath", "clip-path"],
    ["clipRule", "clip-rule"],
    ["colorInterpolation", "color-interpolation"],
    ["colorInterpolationFilters", "color-interpolation-filters"],
    ["colorProfile", "color-profile"],
    ["colorRendering", "color-rendering"],
    ["dominantBaseline", "dominant-baseline"],
    ["enableBackground", "enable-background"],
    ["fillOpacity", "fill-opacity"],
    ["fillRule", "fill-rule"],
    ["floodColor", "flood-color"],
    ["floodOpacity", "flood-opacity"],
    ["fontFamily", "font-family"],
    ["fontSize", "font-size"],
    ["fontSizeAdjust", "font-size-adjust"],
    ["fontStretch", "font-stretch"],
    ["fontStyle", "font-style"],
    ["fontVariant", "font-variant"],
    ["fontWeight", "font-weight"],
    ["glyphName", "glyph-name"],
    ["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
    ["glyphOrientationVertical", "glyph-orientation-vertical"],
    ["horizAdvX", "horiz-adv-x"],
    ["horizOriginX", "horiz-origin-x"],
    ["imageRendering", "image-rendering"],
    ["letterSpacing", "letter-spacing"],
    ["lightingColor", "lighting-color"],
    ["markerEnd", "marker-end"],
    ["markerMid", "marker-mid"],
    ["markerStart", "marker-start"],
    ["overlinePosition", "overline-position"],
    ["overlineThickness", "overline-thickness"],
    ["paintOrder", "paint-order"],
    ["panose-1", "panose-1"],
    ["pointerEvents", "pointer-events"],
    ["renderingIntent", "rendering-intent"],
    ["shapeRendering", "shape-rendering"],
    ["stopColor", "stop-color"],
    ["stopOpacity", "stop-opacity"],
    ["strikethroughPosition", "strikethrough-position"],
    ["strikethroughThickness", "strikethrough-thickness"],
    ["strokeDasharray", "stroke-dasharray"],
    ["strokeDashoffset", "stroke-dashoffset"],
    ["strokeLinecap", "stroke-linecap"],
    ["strokeLinejoin", "stroke-linejoin"],
    ["strokeMiterlimit", "stroke-miterlimit"],
    ["strokeOpacity", "stroke-opacity"],
    ["strokeWidth", "stroke-width"],
    ["textAnchor", "text-anchor"],
    ["textDecoration", "text-decoration"],
    ["textRendering", "text-rendering"],
    ["transformOrigin", "transform-origin"],
    ["underlinePosition", "underline-position"],
    ["underlineThickness", "underline-thickness"],
    ["unicodeBidi", "unicode-bidi"],
    ["unicodeRange", "unicode-range"],
    ["unitsPerEm", "units-per-em"],
    ["vAlphabetic", "v-alphabetic"],
    ["vHanging", "v-hanging"],
    ["vIdeographic", "v-ideographic"],
    ["vMathematical", "v-mathematical"],
    ["vectorEffect", "vector-effect"],
    ["vertAdvY", "vert-adv-y"],
    ["vertOriginX", "vert-origin-x"],
    ["vertOriginY", "vert-origin-y"],
    ["wordSpacing", "word-spacing"],
    ["writingMode", "writing-mode"],
    ["xmlnsXlink", "xmlns:xlink"],
    ["xHeight", "x-height"]
  ]), Da = /["'&<>]/;
  function Ge(l) {
    if (typeof l == "boolean" || typeof l == "number" || typeof l == "bigint")
      return "" + l;
    l = "" + l;
    var a = Da.exec(l);
    if (a) {
      var s = "", v, w = 0;
      for (v = a.index; v < l.length; v++) {
        switch (l.charCodeAt(v)) {
          case 34:
            a = "&quot;";
            break;
          case 38:
            a = "&amp;";
            break;
          case 39:
            a = "&#x27;";
            break;
          case 60:
            a = "&lt;";
            break;
          case 62:
            a = "&gt;";
            break;
          default:
            continue;
        }
        w !== v && (s += l.slice(w, v)), w = v + 1, s += a;
      }
      l = w !== v ? s + l.slice(w, v) : s;
    }
    return l;
  }
  var mt = /([A-Z])/g, xn = /^ms-/, St = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function Gt(l) {
    return St.test("" + l) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : l;
  }
  var Xl = de.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Xt = ue.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, De = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, xr = Xt.d;
  Xt.d = {
    f: xr.f,
    r: xr.r,
    D: is,
    C: Nu,
    L: xi,
    m: Tc,
    X: Gi,
    S: fr,
    M: as
  };
  var At = [], $r = null;
  T('"></template>');
  var Na = T("<script"), vn = T("<\/script>"), rr = T('<script src="'), Bn = T('<script type="module" src="'), rc = T(' nonce="'), ht = T(' integrity="'), To = T(' crossorigin="'), xo = T(' async=""><\/script>'), el = T("<style"), aa = /(<\/|<)(s)(cript)/gi;
  function fi(l, a, s, v) {
    return "" + a + (s === "s" ? "\\u0073" : "\\u0053") + v;
  }
  var Zl = T(
    '<script type="importmap">'
  ), Ql = T("<\/script>");
  function yl(l, a, s, v, w, C) {
    s = typeof a == "string" ? a : a && a.script;
    var k = s === void 0 ? Na : T(
      '<script nonce="' + Ge(s) + '"'
    ), _ = typeof a == "string" ? void 0 : a && a.style, O = _ === void 0 ? el : T(
      '<style nonce="' + Ge(_) + '"'
    ), z = l.idPrefix, Z = [], K = l.bootstrapScriptContent, xe = l.bootstrapScripts, pe = l.bootstrapModules;
    if (K !== void 0 && (Z.push(k), va(Z, l), Z.push(
      mn,
      fe(
        ("" + K).replace(aa, fi)
      ),
      vn
    )), K = [], v !== void 0 && (K.push(Zl), K.push(
      fe(
        ("" + JSON.stringify(v)).replace(aa, fi)
      )
    ), K.push(Ql)), v = w ? {
      preconnects: "",
      fontPreloads: "",
      highImagePreloads: "",
      remainingCapacity: 2 + (typeof C == "number" ? C : 2e3)
    } : null, w = {
      placeholderPrefix: T(z + "P:"),
      segmentPrefix: T(z + "S:"),
      boundaryPrefix: T(z + "B:"),
      startInlineScript: k,
      startInlineStyle: O,
      preamble: L(),
      externalRuntimeScript: null,
      bootstrapChunks: Z,
      importMapChunks: K,
      onHeaders: w,
      headers: v,
      resets: {
        font: {},
        dns: {},
        connect: { default: {}, anonymous: {}, credentials: {} },
        image: {},
        style: {}
      },
      charsetChunks: [],
      viewportChunks: [],
      hoistableChunks: [],
      preconnects: /* @__PURE__ */ new Set(),
      fontPreloads: /* @__PURE__ */ new Set(),
      highImagePreloads: /* @__PURE__ */ new Set(),
      styles: /* @__PURE__ */ new Map(),
      bootstrapScripts: /* @__PURE__ */ new Set(),
      scripts: /* @__PURE__ */ new Set(),
      bulkPreloads: /* @__PURE__ */ new Set(),
      preloads: {
        images: /* @__PURE__ */ new Map(),
        stylesheets: /* @__PURE__ */ new Map(),
        scripts: /* @__PURE__ */ new Map(),
        moduleScripts: /* @__PURE__ */ new Map()
      },
      nonce: { script: s, style: _ },
      hoistableState: null,
      stylesToHoist: !1
    }, xe !== void 0)
      for (v = 0; v < xe.length; v++)
        z = xe[v], _ = k = void 0, O = {
          rel: "preload",
          as: "script",
          fetchPriority: "low",
          nonce: a
        }, typeof z == "string" ? O.href = C = z : (O.href = C = z.src, O.integrity = _ = typeof z.integrity == "string" ? z.integrity : void 0, O.crossOrigin = k = typeof z == "string" || z.crossOrigin == null ? void 0 : z.crossOrigin === "use-credentials" ? "use-credentials" : ""), z = l, K = C, z.scriptResources[K] = null, z.moduleScriptResources[K] = null, z = [], rt(z, O), w.bootstrapScripts.add(z), Z.push(
          rr,
          fe(Ge(C)),
          Yn
        ), s && Z.push(
          rc,
          fe(Ge(s)),
          Yn
        ), typeof _ == "string" && Z.push(
          ht,
          fe(Ge(_)),
          Yn
        ), typeof k == "string" && Z.push(
          To,
          fe(Ge(k)),
          Yn
        ), va(Z, l), Z.push(xo);
    if (pe !== void 0)
      for (a = 0; a < pe.length; a++)
        _ = pe[a], C = v = void 0, k = {
          rel: "modulepreload",
          fetchPriority: "low",
          nonce: s
        }, typeof _ == "string" ? k.href = xe = _ : (k.href = xe = _.src, k.integrity = C = typeof _.integrity == "string" ? _.integrity : void 0, k.crossOrigin = v = typeof _ == "string" || _.crossOrigin == null ? void 0 : _.crossOrigin === "use-credentials" ? "use-credentials" : ""), _ = l, O = xe, _.scriptResources[O] = null, _.moduleScriptResources[O] = null, _ = [], rt(_, k), w.bootstrapScripts.add(_), Z.push(
          Bn,
          fe(Ge(xe)),
          Yn
        ), s && Z.push(
          rc,
          fe(Ge(s)),
          Yn
        ), typeof C == "string" && Z.push(
          ht,
          fe(Ge(C)),
          Yn
        ), typeof v == "string" && Z.push(
          To,
          fe(Ge(v)),
          Yn
        ), va(Z, l), Z.push(xo);
    return w;
  }
  function R(l, a, s, v, w) {
    return {
      idPrefix: l === void 0 ? "" : l,
      nextFormID: 0,
      streamingFormat: 0,
      bootstrapScriptContent: s,
      bootstrapScripts: v,
      bootstrapModules: w,
      instructions: 0,
      hasBody: !1,
      hasHtml: !1,
      unknownResources: {},
      dnsResources: {},
      connectResources: { default: {}, anonymous: {}, credentials: {} },
      imageResources: {},
      styleResources: {},
      scriptResources: {},
      moduleUnknownResources: {},
      moduleScriptResources: {}
    };
  }
  function L() {
    return { htmlChunks: null, headChunks: null, bodyChunks: null };
  }
  function ne(l, a, s, v) {
    return {
      insertionMode: l,
      selectedValue: a,
      tagScope: s,
      viewTransition: v
    };
  }
  function Ee(l) {
    return ne(
      l === "http://www.w3.org/2000/svg" ? 4 : l === "http://www.w3.org/1998/Math/MathML" ? 5 : 0,
      null,
      0,
      null
    );
  }
  function Fe(l, a, s) {
    var v = l.tagScope & -25;
    switch (a) {
      case "noscript":
        return ne(2, null, v | 1, null);
      case "select":
        return ne(
          2,
          s.value != null ? s.value : s.defaultValue,
          v,
          null
        );
      case "svg":
        return ne(4, null, v, null);
      case "picture":
        return ne(2, null, v | 2, null);
      case "math":
        return ne(5, null, v, null);
      case "foreignObject":
        return ne(2, null, v, null);
      case "table":
        return ne(6, null, v, null);
      case "thead":
      case "tbody":
      case "tfoot":
        return ne(7, null, v, null);
      case "colgroup":
        return ne(9, null, v, null);
      case "tr":
        return ne(8, null, v, null);
      case "head":
        if (2 > l.insertionMode)
          return ne(3, null, v, null);
        break;
      case "html":
        if (l.insertionMode === 0)
          return ne(1, null, v, null);
    }
    return 6 <= l.insertionMode || 2 > l.insertionMode ? ne(2, null, v, null) : l.tagScope !== v ? ne(
      l.insertionMode,
      l.selectedValue,
      v,
      null
    ) : l;
  }
  function ln(l) {
    return l === null ? null : {
      update: l.update,
      enter: "none",
      exit: "none",
      share: l.update,
      name: l.autoName,
      autoName: l.autoName,
      nameIdx: 0
    };
  }
  function Ke(l, a) {
    return a.tagScope & 32 && (l.instructions |= 128), ne(
      a.insertionMode,
      a.selectedValue,
      a.tagScope | 12,
      ln(a.viewTransition)
    );
  }
  function an(l, a) {
    l = ln(a.viewTransition);
    var s = a.tagScope | 16;
    return l !== null && l.share !== "none" && (s |= 64), ne(
      a.insertionMode,
      a.selectedValue,
      s,
      l
    );
  }
  var We = T("<!-- -->");
  function Jl(l, a, s, v) {
    return a === "" ? v : (v && l.push(We), l.push(fe(Ge(a))), !0);
  }
  var nl = /* @__PURE__ */ new Map(), dt = T(' style="'), hi = T(":"), oa = T(";");
  function La(l, a) {
    if (typeof a != "object") throw Error(W(62));
    var s = !0, v;
    for (v in a)
      if (me.call(a, v)) {
        var w = a[v];
        if (w != null && typeof w != "boolean" && w !== "") {
          if (v.indexOf("--") === 0) {
            var C = fe(Ge(v));
            w = fe(
              Ge(("" + w).trim())
            );
          } else
            C = nl.get(v), C === void 0 && (C = T(
              Ge(
                v.replace(mt, "-$1").toLowerCase().replace(xn, "-ms-")
              )
            ), nl.set(v, C)), w = typeof w == "number" ? w === 0 || tt.has(v) ? fe("" + w) : fe(w + "px") : fe(
              Ge(("" + w).trim())
            );
          s ? (s = !1, l.push(
            dt,
            C,
            hi,
            w
          )) : l.push(oa, C, hi, w);
        }
      }
    s || l.push(Yn);
  }
  var ur = T(" "), tl = T('="'), Yn = T('"'), lc = T('=""');
  function bl(l, a, s) {
    s && typeof s != "function" && typeof s != "symbol" && l.push(ur, fe(a), lc);
  }
  function Cn(l, a, s) {
    typeof s != "function" && typeof s != "symbol" && typeof s != "boolean" && l.push(
      ur,
      fe(a),
      tl,
      fe(Ge(s)),
      Yn
    );
  }
  var es = T(
    Ge(
      "javascript:throw new Error('React form unexpectedly submitted.')"
    )
  ), dn = T('<input type="hidden"');
  function ic(l, a) {
    this.push(dn), ac(l), Cn(this, "name", a), Cn(this, "value", l), this.push(Vl);
  }
  function ac(l) {
    if (typeof l != "string") throw Error(W(480));
  }
  function oc(l, a) {
    if (typeof a.$$FORM_ACTION == "function") {
      var s = l.nextFormID++;
      l = l.idPrefix + s;
      try {
        var v = a.$$FORM_ACTION(l);
        if (v) {
          var w = v.data;
          w?.forEach(ac);
        }
        return v;
      } catch (C) {
        if (typeof C == "object" && C !== null && typeof C.then == "function")
          throw C;
      }
    }
    return null;
  }
  function di(l, a, s, v, w, C, k, _) {
    var O = null;
    if (typeof v == "function") {
      var z = oc(a, v);
      z !== null ? (_ = z.name, v = z.action || "", w = z.encType, C = z.method, k = z.target, O = z.data) : (l.push(
        ur,
        fe("formAction"),
        tl,
        es,
        Yn
      ), k = C = w = v = _ = null, ns(a, s));
    }
    return _ != null && _n(l, "name", _), v != null && _n(l, "formAction", v), w != null && _n(l, "formEncType", w), C != null && _n(l, "formMethod", C), k != null && _n(l, "formTarget", k), O;
  }
  function _n(l, a, s) {
    switch (a) {
      case "className":
        Cn(l, "class", s);
        break;
      case "tabIndex":
        Cn(l, "tabindex", s);
        break;
      case "dir":
      case "role":
      case "viewBox":
      case "width":
      case "height":
        Cn(l, a, s);
        break;
      case "style":
        La(l, s);
        break;
      case "src":
      case "href":
        if (s === "") break;
      case "action":
      case "formAction":
        if (s == null || typeof s == "function" || typeof s == "symbol" || typeof s == "boolean")
          break;
        s = Gt("" + s), l.push(
          ur,
          fe(a),
          tl,
          fe(Ge(s)),
          Yn
        );
        break;
      case "defaultValue":
      case "defaultChecked":
      case "innerHTML":
      case "suppressContentEditableWarning":
      case "suppressHydrationWarning":
      case "ref":
        break;
      case "autoFocus":
      case "multiple":
      case "muted":
        bl(l, a.toLowerCase(), s);
        break;
      case "xlinkHref":
        if (typeof s == "function" || typeof s == "symbol" || typeof s == "boolean")
          break;
        s = Gt("" + s), l.push(
          ur,
          fe("xlink:href"),
          tl,
          fe(Ge(s)),
          Yn
        );
        break;
      case "contentEditable":
      case "spellCheck":
      case "draggable":
      case "value":
      case "autoReverse":
      case "externalResourcesRequired":
      case "focusable":
      case "preserveAlpha":
        typeof s != "function" && typeof s != "symbol" && l.push(
          ur,
          fe(a),
          tl,
          fe(Ge(s)),
          Yn
        );
        break;
      case "inert":
      case "allowFullScreen":
      case "async":
      case "autoPlay":
      case "controls":
      case "default":
      case "defer":
      case "disabled":
      case "disablePictureInPicture":
      case "disableRemotePlayback":
      case "formNoValidate":
      case "hidden":
      case "loop":
      case "noModule":
      case "noValidate":
      case "open":
      case "playsInline":
      case "readOnly":
      case "required":
      case "reversed":
      case "scoped":
      case "seamless":
      case "itemScope":
        s && typeof s != "function" && typeof s != "symbol" && l.push(
          ur,
          fe(a),
          lc
        );
        break;
      case "capture":
      case "download":
        s === !0 ? l.push(
          ur,
          fe(a),
          lc
        ) : s !== !1 && typeof s != "function" && typeof s != "symbol" && l.push(
          ur,
          fe(a),
          tl,
          fe(Ge(s)),
          Yn
        );
        break;
      case "cols":
      case "rows":
      case "size":
      case "span":
        typeof s != "function" && typeof s != "symbol" && !isNaN(s) && 1 <= s && l.push(
          ur,
          fe(a),
          tl,
          fe(Ge(s)),
          Yn
        );
        break;
      case "rowSpan":
      case "start":
        typeof s == "function" || typeof s == "symbol" || isNaN(s) || l.push(
          ur,
          fe(a),
          tl,
          fe(Ge(s)),
          Yn
        );
        break;
      case "xlinkActuate":
        Cn(l, "xlink:actuate", s);
        break;
      case "xlinkArcrole":
        Cn(l, "xlink:arcrole", s);
        break;
      case "xlinkRole":
        Cn(l, "xlink:role", s);
        break;
      case "xlinkShow":
        Cn(l, "xlink:show", s);
        break;
      case "xlinkTitle":
        Cn(l, "xlink:title", s);
        break;
      case "xlinkType":
        Cn(l, "xlink:type", s);
        break;
      case "xmlBase":
        Cn(l, "xml:base", s);
        break;
      case "xmlLang":
        Cn(l, "xml:lang", s);
        break;
      case "xmlSpace":
        Cn(l, "xml:space", s);
        break;
      default:
        if ((!(2 < a.length) || a[0] !== "o" && a[0] !== "O" || a[1] !== "n" && a[1] !== "N") && (a = Ct.get(a) || a, Rn(a))) {
          switch (typeof s) {
            case "function":
            case "symbol":
              return;
            case "boolean":
              var v = a.toLowerCase().slice(0, 5);
              if (v !== "data-" && v !== "aria-") return;
          }
          l.push(
            ur,
            fe(a),
            tl,
            fe(Ge(s)),
            Yn
          );
        }
    }
  }
  var mn = T(">"), Vl = T("/>");
  function sr(l, a, s) {
    if (a != null) {
      if (s != null) throw Error(W(60));
      if (typeof a != "object" || !("__html" in a))
        throw Error(W(61));
      a = a.__html, a != null && l.push(fe("" + a));
    }
  }
  function Ba(l) {
    var a = "";
    return de.Children.forEach(l, function(s) {
      s != null && (a += s);
    }), a;
  }
  var Wc = T(' selected=""'), Er = T(
    `addEventListener("submit",function(a){if(!a.defaultPrevented){var c=a.target,d=a.submitter,e=c.action,b=d;if(d){var f=d.getAttribute("formAction");null!=f&&(e=f,b=null)}"javascript:throw new Error('React form unexpectedly submitted.')"===e&&(a.preventDefault(),b?(a=document.createElement("input"),a.name=b.name,a.value=b.value,b.parentNode.insertBefore(a,b),b=new FormData(c),a.parentNode.removeChild(a)):b=new FormData(c),a=c.ownerDocument||c,(a.$$reactFormReplay=a.$$reactFormReplay||[]).push(c,d,b))}});`
  );
  function ns(l, a) {
    if ((l.instructions & 16) === 0) {
      l.instructions |= 16;
      var s = a.preamble, v = a.bootstrapChunks;
      (s.htmlChunks || s.headChunks) && v.length === 0 ? (v.push(a.startInlineScript), va(v, l), v.push(
        mn,
        Er,
        vn
      )) : v.unshift(
        a.startInlineScript,
        mn,
        Er,
        vn
      );
    }
  }
  var ku = T("<!--F!-->"), Yc = T("<!--F-->");
  function rt(l, a) {
    l.push(Zt("link"));
    for (var s in a)
      if (me.call(a, s)) {
        var v = a[s];
        if (v != null)
          switch (s) {
            case "children":
            case "dangerouslySetInnerHTML":
              throw Error(W(399, "link"));
            default:
              _n(l, s, v);
          }
      }
    return l.push(Vl), null;
  }
  var Gc = /(<\/|<)(s)(tyle)/gi;
  function Eo(l, a, s, v) {
    return "" + a + (s === "s" ? "\\73 " : "\\53 ") + v;
  }
  function wl(l, a, s) {
    l.push(Zt(s));
    for (var v in a)
      if (me.call(a, v)) {
        var w = a[v];
        if (w != null)
          switch (v) {
            case "children":
            case "dangerouslySetInnerHTML":
              throw Error(W(399, s));
            default:
              _n(l, v, w);
          }
      }
    return l.push(Vl), null;
  }
  function _a(l, a) {
    l.push(Zt("title"));
    var s = null, v = null, w;
    for (w in a)
      if (me.call(a, w)) {
        var C = a[w];
        if (C != null)
          switch (w) {
            case "children":
              s = C;
              break;
            case "dangerouslySetInnerHTML":
              v = C;
              break;
            default:
              _n(l, w, C);
          }
      }
    return l.push(mn), a = Array.isArray(s) ? 2 > s.length ? s[0] : null : s, typeof a != "function" && typeof a != "symbol" && a !== null && a !== void 0 && l.push(fe(Ge("" + a))), sr(l, v, s), l.push(yi("title")), null;
  }
  var ts = T("<!--head-->"), rs = T("<!--body-->"), Ro = T("<!--html-->");
  function Co(l, a) {
    l.push(Zt("script"));
    var s = null, v = null, w;
    for (w in a)
      if (me.call(a, w)) {
        var C = a[w];
        if (C != null)
          switch (w) {
            case "children":
              s = C;
              break;
            case "dangerouslySetInnerHTML":
              v = C;
              break;
            default:
              _n(l, w, C);
          }
      }
    return l.push(mn), sr(l, v, s), typeof s == "string" && l.push(
      fe(("" + s).replace(aa, fi))
    ), l.push(yi("script")), null;
  }
  function gi(l, a, s) {
    l.push(Zt(s));
    var v = s = null, w;
    for (w in a)
      if (me.call(a, w)) {
        var C = a[w];
        if (C != null)
          switch (w) {
            case "children":
              s = C;
              break;
            case "dangerouslySetInnerHTML":
              v = C;
              break;
            default:
              _n(l, w, C);
          }
      }
    return l.push(mn), sr(l, v, s), s;
  }
  function vi(l, a, s) {
    l.push(Zt(s));
    var v = s = null, w;
    for (w in a)
      if (me.call(a, w)) {
        var C = a[w];
        if (C != null)
          switch (w) {
            case "children":
              s = C;
              break;
            case "dangerouslySetInnerHTML":
              v = C;
              break;
            default:
              _n(l, w, C);
          }
      }
    return l.push(mn), sr(l, v, s), typeof s == "string" ? (l.push(fe(Ge(s))), null) : s;
  }
  var Xc = T(`
`), cc = /^[a-zA-Z][a-zA-Z:_\.\-\d]*$/, uc = /* @__PURE__ */ new Map();
  function Zt(l) {
    var a = uc.get(l);
    if (a === void 0) {
      if (!cc.test(l))
        throw Error(W(65, l));
      a = T("<" + l), uc.set(l, a);
    }
    return a;
  }
  var mo = T("<!DOCTYPE html>");
  function sc(l, a, s, v, w, C, k, _, O) {
    switch (a) {
      case "div":
      case "span":
      case "svg":
      case "path":
        break;
      case "a":
        l.push(Zt("a"));
        var z = null, Z = null, K;
        for (K in s)
          if (me.call(s, K)) {
            var xe = s[K];
            if (xe != null)
              switch (K) {
                case "children":
                  z = xe;
                  break;
                case "dangerouslySetInnerHTML":
                  Z = xe;
                  break;
                case "href":
                  xe === "" ? Cn(l, "href", "") : _n(l, K, xe);
                  break;
                default:
                  _n(l, K, xe);
              }
          }
        if (l.push(mn), sr(l, Z, z), typeof z == "string") {
          l.push(fe(Ge(z)));
          var pe = null;
        } else pe = z;
        return pe;
      case "g":
      case "p":
      case "li":
        break;
      case "select":
        l.push(Zt("select"));
        var yn = null, Qe = null, bn;
        for (bn in s)
          if (me.call(s, bn)) {
            var bt = s[bn];
            if (bt != null)
              switch (bn) {
                case "children":
                  yn = bt;
                  break;
                case "dangerouslySetInnerHTML":
                  Qe = bt;
                  break;
                case "defaultValue":
                case "value":
                  break;
                default:
                  _n(
                    l,
                    bn,
                    bt
                  );
              }
          }
        return l.push(mn), sr(l, Qe, yn), yn;
      case "option":
        var $n = _.selectedValue;
        l.push(Zt("option"));
        var gr = null, ll = null, Dl = null, Je = null, Pr;
        for (Pr in s)
          if (me.call(s, Pr)) {
            var Mt = s[Pr];
            if (Mt != null)
              switch (Pr) {
                case "children":
                  gr = Mt;
                  break;
                case "selected":
                  Dl = Mt;
                  break;
                case "dangerouslySetInnerHTML":
                  Je = Mt;
                  break;
                case "value":
                  ll = Mt;
                default:
                  _n(
                    l,
                    Pr,
                    Mt
                  );
              }
          }
        if ($n != null) {
          var Qr = ll !== null ? "" + ll : Ba(gr);
          if (Ie($n)) {
            for (var ji = 0; ji < $n.length; ji++)
              if ("" + $n[ji] === Qr) {
                l.push(Wc);
                break;
              }
          } else
            "" + $n === Qr && l.push(Wc);
        } else Dl && l.push(Wc);
        return l.push(mn), sr(l, Je, gr), gr;
      case "textarea":
        l.push(Zt("textarea"));
        var wt = null, lo = null, Nl = null, Fr;
        for (Fr in s)
          if (me.call(s, Fr)) {
            var ii = s[Fr];
            if (ii != null)
              switch (Fr) {
                case "children":
                  Nl = ii;
                  break;
                case "value":
                  wt = ii;
                  break;
                case "defaultValue":
                  lo = ii;
                  break;
                case "dangerouslySetInnerHTML":
                  throw Error(W(91));
                default:
                  _n(
                    l,
                    Fr,
                    ii
                  );
              }
          }
        if (wt === null && lo !== null && (wt = lo), l.push(mn), Nl != null) {
          if (wt != null) throw Error(W(92));
          if (Ie(Nl)) {
            if (1 < Nl.length)
              throw Error(W(93));
            wt = "" + Nl[0];
          }
          wt = "" + Nl;
        }
        return typeof wt == "string" && wt[0] === `
` && l.push(Xc), wt !== null && l.push(
          fe(Ge("" + wt))
        ), null;
      case "input":
        l.push(Zt("input"));
        var Or = null, io = null, Wo = null, Jr = null, Yo = null, Mr = null, ao = null, Gu = null, ot = null, Go;
        for (Go in s)
          if (me.call(s, Go)) {
            var ai = s[Go];
            if (ai != null)
              switch (Go) {
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(W(399, "input"));
                case "name":
                  Or = ai;
                  break;
                case "formAction":
                  io = ai;
                  break;
                case "formEncType":
                  Wo = ai;
                  break;
                case "formMethod":
                  Jr = ai;
                  break;
                case "formTarget":
                  Yo = ai;
                  break;
                case "defaultChecked":
                  ot = ai;
                  break;
                case "defaultValue":
                  ao = ai;
                  break;
                case "checked":
                  Gu = ai;
                  break;
                case "value":
                  Mr = ai;
                  break;
                default:
                  _n(
                    l,
                    Go,
                    ai
                  );
              }
          }
        var uu = di(
          l,
          v,
          w,
          io,
          Wo,
          Jr,
          Yo,
          Or
        );
        return Gu !== null ? bl(l, "checked", Gu) : ot !== null && bl(l, "checked", ot), Mr !== null ? _n(l, "value", Mr) : ao !== null && _n(l, "value", ao), l.push(Vl), uu?.forEach(ic, l), null;
      case "button":
        l.push(Zt("button"));
        var oo = null, su = null, fu = null, Xo = null, Sa = null, hu = null, Ci = null, co;
        for (co in s)
          if (me.call(s, co)) {
            var uo = s[co];
            if (uo != null)
              switch (co) {
                case "children":
                  oo = uo;
                  break;
                case "dangerouslySetInnerHTML":
                  su = uo;
                  break;
                case "name":
                  fu = uo;
                  break;
                case "formAction":
                  Xo = uo;
                  break;
                case "formEncType":
                  Sa = uo;
                  break;
                case "formMethod":
                  hu = uo;
                  break;
                case "formTarget":
                  Ci = uo;
                  break;
                default:
                  _n(
                    l,
                    co,
                    uo
                  );
              }
          }
        var hs = di(
          l,
          v,
          w,
          Xo,
          Sa,
          hu,
          Ci,
          fu
        );
        if (l.push(mn), hs?.forEach(ic, l), sr(l, su, oo), typeof oo == "string") {
          l.push(
            fe(Ge(oo))
          );
          var Ll = null;
        } else Ll = oo;
        return Ll;
      case "form":
        l.push(Zt("form"));
        var ds = null, kl = null, Aa = null, qi = null, du = null, gu = null, vu;
        for (vu in s)
          if (me.call(s, vu)) {
            var so = s[vu];
            if (so != null)
              switch (vu) {
                case "children":
                  ds = so;
                  break;
                case "dangerouslySetInnerHTML":
                  kl = so;
                  break;
                case "action":
                  Aa = so;
                  break;
                case "encType":
                  qi = so;
                  break;
                case "method":
                  du = so;
                  break;
                case "target":
                  gu = so;
                  break;
                default:
                  _n(
                    l,
                    vu,
                    so
                  );
              }
          }
        var gs = null, Xu = null;
        if (typeof Aa == "function") {
          var Zo = oc(
            v,
            Aa
          );
          Zo !== null ? (Aa = Zo.action || "", qi = Zo.encType, du = Zo.method, gu = Zo.target, gs = Zo.data, Xu = Zo.name) : (l.push(
            ur,
            fe("action"),
            tl,
            es,
            Yn
          ), gu = du = qi = Aa = null, ns(v, w));
        }
        if (Aa != null && _n(l, "action", Aa), qi != null && _n(l, "encType", qi), du != null && _n(l, "method", du), gu != null && _n(l, "target", gu), l.push(mn), Xu !== null && (l.push(dn), Cn(l, "name", Xu), l.push(Vl), gs?.forEach(ic, l)), sr(l, kl, ds), typeof ds == "string") {
          l.push(
            fe(Ge(ds))
          );
          var vs = null;
        } else vs = ds;
        return vs;
      case "menuitem":
        l.push(Zt("menuitem"));
        for (var yu in s)
          if (me.call(s, yu)) {
            var ms = s[yu];
            if (ms != null)
              switch (yu) {
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(W(400));
                default:
                  _n(
                    l,
                    yu,
                    ms
                  );
              }
          }
        return l.push(mn), null;
      case "object":
        l.push(Zt("object"));
        var Zu = null, ks = null, bu;
        for (bu in s)
          if (me.call(s, bu)) {
            var Qo = s[bu];
            if (Qo != null)
              switch (bu) {
                case "children":
                  Zu = Qo;
                  break;
                case "dangerouslySetInnerHTML":
                  ks = Qo;
                  break;
                case "data":
                  var Is = Gt("" + Qo);
                  if (Is === "") break;
                  l.push(
                    ur,
                    fe("data"),
                    tl,
                    fe(Ge(Is)),
                    Yn
                  );
                  break;
                default:
                  _n(
                    l,
                    bu,
                    Qo
                  );
              }
          }
        if (l.push(mn), sr(l, ks, Zu), typeof Zu == "string") {
          l.push(
            fe(Ge(Zu))
          );
          var Ds = null;
        } else Ds = Zu;
        return Ds;
      case "title":
        var mi = _.tagScope & 1, ys = _.tagScope & 4;
        if (_.insertionMode === 4 || mi || s.itemProp != null)
          var Ns = _a(
            l,
            s
          );
        else
          ys ? Ns = null : (_a(w.hoistableChunks, s), Ns = void 0);
        return Ns;
      case "link":
        var ar = _.tagScope & 1, $i = _.tagScope & 4, Ir = s.rel, Pa = s.href, Bl = s.precedence;
        if (_.insertionMode === 4 || ar || s.itemProp != null || typeof Ir != "string" || typeof Pa != "string" || Pa === "") {
          rt(l, s);
          var Nn = null;
        } else if (s.rel === "stylesheet")
          if (typeof Bl != "string" || s.disabled != null || s.onLoad || s.onError)
            Nn = rt(
              l,
              s
            );
          else {
            var il = w.styles.get(Bl), ea = v.styleResources.hasOwnProperty(Pa) ? v.styleResources[Pa] : void 0;
            if (ea !== null) {
              v.styleResources[Pa] = null, il || (il = {
                precedence: fe(Ge(Bl)),
                rules: [],
                hrefs: [],
                sheets: /* @__PURE__ */ new Map()
              }, w.styles.set(Bl, il));
              var _t = {
                state: 0,
                props: Te({}, s, {
                  "data-precedence": s.precedence,
                  precedence: null
                })
              };
              if (ea) {
                ea.length === 2 && Za(_t.props, ea);
                var Mc = w.preloads.stylesheets.get(Pa);
                Mc && 0 < Mc.length ? Mc.length = 0 : _t.state = 1;
              }
              il.sheets.set(Pa, _t), k && k.stylesheets.add(_t);
            } else if (il) {
              var wu = il.sheets.get(Pa);
              wu && k && k.stylesheets.add(wu);
            }
            O && l.push(We), Nn = null;
          }
        else
          s.onLoad || s.onError ? Nn = rt(
            l,
            s
          ) : (O && l.push(We), Nn = $i ? null : rt(w.hoistableChunks, s));
        return Nn;
      case "script":
        var bs = _.tagScope & 1, Jo = s.async;
        if (typeof s.src != "string" || !s.src || !Jo || typeof Jo == "function" || typeof Jo == "symbol" || s.onLoad || s.onError || _.insertionMode === 4 || bs || s.itemProp != null)
          var fo = Co(
            l,
            s
          );
        else {
          var Ic = s.src;
          if (s.type === "module")
            var oi = v.moduleScriptResources, ho = w.preloads.moduleScripts;
          else
            oi = v.scriptResources, ho = w.preloads.scripts;
          var Dc = oi.hasOwnProperty(Ic) ? oi[Ic] : void 0;
          if (Dc !== null) {
            oi[Ic] = null;
            var n = s;
            if (Dc) {
              Dc.length === 2 && (n = Te({}, s), Za(n, Dc));
              var r = ho.get(Ic);
              r && (r.length = 0);
            }
            var u = [];
            w.scripts.add(u), Co(u, n);
          }
          O && l.push(We), fo = null;
        }
        return fo;
      case "style":
        var d = _.tagScope & 1, b = s.precedence, E = s.href, F = s.nonce;
        if (_.insertionMode === 4 || d || s.itemProp != null || typeof b != "string" || typeof E != "string" || E === "") {
          l.push(Zt("style"));
          var D = null, te = null, H;
          for (H in s)
            if (me.call(s, H)) {
              var j = s[H];
              if (j != null)
                switch (H) {
                  case "children":
                    D = j;
                    break;
                  case "dangerouslySetInnerHTML":
                    te = j;
                    break;
                  default:
                    _n(
                      l,
                      H,
                      j
                    );
                }
            }
          l.push(mn);
          var ge = Array.isArray(D) ? 2 > D.length ? D[0] : null : D;
          typeof ge != "function" && typeof ge != "symbol" && ge !== null && ge !== void 0 && l.push(
            fe(("" + ge).replace(Gc, Eo))
          ), sr(l, te, D), l.push(yi("style"));
          var Ce = null;
        } else {
          var ye = w.styles.get(b);
          if ((v.styleResources.hasOwnProperty(E) ? v.styleResources[E] : void 0) !== null) {
            v.styleResources[E] = null, ye || (ye = {
              precedence: fe(
                Ge(b)
              ),
              rules: [],
              hrefs: [],
              sheets: /* @__PURE__ */ new Map()
            }, w.styles.set(b, ye));
            var ae = w.nonce.style;
            if (!ae || ae === F) {
              ye.hrefs.push(
                fe(Ge(E))
              );
              var fn = ye.rules, Jn = null, Ye = null, Fn;
              for (Fn in s)
                if (me.call(s, Fn)) {
                  var vr = s[Fn];
                  if (vr != null)
                    switch (Fn) {
                      case "children":
                        Jn = vr;
                        break;
                      case "dangerouslySetInnerHTML":
                        Ye = vr;
                    }
                }
              var yr = Array.isArray(Jn) ? 2 > Jn.length ? Jn[0] : null : Jn;
              typeof yr != "function" && typeof yr != "symbol" && yr !== null && yr !== void 0 && fn.push(
                fe(
                  ("" + yr).replace(Gc, Eo)
                )
              ), sr(fn, Ye, Jn);
            }
          }
          ye && k && k.styles.add(ye), O && l.push(We), Ce = void 0;
        }
        return Ce;
      case "meta":
        var In = _.tagScope & 1, $t = _.tagScope & 4;
        if (_.insertionMode === 4 || In || s.itemProp != null)
          var ki = wl(
            l,
            s,
            "meta"
          );
        else
          O && l.push(We), ki = $t ? null : typeof s.charSet == "string" ? wl(w.charsetChunks, s, "meta") : s.name === "viewport" ? wl(w.viewportChunks, s, "meta") : wl(w.hoistableChunks, s, "meta");
        return ki;
      case "listing":
      case "pre":
        l.push(Zt(a));
        var Vr = null, Me = null, Hn;
        for (Hn in s)
          if (me.call(s, Hn)) {
            var Un = s[Hn];
            if (Un != null)
              switch (Hn) {
                case "children":
                  Vr = Un;
                  break;
                case "dangerouslySetInnerHTML":
                  Me = Un;
                  break;
                default:
                  _n(
                    l,
                    Hn,
                    Un
                  );
              }
          }
        if (l.push(mn), Me != null) {
          if (Vr != null) throw Error(W(60));
          if (typeof Me != "object" || !("__html" in Me))
            throw Error(W(61));
          var Xn = Me.__html;
          Xn != null && (typeof Xn == "string" && 0 < Xn.length && Xn[0] === `
` ? l.push(Xc, fe(Xn)) : l.push(fe("" + Xn)));
        }
        return typeof Vr == "string" && Vr[0] === `
` && l.push(Xc), Vr;
      case "img":
        var pt = _.tagScope & 3, pn = s.src, tn = s.srcSet;
        if (!(s.loading === "lazy" || !pn && !tn || typeof pn != "string" && pn != null || typeof tn != "string" && tn != null || s.fetchPriority === "low" || pt) && (typeof pn != "string" || pn[4] !== ":" || pn[0] !== "d" && pn[0] !== "D" || pn[1] !== "a" && pn[1] !== "A" || pn[2] !== "t" && pn[2] !== "T" || pn[3] !== "a" && pn[3] !== "A") && (typeof tn != "string" || tn[4] !== ":" || tn[0] !== "d" && tn[0] !== "D" || tn[1] !== "a" && tn[1] !== "A" || tn[2] !== "t" && tn[2] !== "T" || tn[3] !== "a" && tn[3] !== "A")) {
          k !== null && _.tagScope & 64 && (k.suspenseyImages = !0);
          var Dr = typeof s.sizes == "string" ? s.sizes : void 0, Wn = tn ? tn + `
` + (Dr || "") : pn, br = w.preloads.images, ct = br.get(Wn);
          if (ct)
            (s.fetchPriority === "high" || 10 > w.highImagePreloads.size) && (br.delete(Wn), w.highImagePreloads.add(ct));
          else if (!v.imageResources.hasOwnProperty(Wn)) {
            v.imageResources[Wn] = At;
            var al = s.crossOrigin, Vo = typeof al == "string" ? al === "use-credentials" ? al : "" : void 0, ol = w.headers, Si;
            ol && 0 < ol.remainingCapacity && typeof s.srcSet != "string" && (s.fetchPriority === "high" || 500 > ol.highImagePreloads.length) && (Si = qc(pn, "image", {
              imageSrcSet: s.srcSet,
              imageSizes: s.sizes,
              crossOrigin: Vo,
              integrity: s.integrity,
              nonce: s.nonce,
              type: s.type,
              fetchPriority: s.fetchPriority,
              referrerPolicy: s.refererPolicy
            }), 0 <= (ol.remainingCapacity -= Si.length + 2)) ? (w.resets.image[Wn] = At, ol.highImagePreloads && (ol.highImagePreloads += ", "), ol.highImagePreloads += Si) : (ct = [], rt(ct, {
              rel: "preload",
              as: "image",
              href: tn ? void 0 : pn,
              imageSrcSet: tn,
              imageSizes: Dr,
              crossOrigin: Vo,
              integrity: s.integrity,
              type: s.type,
              fetchPriority: s.fetchPriority,
              referrerPolicy: s.referrerPolicy
            }), s.fetchPriority === "high" || 10 > w.highImagePreloads.size ? w.highImagePreloads.add(ct) : (w.bulkPreloads.add(ct), br.set(Wn, ct)));
          }
        }
        return wl(l, s, "img");
      case "base":
      case "area":
      case "br":
      case "col":
      case "embed":
      case "hr":
      case "keygen":
      case "param":
      case "source":
      case "track":
      case "wbr":
        return wl(l, s, a);
      case "annotation-xml":
      case "color-profile":
      case "font-face":
      case "font-face-src":
      case "font-face-uri":
      case "font-face-format":
      case "font-face-name":
      case "missing-glyph":
        break;
      case "head":
        if (2 > _.insertionMode) {
          var Ai = C || w.preamble;
          if (Ai.headChunks)
            throw Error(W(545, "`<head>`"));
          C !== null && l.push(ts), Ai.headChunks = [];
          var Pi = gi(
            Ai.headChunks,
            s,
            "head"
          );
        } else
          Pi = vi(
            l,
            s,
            "head"
          );
        return Pi;
      case "body":
        if (2 > _.insertionMode) {
          var or = C || w.preamble;
          if (or.bodyChunks)
            throw Error(W(545, "`<body>`"));
          C !== null && l.push(rs), or.bodyChunks = [];
          var e = gi(
            or.bodyChunks,
            s,
            "body"
          );
        } else
          e = vi(
            l,
            s,
            "body"
          );
        return e;
      case "html":
        if (_.insertionMode === 0) {
          var t = C || w.preamble;
          if (t.htmlChunks)
            throw Error(W(545, "`<html>`"));
          C !== null && l.push(Ro), t.htmlChunks = [mo];
          var c = gi(
            t.htmlChunks,
            s,
            "html"
          );
        } else
          c = vi(
            l,
            s,
            "html"
          );
        return c;
      default:
        if (a.indexOf("-") !== -1) {
          l.push(Zt(a));
          var h = null, y = null, x;
          for (x in s)
            if (me.call(s, x)) {
              var S = s[x];
              if (S != null) {
                var M = x;
                switch (x) {
                  case "children":
                    h = S;
                    break;
                  case "dangerouslySetInnerHTML":
                    y = S;
                    break;
                  case "style":
                    La(l, S);
                    break;
                  case "suppressContentEditableWarning":
                  case "suppressHydrationWarning":
                  case "ref":
                    break;
                  case "className":
                    M = "class";
                  default:
                    if (Rn(x) && typeof S != "function" && typeof S != "symbol" && S !== !1) {
                      if (S === !0) S = "";
                      else if (typeof S == "object") continue;
                      l.push(
                        ur,
                        fe(M),
                        tl,
                        fe(Ge(S)),
                        Yn
                      );
                    }
                }
              }
            }
          return l.push(mn), sr(l, y, h), h;
        }
    }
    return vi(l, s, a);
  }
  var Zc = /* @__PURE__ */ new Map();
  function yi(l) {
    var a = Zc.get(l);
    return a === void 0 && (a = T("</" + l + ">"), Zc.set(l, a)), a;
  }
  function fc(l, a) {
    l = l.preamble, l.htmlChunks === null && a.htmlChunks && (l.htmlChunks = a.htmlChunks), l.headChunks === null && a.headChunks && (l.headChunks = a.headChunks), l.bodyChunks === null && a.bodyChunks && (l.bodyChunks = a.bodyChunks);
  }
  function Ur(l, a) {
    a = a.bootstrapChunks;
    for (var s = 0; s < a.length - 1; s++)
      J(l, a[s]);
    return s < a.length ? (s = a[s], a.length = 0, he(l, s)) : !0;
  }
  var Kl = T(
    "requestAnimationFrame(function(){$RT=performance.now()});"
  ), Su = T('<template id="'), hc = T('"></template>'), Wr = T("<!--&-->"), dc = T("<!--/&-->"), ca = T("<!--$-->"), ko = T(
    '<!--$?--><template id="'
  ), Yr = T('"></template>'), Kt = T("<!--$!-->"), jn = T("<!--/$-->"), Au = T("<template"), Ni = T('"'), jl = T(' data-dgst="');
  T(' data-msg="'), T(' data-stck="'), T(' data-cstck="');
  var Pu = T("></template>");
  function Li(l, a, s) {
    if (J(l, ko), s === null) throw Error(W(395));
    return J(l, a.boundaryPrefix), J(l, fe(s.toString(16))), he(l, Yr);
  }
  var bi = T('<div hidden id="'), So = T('">'), Bi = T("</div>"), _i = T(
    '<svg aria-hidden="true" style="display:none" id="'
  ), Ao = T('">'), $e = T("</svg>"), ql = T(
    '<math aria-hidden="true" style="display:none" id="'
  ), It = T('">'), wi = T("</math>"), Qt = T('<table hidden id="'), ua = T('">'), za = T("</table>"), pi = T('<table hidden><tbody id="'), zi = T('">'), Dt = T("</tbody></table>"), Hi = T('<table hidden><tr id="'), Ui = T('">'), Ha = T("</tr></table>"), sa = T(
    '<table hidden><colgroup id="'
  ), Ua = T('">'), Gr = T("</colgroup></table>");
  function Wa(l, a, s, v) {
    switch (s.insertionMode) {
      case 0:
      case 1:
      case 3:
      case 2:
        return J(l, bi), J(l, a.segmentPrefix), J(l, fe(v.toString(16))), he(l, So);
      case 4:
        return J(l, _i), J(l, a.segmentPrefix), J(l, fe(v.toString(16))), he(l, Ao);
      case 5:
        return J(l, ql), J(l, a.segmentPrefix), J(l, fe(v.toString(16))), he(l, It);
      case 6:
        return J(l, Qt), J(l, a.segmentPrefix), J(l, fe(v.toString(16))), he(l, ua);
      case 7:
        return J(l, pi), J(l, a.segmentPrefix), J(l, fe(v.toString(16))), he(l, zi);
      case 8:
        return J(l, Hi), J(l, a.segmentPrefix), J(l, fe(v.toString(16))), he(l, Ui);
      case 9:
        return J(l, sa), J(l, a.segmentPrefix), J(l, fe(v.toString(16))), he(l, Ua);
      default:
        throw Error(W(397));
    }
  }
  function $l(l, a) {
    switch (a.insertionMode) {
      case 0:
      case 1:
      case 3:
      case 2:
        return he(l, Bi);
      case 4:
        return he(l, $e);
      case 5:
        return he(l, wi);
      case 6:
        return he(l, za);
      case 7:
        return he(l, Dt);
      case 8:
        return he(l, Ha);
      case 9:
        return he(l, Gr);
      default:
        throw Error(W(397));
    }
  }
  var Fu = T(
    '$RS=function(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};$RS("'
  ), Ou = T('$RS("'), Mu = T('","'), Po = T('")<\/script>');
  T('<template data-rsi="" data-sid="'), T('" data-pid="');
  var Fo = T(
    `$RB=[];$RV=function(a){$RT=performance.now();for(var b=0;b<a.length;b+=2){var c=a[b],e=a[b+1];null!==e.parentNode&&e.parentNode.removeChild(e);var f=c.parentNode;if(f){var g=c.previousSibling,h=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d||"/&"===d)if(0===h)break;else h--;else"$"!==d&&"$?"!==d&&"$~"!==d&&"$!"!==d&&"&"!==d||h++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;e.firstChild;)f.insertBefore(e.firstChild,c);g.data="$";g._reactRetry&&requestAnimationFrame(g._reactRetry)}}a.length=0};
$RC=function(a,b){if(b=document.getElementById(b))(a=document.getElementById(a))?(a.previousSibling.data="$~",$RB.push(a,b),2===$RB.length&&("number"!==typeof $RT?requestAnimationFrame($RV.bind(null,$RB)):(a=performance.now(),setTimeout($RV.bind(null,$RB),2300>a&&2E3<a?2300-a:$RT+300-a)))):b.parentNode.removeChild(b)};`
  );
  fe(
    `$RV=function(A,g){function k(a,b){var e=a.getAttribute(b);e&&(b=a.style,l.push(a,b.viewTransitionName,b.viewTransitionClass),"auto"!==e&&(b.viewTransitionClass=e),(a=a.getAttribute("vt-name"))||(a="_T_"+K++ +"_"),b.viewTransitionName=a,B=!0)}var B=!1,K=0,l=[];try{var f=document.__reactViewTransition;if(f){f.finished.finally($RV.bind(null,g));return}var m=new Map;for(f=1;f<g.length;f+=2)for(var h=g[f].querySelectorAll("[vt-share]"),d=0;d<h.length;d++){var c=h[d];m.set(c.getAttribute("vt-name"),c)}var u=[];for(h=0;h<g.length;h+=2){var C=g[h],x=C.parentNode;if(x){var v=x.getBoundingClientRect();if(v.left||v.top||v.width||v.height){c=C;for(f=0;c;){if(8===c.nodeType){var r=c.data;if("/$"===r)if(0===f)break;else f--;else"$"!==r&&"$?"!==r&&"$~"!==r&&"$!"!==r||f++}else if(1===c.nodeType){d=c;var D=d.getAttribute("vt-name"),y=m.get(D);k(d,y?"vt-share":"vt-exit");y&&(k(y,"vt-share"),m.set(D,null));var E=d.querySelectorAll("[vt-share]");for(d=0;d<E.length;d++){var F=E[d],G=F.getAttribute("vt-name"),
H=m.get(G);H&&(k(F,"vt-share"),k(H,"vt-share"),m.set(G,null))}}c=c.nextSibling}for(var I=g[h+1],t=I.firstElementChild;t;)null!==m.get(t.getAttribute("vt-name"))&&k(t,"vt-enter"),t=t.nextElementSibling;c=x;do for(var n=c.firstElementChild;n;){var J=n.getAttribute("vt-update");J&&"none"!==J&&!l.includes(n)&&k(n,"vt-update");n=n.nextElementSibling}while((c=c.parentNode)&&1===c.nodeType&&"none"!==c.getAttribute("vt-update"));u.push.apply(u,I.querySelectorAll('img[src]:not([loading="lazy"])'))}}}if(B){var z=
document.__reactViewTransition=document.startViewTransition({update:function(){A(g);for(var a=[document.documentElement.clientHeight,document.fonts.ready],b={},e=0;e<u.length;b={g:b.g},e++)if(b.g=u[e],!b.g.complete){var p=b.g.getBoundingClientRect();0<p.bottom&&0<p.right&&p.top<window.innerHeight&&p.left<window.innerWidth&&(p=new Promise(function(w){return function(q){w.g.addEventListener("load",q);w.g.addEventListener("error",q)}}(b)),a.push(p))}return Promise.race([Promise.all(a),new Promise(function(w){var q=
performance.now();setTimeout(w,2300>q&&2E3<q?2300-q:500)})])},types:[]});z.ready.finally(function(){for(var a=l.length-3;0<=a;a-=3){var b=l[a],e=b.style;e.viewTransitionName=l[a+1];e.viewTransitionClass=l[a+1];""===b.getAttribute("style")&&b.removeAttribute("style")}});z.finished.finally(function(){document.__reactViewTransition===z&&(document.__reactViewTransition=null)});$RB=[];return}}catch(a){}A(g)}.bind(null,$RV);`
  );
  var Oo = T('$RC("'), jt = T(
    `$RM=new Map;$RR=function(n,w,p){function u(q){this._p=null;q()}for(var r=new Map,t=document,h,b,e=t.querySelectorAll("link[data-precedence],style[data-precedence]"),v=[],k=0;b=e[k++];)"not all"===b.getAttribute("media")?v.push(b):("LINK"===b.tagName&&$RM.set(b.getAttribute("href"),b),r.set(b.dataset.precedence,h=b));e=0;b=[];var l,a;for(k=!0;;){if(k){var f=p[e++];if(!f){k=!1;e=0;continue}var c=!1,m=0;var d=f[m++];if(a=$RM.get(d)){var g=a._p;c=!0}else{a=t.createElement("link");a.href=d;a.rel=
"stylesheet";for(a.dataset.precedence=l=f[m++];g=f[m++];)a.setAttribute(g,f[m++]);g=a._p=new Promise(function(q,x){a.onload=u.bind(a,q);a.onerror=u.bind(a,x)});$RM.set(d,a)}d=a.getAttribute("media");!g||d&&!matchMedia(d).matches||b.push(g);if(c)continue}else{a=v[e++];if(!a)break;l=a.getAttribute("data-precedence");a.removeAttribute("media")}c=r.get(l)||h;c===h&&(h=a);r.set(l,a);c?c.parentNode.insertBefore(a,c.nextSibling):(c=t.head,c.insertBefore(a,c.firstChild))}if(p=document.getElementById(n))p.previousSibling.data=
"$~";Promise.all(b).then($RC.bind(null,n,w),$RX.bind(null,n,"CSS failed to load"))};$RR("`
  ), ls = T('$RR("'), fa = T('","'), gc = T('",'), Qc = T('"'), Wi = T(")<\/script>");
  T('<template data-rci="" data-bid="'), T('<template data-rri="" data-bid="'), T('" data-sid="'), T('" data-sty="');
  var ha = T(
    '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};'
  ), Mo = T(
    '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};;$RX("'
  ), ei = T('$RX("'), da = T('"'), ga = T(","), Iu = T(")<\/script>");
  T('<template data-rxi="" data-bid="'), T('" data-dgst="'), T('" data-msg="'), T('" data-stck="'), T('" data-cstck="');
  var Es = /[<\u2028\u2029]/g;
  function Ya(l) {
    return JSON.stringify(l).replace(
      Es,
      function(a) {
        switch (a) {
          case "<":
            return "\\u003c";
          case "\u2028":
            return "\\u2028";
          case "\u2029":
            return "\\u2029";
          default:
            throw Error(
              "escapeJSStringsForInstructionScripts encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
            );
        }
      }
    );
  }
  var Nt = /[&><\u2028\u2029]/g;
  function Ti(l) {
    return JSON.stringify(l).replace(
      Nt,
      function(a) {
        switch (a) {
          case "&":
            return "\\u0026";
          case ">":
            return "\\u003e";
          case "<":
            return "\\u003c";
          case "\u2028":
            return "\\u2028";
          case "\u2029":
            return "\\u2029";
          default:
            throw Error(
              "escapeJSObjectForInstructionScripts encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
            );
        }
      }
    );
  }
  var vc = T(
    ' media="not all" data-precedence="'
  ), yc = T('" data-href="'), Jc = T('">'), pl = T("</style>"), Tl = !1, rl = !0;
  function xl(l) {
    var a = l.rules, s = l.hrefs, v = 0;
    if (s.length) {
      for (J(this, $r.startInlineStyle), J(this, vc), J(this, l.precedence), J(this, yc); v < s.length - 1; v++)
        J(this, s[v]), J(this, bc);
      for (J(this, s[v]), J(this, Jc), v = 0; v < a.length; v++) J(this, a[v]);
      rl = he(
        this,
        pl
      ), Tl = !0, a.length = 0, s.length = 0;
    }
  }
  function Gn(l) {
    return l.state !== 2 ? Tl = !0 : !1;
  }
  function El(l, a, s) {
    return Tl = !1, rl = !0, $r = s, a.styles.forEach(xl, l), $r = null, a.stylesheets.forEach(Gn), Tl && (s.stylesToHoist = !0), rl;
  }
  function lt(l) {
    for (var a = 0; a < l.length; a++) J(this, l[a]);
    l.length = 0;
  }
  var ni = [];
  function Vc(l) {
    rt(ni, l.props);
    for (var a = 0; a < ni.length; a++)
      J(this, ni[a]);
    ni.length = 0, l.state = 2;
  }
  var Kc = T(' data-precedence="'), jc = T('" data-href="'), bc = T(" "), Yi = T('">'), wc = T("</style>");
  function pc(l) {
    var a = 0 < l.sheets.size;
    l.sheets.forEach(Vc, this), l.sheets.clear();
    var s = l.rules, v = l.hrefs;
    if (!a || v.length) {
      if (J(this, $r.startInlineStyle), J(this, Kc), J(this, l.precedence), l = 0, v.length) {
        for (J(this, jc); l < v.length - 1; l++)
          J(this, v[l]), J(this, bc);
        J(this, v[l]);
      }
      for (J(this, Yi), l = 0; l < s.length; l++)
        J(this, s[l]);
      J(this, wc), s.length = 0, v.length = 0;
    }
  }
  function Xr(l) {
    if (l.state === 0) {
      l.state = 1;
      var a = l.props;
      for (rt(ni, {
        rel: "preload",
        as: "style",
        href: l.props.href,
        crossOrigin: a.crossOrigin,
        fetchPriority: a.fetchPriority,
        integrity: a.integrity,
        media: a.media,
        hrefLang: a.hrefLang,
        referrerPolicy: a.referrerPolicy
      }), l = 0; l < ni.length; l++)
        J(this, ni[l]);
      ni.length = 0;
    }
  }
  function it(l) {
    l.sheets.forEach(Xr, this), l.sheets.clear();
  }
  T('<link rel="expect" href="#'), T('" blocking="render"/>');
  var kn = T(' id="');
  function va(l, a) {
    (a.instructions & 32) === 0 && (a.instructions |= 32, l.push(
      kn,
      fe(Ge("_" + a.idPrefix + "R_")),
      Yn
    ));
  }
  var Ga = T("["), Xa = T(",["), ya = T(","), Du = T("]");
  function lr(l, a) {
    J(l, Ga);
    var s = Ga;
    a.stylesheets.forEach(function(v) {
      if (v.state !== 2)
        if (v.state === 3)
          J(l, s), J(
            l,
            fe(
              Ti("" + v.props.href)
            )
          ), J(l, Du), s = Xa;
        else {
          J(l, s);
          var w = v.props["data-precedence"], C = v.props, k = Gt("" + v.props.href);
          J(
            l,
            fe(Ti(k))
          ), w = "" + w, J(l, ya), J(
            l,
            fe(Ti(w))
          );
          for (var _ in C)
            if (me.call(C, _) && (w = C[_], w != null))
              switch (_) {
                case "href":
                case "rel":
                case "precedence":
                case "data-precedence":
                  break;
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(W(399, "link"));
                default:
                  Rs(
                    l,
                    _,
                    w
                  );
              }
          J(l, Du), s = Xa, v.state = 3;
        }
    }), J(l, Du);
  }
  function Rs(l, a, s) {
    var v = a.toLowerCase();
    switch (typeof s) {
      case "function":
      case "symbol":
        return;
    }
    switch (a) {
      case "innerHTML":
      case "dangerouslySetInnerHTML":
      case "suppressContentEditableWarning":
      case "suppressHydrationWarning":
      case "style":
      case "ref":
        return;
      case "className":
        v = "class", a = "" + s;
        break;
      case "hidden":
        if (s === !1) return;
        a = "";
        break;
      case "src":
      case "href":
        s = Gt(s), a = "" + s;
        break;
      default:
        if (2 < a.length && (a[0] === "o" || a[0] === "O") && (a[1] === "n" || a[1] === "N") || !Rn(a))
          return;
        a = "" + s;
    }
    J(l, ya), J(
      l,
      fe(Ti(v))
    ), J(l, ya), J(
      l,
      fe(Ti(a))
    );
  }
  function ti() {
    return { styles: /* @__PURE__ */ new Set(), stylesheets: /* @__PURE__ */ new Set(), suspenseyImages: !1 };
  }
  function is(l) {
    var a = un || null;
    if (a) {
      var s = a.resumableState, v = a.renderState;
      if (typeof l == "string" && l) {
        if (!s.dnsResources.hasOwnProperty(l)) {
          s.dnsResources[l] = null, s = v.headers;
          var w, C;
          (C = s && 0 < s.remainingCapacity) && (C = (w = "<" + ("" + l).replace(
            Qa,
            hr
          ) + ">; rel=dns-prefetch", 0 <= (s.remainingCapacity -= w.length + 2))), C ? (v.resets.dns[l] = null, s.preconnects && (s.preconnects += ", "), s.preconnects += w) : (w = [], rt(w, { href: l, rel: "dns-prefetch" }), v.preconnects.add(w));
        }
        ka(a);
      }
    } else xr.D(l);
  }
  function Nu(l, a) {
    var s = un || null;
    if (s) {
      var v = s.resumableState, w = s.renderState;
      if (typeof l == "string" && l) {
        var C = a === "use-credentials" ? "credentials" : typeof a == "string" ? "anonymous" : "default";
        if (!v.connectResources[C].hasOwnProperty(l)) {
          v.connectResources[C][l] = null, v = w.headers;
          var k, _;
          if (_ = v && 0 < v.remainingCapacity) {
            if (_ = "<" + ("" + l).replace(
              Qa,
              hr
            ) + ">; rel=preconnect", typeof a == "string") {
              var O = ("" + a).replace(
                ir,
                ba
              );
              _ += '; crossorigin="' + O + '"';
            }
            _ = (k = _, 0 <= (v.remainingCapacity -= k.length + 2));
          }
          _ ? (w.resets.connect[C][l] = null, v.preconnects && (v.preconnects += ", "), v.preconnects += k) : (C = [], rt(C, {
            rel: "preconnect",
            href: l,
            crossOrigin: a
          }), w.preconnects.add(C));
        }
        ka(s);
      }
    } else xr.C(l, a);
  }
  function xi(l, a, s) {
    var v = un || null;
    if (v) {
      var w = v.resumableState, C = v.renderState;
      if (a && l) {
        switch (a) {
          case "image":
            if (s)
              var k = s.imageSrcSet, _ = s.imageSizes, O = s.fetchPriority;
            var z = k ? k + `
` + (_ || "") : l;
            if (w.imageResources.hasOwnProperty(z)) return;
            w.imageResources[z] = At, w = C.headers;
            var Z;
            w && 0 < w.remainingCapacity && typeof k != "string" && O === "high" && (Z = qc(l, a, s), 0 <= (w.remainingCapacity -= Z.length + 2)) ? (C.resets.image[z] = At, w.highImagePreloads && (w.highImagePreloads += ", "), w.highImagePreloads += Z) : (w = [], rt(
              w,
              Te(
                { rel: "preload", href: k ? void 0 : l, as: a },
                s
              )
            ), O === "high" ? C.highImagePreloads.add(w) : (C.bulkPreloads.add(w), C.preloads.images.set(z, w)));
            break;
          case "style":
            if (w.styleResources.hasOwnProperty(l)) return;
            k = [], rt(
              k,
              Te({ rel: "preload", href: l, as: a }, s)
            ), w.styleResources[l] = !s || typeof s.crossOrigin != "string" && typeof s.integrity != "string" ? At : [s.crossOrigin, s.integrity], C.preloads.stylesheets.set(l, k), C.bulkPreloads.add(k);
            break;
          case "script":
            if (w.scriptResources.hasOwnProperty(l)) return;
            k = [], C.preloads.scripts.set(l, k), C.bulkPreloads.add(k), rt(
              k,
              Te({ rel: "preload", href: l, as: a }, s)
            ), w.scriptResources[l] = !s || typeof s.crossOrigin != "string" && typeof s.integrity != "string" ? At : [s.crossOrigin, s.integrity];
            break;
          default:
            if (w.unknownResources.hasOwnProperty(a)) {
              if (k = w.unknownResources[a], k.hasOwnProperty(l))
                return;
            } else
              k = {}, w.unknownResources[a] = k;
            k[l] = At, (w = C.headers) && 0 < w.remainingCapacity && a === "font" && (z = qc(l, a, s), 0 <= (w.remainingCapacity -= z.length + 2)) ? (C.resets.font[l] = At, w.fontPreloads && (w.fontPreloads += ", "), w.fontPreloads += z) : (w = [], l = Te({ rel: "preload", href: l, as: a }, s), rt(w, l), a) === "font" ? C.fontPreloads.add(w) : C.bulkPreloads.add(w);
        }
        ka(v);
      }
    } else xr.L(l, a, s);
  }
  function Tc(l, a) {
    var s = un || null;
    if (s) {
      var v = s.resumableState, w = s.renderState;
      if (l) {
        var C = a && typeof a.as == "string" ? a.as : "script";
        switch (C) {
          case "script":
            if (v.moduleScriptResources.hasOwnProperty(l)) return;
            C = [], v.moduleScriptResources[l] = !a || typeof a.crossOrigin != "string" && typeof a.integrity != "string" ? At : [a.crossOrigin, a.integrity], w.preloads.moduleScripts.set(l, C);
            break;
          default:
            if (v.moduleUnknownResources.hasOwnProperty(C)) {
              var k = v.unknownResources[C];
              if (k.hasOwnProperty(l)) return;
            } else
              k = {}, v.moduleUnknownResources[C] = k;
            C = [], k[l] = At;
        }
        rt(C, Te({ rel: "modulepreload", href: l }, a)), w.bulkPreloads.add(C), ka(s);
      }
    } else xr.m(l, a);
  }
  function fr(l, a, s) {
    var v = un || null;
    if (v) {
      var w = v.resumableState, C = v.renderState;
      if (l) {
        a = a || "default";
        var k = C.styles.get(a), _ = w.styleResources.hasOwnProperty(l) ? w.styleResources[l] : void 0;
        _ !== null && (w.styleResources[l] = null, k || (k = {
          precedence: fe(Ge(a)),
          rules: [],
          hrefs: [],
          sheets: /* @__PURE__ */ new Map()
        }, C.styles.set(a, k)), a = {
          state: 0,
          props: Te(
            { rel: "stylesheet", href: l, "data-precedence": a },
            s
          )
        }, _ && (_.length === 2 && Za(a.props, _), (C = C.preloads.stylesheets.get(l)) && 0 < C.length ? C.length = 0 : a.state = 1), k.sheets.set(l, a), ka(v));
      }
    } else xr.S(l, a, s);
  }
  function Gi(l, a) {
    var s = un || null;
    if (s) {
      var v = s.resumableState, w = s.renderState;
      if (l) {
        var C = v.scriptResources.hasOwnProperty(l) ? v.scriptResources[l] : void 0;
        C !== null && (v.scriptResources[l] = null, a = Te({ src: l, async: !0 }, a), C && (C.length === 2 && Za(a, C), l = w.preloads.scripts.get(l)) && (l.length = 0), l = [], w.scripts.add(l), Co(l, a), ka(s));
      }
    } else xr.X(l, a);
  }
  function as(l, a) {
    var s = un || null;
    if (s) {
      var v = s.resumableState, w = s.renderState;
      if (l) {
        var C = v.moduleScriptResources.hasOwnProperty(
          l
        ) ? v.moduleScriptResources[l] : void 0;
        C !== null && (v.moduleScriptResources[l] = null, a = Te({ src: l, type: "module", async: !0 }, a), C && (C.length === 2 && Za(a, C), l = w.preloads.moduleScripts.get(l)) && (l.length = 0), l = [], w.scripts.add(l), Co(l, a), ka(s));
      }
    } else xr.M(l, a);
  }
  function Za(l, a) {
    l.crossOrigin == null && (l.crossOrigin = a[0]), l.integrity == null && (l.integrity = a[1]);
  }
  function qc(l, a, s) {
    l = ("" + l).replace(
      Qa,
      hr
    ), a = ("" + a).replace(
      ir,
      ba
    ), a = "<" + l + '>; rel=preload; as="' + a + '"';
    for (var v in s)
      me.call(s, v) && (l = s[v], typeof l == "string" && (a += "; " + v.toLowerCase() + '="' + ("" + l).replace(
        ir,
        ba
      ) + '"'));
    return a;
  }
  var Qa = /[<>\r\n]/g;
  function hr(l) {
    switch (l) {
      case "<":
        return "%3C";
      case ">":
        return "%3E";
      case `
`:
        return "%0A";
      case "\r":
        return "%0D";
      default:
        throw Error(
          "escapeLinkHrefForHeaderContextReplacer encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
        );
    }
  }
  var ir = /["';,\r\n]/g;
  function ba(l) {
    switch (l) {
      case '"':
        return "%22";
      case "'":
        return "%27";
      case ";":
        return "%3B";
      case ",":
        return "%2C";
      case `
`:
        return "%0A";
      case "\r":
        return "%0D";
      default:
        throw Error(
          "escapeStringForLinkHeaderQuotedParamValueContextReplacer encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
        );
    }
  }
  function qn(l) {
    this.styles.add(l);
  }
  function zn(l) {
    this.stylesheets.add(l);
  }
  function Ja(l, a) {
    a.styles.forEach(qn, l), a.stylesheets.forEach(zn, l), a.suspenseyImages && (l.suspenseyImages = !0);
  }
  function Io(l) {
    return 0 < l.stylesheets.size || l.suspenseyImages;
  }
  var $c = Function.prototype.bind, Do = /* @__PURE__ */ Symbol.for("react.client.reference");
  function Lu(l) {
    if (l == null) return null;
    if (typeof l == "function")
      return l.$$typeof === Do ? null : l.displayName || l.name || null;
    if (typeof l == "string") return l;
    switch (l) {
      case be:
        return "Fragment";
      case Tn:
        return "Profiler";
      case Oe:
        return "StrictMode";
      case P:
        return "Suspense";
      case N:
        return "SuspenseList";
      case ft:
        return "Activity";
    }
    if (typeof l == "object")
      switch (l.$$typeof) {
        case nn:
          return "Portal";
        case ie:
          return l.displayName || "Context";
        case Re:
          return (l._context.displayName || "Context") + ".Consumer";
        case He:
          var a = l.render;
          return l = l.displayName, l || (l = a.displayName || a.name || "", l = l !== "" ? "ForwardRef(" + l + ")" : "ForwardRef"), l;
        case Pe:
          return a = l.displayName || null, a !== null ? a : Lu(l.type) || "Memo";
        case ee:
          a = l._payload, l = l._init;
          try {
            return Lu(l(a));
          } catch {
          }
      }
    return null;
  }
  var Cs = {}, gt = null;
  function Xi(l, a) {
    if (l !== a) {
      l.context._currentValue = l.parentValue, l = l.parent;
      var s = a.parent;
      if (l === null) {
        if (s !== null) throw Error(W(401));
      } else {
        if (s === null) throw Error(W(401));
        Xi(l, s);
      }
      a.context._currentValue = a.value;
    }
  }
  function os(l) {
    l.context._currentValue = l.parentValue, l = l.parent, l !== null && os(l);
  }
  function i(l) {
    var a = l.parent;
    a !== null && i(a), l.context._currentValue = l.value;
  }
  function o(l, a) {
    if (l.context._currentValue = l.parentValue, l = l.parent, l === null) throw Error(W(402));
    l.depth === a.depth ? Xi(l, a) : o(l, a);
  }
  function f(l, a) {
    var s = a.parent;
    if (s === null) throw Error(W(402));
    l.depth === s.depth ? Xi(l, s) : f(l, s), a.context._currentValue = a.value;
  }
  function g(l) {
    var a = gt;
    a !== l && (a === null ? i(l) : l === null ? os(a) : a.depth === l.depth ? Xi(a, l) : a.depth > l.depth ? o(a, l) : f(a, l), gt = l);
  }
  var p = {
    enqueueSetState: function(l, a) {
      l = l._reactInternals, l.queue !== null && l.queue.push(a);
    },
    enqueueReplaceState: function(l, a) {
      l = l._reactInternals, l.replace = !0, l.queue = [a];
    },
    enqueueForceUpdate: function() {
    }
  }, m = { id: 1, overflow: "" };
  function A(l, a, s) {
    var v = l.id;
    l = l.overflow;
    var w = 32 - Q(v) - 1;
    v &= ~(1 << w), s += 1;
    var C = 32 - Q(a) + w;
    if (30 < C) {
      var k = w - w % 5;
      return C = (v & (1 << k) - 1).toString(32), v >>= k, w -= k, {
        id: 1 << 32 - Q(a) + w | s << w | v,
        overflow: C + l
      };
    }
    return {
      id: 1 << C | s << w | v,
      overflow: l
    };
  }
  var Q = Math.clz32 ? Math.clz32 : re, I = Math.log, G = Math.LN2;
  function re(l) {
    return l >>>= 0, l === 0 ? 32 : 31 - (I(l) / G | 0) | 0;
  }
  function $() {
  }
  var ve = Error(W(460));
  function Ne(l, a, s) {
    switch (s = l[s], s === void 0 ? l.push(a) : s !== a && (a.then($, $), a = s), a.status) {
      case "fulfilled":
        return a.value;
      case "rejected":
        throw a.reason;
      default:
        switch (typeof a.status == "string" ? a.then($, $) : (l = a, l.status = "pending", l.then(
          function(v) {
            if (a.status === "pending") {
              var w = a;
              w.status = "fulfilled", w.value = v;
            }
          },
          function(v) {
            if (a.status === "pending") {
              var w = a;
              w.status = "rejected", w.reason = v;
            }
          }
        )), a.status) {
          case "fulfilled":
            return a.value;
          case "rejected":
            throw a.reason;
        }
        throw on = a, ve;
    }
  }
  var on = null;
  function Ze() {
    if (on === null) throw Error(W(459));
    var l = on;
    return on = null, l;
  }
  function ze(l, a) {
    return l === a && (l !== 0 || 1 / l === 1 / a) || l !== l && a !== a;
  }
  var je = typeof Object.is == "function" ? Object.is : ze, Xe = null, at = null, cn = null, wn = null, Mn = null, en = null, vt = !1, Sn = !1, Rr = 0, Dn = 0, En = -1, An = 0, qe = null, Pn = null, qt = 0;
  function sn() {
    if (Xe === null)
      throw Error(W(321));
    return Xe;
  }
  function wa() {
    if (0 < qt) throw Error(W(312));
    return { memoizedState: null, queue: null, next: null };
  }
  function Zi() {
    return en === null ? Mn === null ? (vt = !1, Mn = en = wa()) : (vt = !0, en = Mn) : en.next === null ? (vt = !1, en = en.next = wa()) : (vt = !0, en = en.next), en;
  }
  function Cr() {
    var l = qe;
    return qe = null, l;
  }
  function Al() {
    wn = cn = at = Xe = null, Sn = !1, Mn = null, qt = 0, en = Pn = null;
  }
  function Pl(l, a) {
    return typeof a == "function" ? a(l) : a;
  }
  function Fl(l, a, s) {
    if (Xe = sn(), en = Zi(), vt) {
      var v = en.queue;
      if (a = v.dispatch, Pn !== null && (s = Pn.get(v), s !== void 0)) {
        Pn.delete(v), v = en.memoizedState;
        do
          v = l(v, s.action), s = s.next;
        while (s !== null);
        return en.memoizedState = v, [v, a];
      }
      return [en.memoizedState, a];
    }
    return l = l === Pl ? typeof a == "function" ? a() : a : s !== void 0 ? s(a) : a, en.memoizedState = l, l = en.queue = { last: null, dispatch: null }, l = l.dispatch = Qi.bind(
      null,
      Xe,
      l
    ), [en.memoizedState, l];
  }
  function Ei(l, a) {
    if (Xe = sn(), en = Zi(), a = a === void 0 ? null : a, en !== null) {
      var s = en.memoizedState;
      if (s !== null && a !== null) {
        var v = s[1];
        e: if (v === null) v = !1;
        else {
          for (var w = 0; w < v.length && w < a.length; w++)
            if (!je(a[w], v[w])) {
              v = !1;
              break e;
            }
          v = !0;
        }
        if (v) return s[0];
      }
    }
    return l = l(), en.memoizedState = [l, a], l;
  }
  function Qi(l, a, s) {
    if (25 <= qt) throw Error(W(301));
    if (l === Xe)
      if (Sn = !0, l = { action: s, next: null }, Pn === null && (Pn = /* @__PURE__ */ new Map()), s = Pn.get(a), s === void 0)
        Pn.set(a, l);
      else {
        for (a = s; a.next !== null; ) a = a.next;
        a.next = l;
      }
  }
  function Jt() {
    throw Error(W(440));
  }
  function Va() {
    throw Error(W(394));
  }
  function Ka() {
    throw Error(W(479));
  }
  function xc(l, a, s) {
    sn();
    var v = Dn++, w = cn;
    if (typeof l.$$FORM_ACTION == "function") {
      var C = null, k = wn;
      w = w.formState;
      var _ = l.$$IS_SIGNATURE_EQUAL;
      if (w !== null && typeof _ == "function") {
        var O = w[1];
        _.call(l, w[2], w[3]) && (C = s !== void 0 ? "p" + s : "k" + Ve(
          JSON.stringify([k, null, v]),
          0
        ), O === C && (En = v, a = w[0]));
      }
      var z = l.bind(null, a);
      return l = function(K) {
        z(K);
      }, typeof z.$$FORM_ACTION == "function" && (l.$$FORM_ACTION = function(K) {
        K = z.$$FORM_ACTION(K), s !== void 0 && (s += "", K.action = s);
        var xe = K.data;
        return xe && (C === null && (C = s !== void 0 ? "p" + s : "k" + Ve(
          JSON.stringify([
            k,
            null,
            v
          ]),
          0
        )), xe.append("$ACTION_KEY", C)), K;
      }), [a, l, !1];
    }
    var Z = l.bind(null, a);
    return [
      a,
      function(K) {
        Z(K);
      },
      !1
    ];
  }
  function eu(l) {
    var a = An;
    return An += 1, qe === null && (qe = []), Ne(qe, l, a);
  }
  function No() {
    throw Error(W(393));
  }
  var pa = {
    readContext: function(l) {
      return l._currentValue;
    },
    use: function(l) {
      if (l !== null && typeof l == "object") {
        if (typeof l.then == "function") return eu(l);
        if (l.$$typeof === ie) return l._currentValue;
      }
      throw Error(W(438, String(l)));
    },
    useContext: function(l) {
      return sn(), l._currentValue;
    },
    useMemo: Ei,
    useReducer: Fl,
    useRef: function(l) {
      Xe = sn(), en = Zi();
      var a = en.memoizedState;
      return a === null ? (l = { current: l }, en.memoizedState = l) : a;
    },
    useState: function(l) {
      return Fl(Pl, l);
    },
    useInsertionEffect: $,
    useLayoutEffect: $,
    useCallback: function(l, a) {
      return Ei(function() {
        return l;
      }, a);
    },
    useImperativeHandle: $,
    useEffect: $,
    useDebugValue: $,
    useDeferredValue: function(l, a) {
      return sn(), a !== void 0 ? a : l;
    },
    useTransition: function() {
      return sn(), [!1, Va];
    },
    useId: function() {
      var l = at.treeContext, a = l.overflow;
      l = l.id, l = (l & ~(1 << 32 - Q(l) - 1)).toString(32) + a;
      var s = mr;
      if (s === null) throw Error(W(404));
      return a = Rr++, l = "_" + s.idPrefix + "R_" + l, 0 < a && (l += "H" + a.toString(32)), l + "_";
    },
    useSyncExternalStore: function(l, a, s) {
      if (s === void 0)
        throw Error(W(407));
      return s();
    },
    useOptimistic: function(l) {
      return sn(), [l, Ka];
    },
    useActionState: xc,
    useFormState: xc,
    useHostTransitionStatus: function() {
      return sn(), De;
    },
    useMemoCache: function(l) {
      for (var a = Array(l), s = 0; s < l; s++)
        a[s] = Yt;
      return a;
    },
    useCacheRefresh: function() {
      return No;
    },
    useEffectEvent: function() {
      return Jt;
    }
  }, mr = null, Ec = {
    getCacheForType: function() {
      throw Error(W(248));
    },
    cacheSignal: function() {
      throw Error(W(248));
    }
  }, kr, Rl;
  function Ji(l) {
    if (kr === void 0)
      try {
        throw Error();
      } catch (s) {
        var a = s.stack.trim().match(/\n( *(at )?)/);
        kr = a && a[1] || "", Rl = -1 < s.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < s.stack.indexOf("@") ? "@unknown:0:0" : "";
      }
    return `
` + kr + l + Rl;
  }
  var Rc = !1;
  function Vi(l, a) {
    if (!l || Rc) return "";
    Rc = !0;
    var s = Error.prepareStackTrace;
    Error.prepareStackTrace = void 0;
    try {
      var v = {
        DetermineComponentFrameRoot: function() {
          try {
            if (a) {
              var K = function() {
                throw Error();
              };
              if (Object.defineProperty(K.prototype, "props", {
                set: function() {
                  throw Error();
                }
              }), typeof Reflect == "object" && Reflect.construct) {
                try {
                  Reflect.construct(K, []);
                } catch (pe) {
                  var xe = pe;
                }
                Reflect.construct(l, [], K);
              } else {
                try {
                  K.call();
                } catch (pe) {
                  xe = pe;
                }
                l.call(K.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (pe) {
                xe = pe;
              }
              (K = l()) && typeof K.catch == "function" && K.catch(function() {
              });
            }
          } catch (pe) {
            if (pe && xe && typeof pe.stack == "string")
              return [pe.stack, xe.stack];
          }
          return [null, null];
        }
      };
      v.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
      var w = Object.getOwnPropertyDescriptor(
        v.DetermineComponentFrameRoot,
        "name"
      );
      w && w.configurable && Object.defineProperty(
        v.DetermineComponentFrameRoot,
        "name",
        { value: "DetermineComponentFrameRoot" }
      );
      var C = v.DetermineComponentFrameRoot(), k = C[0], _ = C[1];
      if (k && _) {
        var O = k.split(`
`), z = _.split(`
`);
        for (w = v = 0; v < O.length && !O[v].includes("DetermineComponentFrameRoot"); )
          v++;
        for (; w < z.length && !z[w].includes(
          "DetermineComponentFrameRoot"
        ); )
          w++;
        if (v === O.length || w === z.length)
          for (v = O.length - 1, w = z.length - 1; 1 <= v && 0 <= w && O[v] !== z[w]; )
            w--;
        for (; 1 <= v && 0 <= w; v--, w--)
          if (O[v] !== z[w]) {
            if (v !== 1 || w !== 1)
              do
                if (v--, w--, 0 > w || O[v] !== z[w]) {
                  var Z = `
` + O[v].replace(" at new ", " at ");
                  return l.displayName && Z.includes("<anonymous>") && (Z = Z.replace("<anonymous>", l.displayName)), Z;
                }
              while (1 <= v && 0 <= w);
            break;
          }
      }
    } finally {
      Rc = !1, Error.prepareStackTrace = s;
    }
    return (s = l ? l.displayName || l.name : "") ? Ji(s) : "";
  }
  function nu(l) {
    if (typeof l == "string") return Ji(l);
    if (typeof l == "function")
      return l.prototype && l.prototype.isReactComponent ? Vi(l, !0) : Vi(l, !1);
    if (typeof l == "object" && l !== null) {
      switch (l.$$typeof) {
        case He:
          return Vi(l.render, !1);
        case Pe:
          return Vi(l.type, !1);
        case ee:
          var a = l, s = a._payload;
          a = a._init;
          try {
            l = a(s);
          } catch {
            return Ji("Lazy");
          }
          return nu(l);
      }
      if (typeof l.name == "string") {
        e: {
          s = l.name, a = l.env;
          var v = l.debugLocation;
          if (v != null && (l = Error.prepareStackTrace, Error.prepareStackTrace = void 0, v = v.stack, Error.prepareStackTrace = l, v.startsWith(`Error: react-stack-top-frame
`) && (v = v.slice(29)), l = v.indexOf(`
`), l !== -1 && (v = v.slice(l + 1)), l = v.indexOf("react_stack_bottom_frame"), l !== -1 && (l = v.lastIndexOf(`
`, l)), l = l !== -1 ? v = v.slice(0, l) : "", v = l.lastIndexOf(`
`), l = v === -1 ? l : l.slice(v + 1), l.indexOf(s) !== -1)) {
            s = `
` + l;
            break e;
          }
          s = Ji(
            s + (a ? " [" + a + "]" : "")
          );
        }
        return s;
      }
    }
    switch (l) {
      case N:
        return Ji("SuspenseList");
      case P:
        return Ji("Suspense");
    }
    return "";
  }
  function Lt(l, a) {
    return (500 < a.byteSize || Io(a.contentState)) && a.contentPreamble === null;
  }
  function Cc(l) {
    if (typeof l == "object" && l !== null && typeof l.environmentName == "string") {
      var a = l.environmentName;
      l = [l].slice(0), typeof l[0] == "string" ? l.splice(
        0,
        1,
        "%c%s%c " + l[0],
        "background: #e6e6e6;background: light-dark(rgba(0,0,0,0.1), rgba(255,255,255,0.25));color: #000000;color: light-dark(#000000, #ffffff);border-radius: 2px",
        " " + a + " ",
        ""
      ) : l.splice(
        0,
        0,
        "%c%s%c",
        "background: #e6e6e6;background: light-dark(rgba(0,0,0,0.1), rgba(255,255,255,0.25));color: #000000;color: light-dark(#000000, #ffffff);border-radius: 2px",
        " " + a + " ",
        ""
      ), l.unshift(console), a = $c.apply(console.error, l), a();
    } else console.error(l);
    return null;
  }
  function Ta(l, a, s, v, w, C, k, _, O, z, Z) {
    var K = /* @__PURE__ */ new Set();
    this.destination = null, this.flushScheduled = !1, this.resumableState = l, this.renderState = a, this.rootFormatContext = s, this.progressiveChunkSize = v === void 0 ? 12800 : v, this.status = 10, this.fatalError = null, this.pendingRootTasks = this.allPendingTasks = this.nextSegmentId = 0, this.completedPreambleSegments = this.completedRootSegment = null, this.byteSize = 0, this.abortableTasks = K, this.pingedTasks = [], this.clientRenderedBoundaries = [], this.completedBoundaries = [], this.partialBoundaries = [], this.trackedPostpones = null, this.onError = w === void 0 ? Cc : w, this.onPostpone = z === void 0 ? $ : z, this.onAllReady = C === void 0 ? $ : C, this.onShellReady = k === void 0 ? $ : k, this.onShellError = _ === void 0 ? $ : _, this.onFatalError = O === void 0 ? $ : O, this.formState = Z === void 0 ? null : Z;
  }
  function Lo(l, a, s, v, w, C, k, _, O, z, Z, K) {
    return a = new Ta(
      a,
      s,
      v,
      w,
      C,
      k,
      _,
      O,
      z,
      Z,
      K
    ), s = Zr(
      a,
      0,
      null,
      v,
      !1,
      !1
    ), s.parentFlushed = !0, l = xa(
      a,
      null,
      l,
      -1,
      null,
      s,
      null,
      null,
      a.abortableTasks,
      null,
      v,
      null,
      m,
      null,
      null
    ), Ea(l), a.pingedTasks.push(l), a;
  }
  function ja(l, a, s, v, w, C, k, _, O, z, Z) {
    return l = Lo(
      l,
      a,
      s,
      v,
      w,
      C,
      k,
      _,
      O,
      z,
      Z,
      void 0
    ), l.trackedPostpones = {
      workingMap: /* @__PURE__ */ new Map(),
      rootNodes: [],
      rootSlots: null
    }, l;
  }
  function Ot(l, a, s, v, w, C, k, _, O) {
    return s = new Ta(
      a.resumableState,
      s,
      a.rootFormatContext,
      a.progressiveChunkSize,
      v,
      w,
      C,
      k,
      _,
      O,
      null
    ), s.nextSegmentId = a.nextSegmentId, typeof a.replaySlots == "number" ? (v = Zr(
      s,
      0,
      null,
      a.rootFormatContext,
      !1,
      !1
    ), v.parentFlushed = !0, l = xa(
      s,
      null,
      l,
      -1,
      null,
      v,
      null,
      null,
      s.abortableTasks,
      null,
      a.rootFormatContext,
      null,
      m,
      null,
      null
    ), Ea(l), s.pingedTasks.push(l), s) : (l = yt(
      s,
      null,
      {
        nodes: a.replayNodes,
        slots: a.replaySlots,
        pendingTasks: 0
      },
      l,
      -1,
      null,
      null,
      s.abortableTasks,
      null,
      a.rootFormatContext,
      null,
      m,
      null,
      null
    ), Ea(l), s.pingedTasks.push(l), s);
  }
  function Cl(l, a, s, v, w, C, k, _, O) {
    return l = Ot(
      l,
      a,
      s,
      v,
      w,
      C,
      k,
      _,
      O
    ), l.trackedPostpones = {
      workingMap: /* @__PURE__ */ new Map(),
      rootNodes: [],
      rootSlots: null
    }, l;
  }
  var un = null;
  function Ki(l, a) {
    l.pingedTasks.push(a), l.pingedTasks.length === 1 && (l.flushScheduled = l.destination !== null, l.trackedPostpones !== null || l.status === 10 ? qr(function() {
      return cs(l);
    }) : Kn(function() {
      return cs(l);
    }));
  }
  function Bo(l, a, s, v, w) {
    return s = {
      status: 0,
      rootSegmentID: -1,
      parentFlushed: !1,
      pendingTasks: 0,
      row: a,
      completedSegments: [],
      byteSize: 0,
      fallbackAbortableTasks: s,
      errorDigest: null,
      contentState: ti(),
      fallbackState: ti(),
      contentPreamble: v,
      fallbackPreamble: w,
      trackedContentKeyPath: null,
      trackedFallbackNode: null
    }, a !== null && (a.pendingTasks++, v = a.boundaries, v !== null && (l.allPendingTasks++, s.pendingTasks++, v.push(s)), l = a.inheritedHoistables, l !== null && Ja(s.contentState, l)), s;
  }
  function xa(l, a, s, v, w, C, k, _, O, z, Z, K, xe, pe, yn) {
    l.allPendingTasks++, w === null ? l.pendingRootTasks++ : w.pendingTasks++, pe !== null && pe.pendingTasks++;
    var Qe = {
      replay: null,
      node: s,
      childIndex: v,
      ping: function() {
        return Ki(l, Qe);
      },
      blockedBoundary: w,
      blockedSegment: C,
      blockedPreamble: k,
      hoistableState: _,
      abortSet: O,
      keyPath: z,
      formatContext: Z,
      context: K,
      treeContext: xe,
      row: pe,
      componentStack: yn,
      thenableState: a
    };
    return O.add(Qe), Qe;
  }
  function yt(l, a, s, v, w, C, k, _, O, z, Z, K, xe, pe) {
    l.allPendingTasks++, C === null ? l.pendingRootTasks++ : C.pendingTasks++, xe !== null && xe.pendingTasks++, s.pendingTasks++;
    var yn = {
      replay: s,
      node: v,
      childIndex: w,
      ping: function() {
        return Ki(l, yn);
      },
      blockedBoundary: C,
      blockedSegment: null,
      blockedPreamble: null,
      hoistableState: k,
      abortSet: _,
      keyPath: O,
      formatContext: z,
      context: Z,
      treeContext: K,
      row: xe,
      componentStack: pe,
      thenableState: a
    };
    return _.add(yn), yn;
  }
  function Zr(l, a, s, v, w, C) {
    return {
      status: 0,
      parentFlushed: !1,
      id: -1,
      index: a,
      chunks: [],
      children: [],
      preambleChildren: [],
      parentFormatContext: v,
      boundary: s,
      lastPushedText: w,
      textEmbedded: C
    };
  }
  function Ea(l) {
    var a = l.node;
    typeof a == "object" && a !== null && a.$$typeof === ke && (l.componentStack = { parent: l.componentStack, type: a.type });
  }
  function qa(l) {
    return l === null ? null : { parent: l.parent, type: "Suspense Fallback" };
  }
  function Ol(l) {
    var a = {};
    return l && Object.defineProperty(a, "componentStack", {
      configurable: !0,
      enumerable: !0,
      get: function() {
        try {
          var s = "", v = l;
          do
            s += nu(v.type), v = v.parent;
          while (v);
          var w = s;
        } catch (C) {
          w = `
Error generating stack: ` + C.message + `
` + C.stack;
        }
        return Object.defineProperty(a, "componentStack", {
          value: w
        }), w;
      }
    }), a;
  }
  function dr(l, a, s) {
    if (l = l.onError, a = l(a, s), a == null || typeof a == "string") return a;
  }
  function _o(l, a) {
    var s = l.onShellError, v = l.onFatalError;
    s(a), v(a), l.destination !== null ? (l.status = 14, we(l.destination, a)) : (l.status = 13, l.fatalError = a);
  }
  function Sr(l, a) {
    Bu(l, a.next, a.hoistables);
  }
  function Bu(l, a, s) {
    for (; a !== null; ) {
      s !== null && (Ja(a.hoistables, s), a.inheritedHoistables = s);
      var v = a.boundaries;
      if (v !== null) {
        a.boundaries = null;
        for (var w = 0; w < v.length; w++) {
          var C = v[w];
          s !== null && Ja(C.contentState, s), Ml(l, C, null, null);
        }
      }
      if (a.pendingTasks--, 0 < a.pendingTasks) break;
      s = a.hoistables, a = a.next;
    }
  }
  function $a(l, a) {
    var s = a.boundaries;
    if (s !== null && a.pendingTasks === s.length) {
      for (var v = !0, w = 0; w < s.length; w++) {
        var C = s[w];
        if (C.pendingTasks !== 1 || C.parentFlushed || Lt(l, C)) {
          v = !1;
          break;
        }
      }
      v && Bu(l, a, a.hoistables);
    }
  }
  function mc(l) {
    var a = {
      pendingTasks: 1,
      boundaries: null,
      hoistables: ti(),
      inheritedHoistables: null,
      together: !1,
      next: null
    };
    return l !== null && 0 < l.pendingTasks && (a.pendingTasks++, a.boundaries = [], l.next = a), a;
  }
  function tu(l, a, s, v, w) {
    var C = a.keyPath, k = a.treeContext, _ = a.row;
    a.keyPath = s, s = v.length;
    var O = null;
    if (a.replay !== null) {
      var z = a.replay.slots;
      if (z !== null && typeof z == "object")
        for (var Z = 0; Z < s; Z++) {
          var K = w !== "backwards" && w !== "unstable_legacy-backwards" ? Z : s - 1 - Z, xe = v[K];
          a.row = O = mc(
            O
          ), a.treeContext = A(k, s, K);
          var pe = z[K];
          typeof pe == "number" ? (no(l, a, pe, xe, K), delete z[K]) : Bt(l, a, xe, K), --O.pendingTasks === 0 && Sr(l, O);
        }
      else
        for (z = 0; z < s; z++)
          Z = w !== "backwards" && w !== "unstable_legacy-backwards" ? z : s - 1 - z, K = v[Z], a.row = O = mc(O), a.treeContext = A(k, s, Z), Bt(l, a, K, Z), --O.pendingTasks === 0 && Sr(l, O);
    } else if (w !== "backwards" && w !== "unstable_legacy-backwards")
      for (w = 0; w < s; w++)
        z = v[w], a.row = O = mc(O), a.treeContext = A(
          k,
          s,
          w
        ), Bt(l, a, z, w), --O.pendingTasks === 0 && Sr(l, O);
    else {
      for (w = a.blockedSegment, z = w.children.length, Z = w.chunks.length, K = s - 1; 0 <= K; K--) {
        xe = v[K], a.row = O = mc(
          O
        ), a.treeContext = A(k, s, K), pe = Zr(
          l,
          Z,
          null,
          a.formatContext,
          K === 0 ? w.lastPushedText : !0,
          !0
        ), w.children.splice(z, 0, pe), a.blockedSegment = pe;
        try {
          Bt(l, a, xe, K), pe.lastPushedText && pe.textEmbedded && pe.chunks.push(We), pe.status = 1, Ra(l, a.blockedBoundary, pe), --O.pendingTasks === 0 && Sr(l, O);
        } catch (yn) {
          throw pe.status = l.status === 12 ? 3 : 4, yn;
        }
      }
      a.blockedSegment = w, w.lastPushedText = !1;
    }
    _ !== null && O !== null && 0 < O.pendingTasks && (_.pendingTasks++, O.next = _), a.treeContext = k, a.row = _, a.keyPath = C;
  }
  function ru(l, a, s, v, w, C) {
    var k = a.thenableState;
    for (a.thenableState = null, Xe = {}, at = a, cn = l, wn = s, Dn = Rr = 0, En = -1, An = 0, qe = k, l = v(w, C); Sn; )
      Sn = !1, Dn = Rr = 0, En = -1, An = 0, qt += 1, en = null, l = v(w, C);
    return Al(), l;
  }
  function Ri(l, a, s, v, w, C, k) {
    var _ = !1;
    if (C !== 0 && l.formState !== null) {
      var O = a.blockedSegment;
      if (O !== null) {
        _ = !0, O = O.chunks;
        for (var z = 0; z < C; z++)
          z === k ? O.push(ku) : O.push(Yc);
      }
    }
    C = a.keyPath, a.keyPath = s, w ? (s = a.treeContext, a.treeContext = A(s, 1, 0), Bt(l, a, v, -1), a.treeContext = s) : _ ? Bt(l, a, v, -1) : Ar(l, a, v, -1), a.keyPath = C;
  }
  function eo(l, a, s, v, w, C) {
    if (typeof v == "function")
      if (v.prototype && v.prototype.isReactComponent) {
        var k = w;
        if ("ref" in w) {
          k = {};
          for (var _ in w)
            _ !== "ref" && (k[_] = w[_]);
        }
        var O = v.defaultProps;
        if (O) {
          k === w && (k = Te({}, k, w));
          for (var z in O)
            k[z] === void 0 && (k[z] = O[z]);
        }
        w = k, k = Cs, O = v.contextType, typeof O == "object" && O !== null && (k = O._currentValue), k = new v(w, k);
        var Z = k.state !== void 0 ? k.state : null;
        if (k.updater = p, k.props = w, k.state = Z, O = { queue: [], replace: !1 }, k._reactInternals = O, C = v.contextType, k.context = typeof C == "object" && C !== null ? C._currentValue : Cs, C = v.getDerivedStateFromProps, typeof C == "function" && (C = C(w, Z), Z = C == null ? Z : Te({}, Z, C), k.state = Z), typeof v.getDerivedStateFromProps != "function" && typeof k.getSnapshotBeforeUpdate != "function" && (typeof k.UNSAFE_componentWillMount == "function" || typeof k.componentWillMount == "function"))
          if (v = k.state, typeof k.componentWillMount == "function" && k.componentWillMount(), typeof k.UNSAFE_componentWillMount == "function" && k.UNSAFE_componentWillMount(), v !== k.state && p.enqueueReplaceState(
            k,
            k.state,
            null
          ), O.queue !== null && 0 < O.queue.length)
            if (v = O.queue, C = O.replace, O.queue = null, O.replace = !1, C && v.length === 1)
              k.state = v[0];
            else {
              for (O = C ? v[0] : k.state, Z = !0, C = C ? 1 : 0; C < v.length; C++)
                z = v[C], z = typeof z == "function" ? z.call(k, O, w, void 0) : z, z != null && (Z ? (Z = !1, O = Te({}, O, z)) : Te(O, z));
              k.state = O;
            }
          else O.queue = null;
        if (v = k.render(), l.status === 12) throw null;
        w = a.keyPath, a.keyPath = s, Ar(l, a, v, -1), a.keyPath = w;
      } else {
        if (v = ru(l, a, s, v, w, void 0), l.status === 12) throw null;
        Ri(
          l,
          a,
          s,
          v,
          Rr !== 0,
          Dn,
          En
        );
      }
    else if (typeof v == "string")
      if (k = a.blockedSegment, k === null)
        k = w.children, O = a.formatContext, Z = a.keyPath, a.formatContext = Fe(O, v, w), a.keyPath = s, Bt(l, a, k, -1), a.formatContext = O, a.keyPath = Z;
      else {
        if (Z = sc(
          k.chunks,
          v,
          w,
          l.resumableState,
          l.renderState,
          a.blockedPreamble,
          a.hoistableState,
          a.formatContext,
          k.lastPushedText
        ), k.lastPushedText = !1, O = a.formatContext, C = a.keyPath, a.keyPath = s, (a.formatContext = Fe(O, v, w)).insertionMode === 3) {
          s = Zr(
            l,
            0,
            null,
            a.formatContext,
            !1,
            !1
          ), k.preambleChildren.push(s), a.blockedSegment = s;
          try {
            s.status = 6, Bt(l, a, Z, -1), s.lastPushedText && s.textEmbedded && s.chunks.push(We), s.status = 1, Ra(l, a.blockedBoundary, s);
          } finally {
            a.blockedSegment = k;
          }
        } else Bt(l, a, Z, -1);
        a.formatContext = O, a.keyPath = C;
        e: {
          switch (a = k.chunks, l = l.resumableState, v) {
            case "title":
            case "style":
            case "script":
            case "area":
            case "base":
            case "br":
            case "col":
            case "embed":
            case "hr":
            case "img":
            case "input":
            case "keygen":
            case "link":
            case "meta":
            case "param":
            case "source":
            case "track":
            case "wbr":
              break e;
            case "body":
              if (1 >= O.insertionMode) {
                l.hasBody = !0;
                break e;
              }
              break;
            case "html":
              if (O.insertionMode === 0) {
                l.hasHtml = !0;
                break e;
              }
              break;
            case "head":
              if (1 >= O.insertionMode) break e;
          }
          a.push(yi(v));
        }
        k.lastPushedText = !1;
      }
    else {
      switch (v) {
        case tr:
        case Oe:
        case Tn:
        case be:
          v = a.keyPath, a.keyPath = s, Ar(l, a, w.children, -1), a.keyPath = v;
          return;
        case ft:
          v = a.blockedSegment, v === null ? w.mode !== "hidden" && (v = a.keyPath, a.keyPath = s, Bt(l, a, w.children, -1), a.keyPath = v) : w.mode !== "hidden" && (v.chunks.push(Wr), v.lastPushedText = !1, k = a.keyPath, a.keyPath = s, Bt(l, a, w.children, -1), a.keyPath = k, v.chunks.push(dc), v.lastPushedText = !1);
          return;
        case N:
          e: {
            if (v = w.children, w = w.revealOrder, w === "forwards" || w === "backwards" || w === "unstable_legacy-backwards") {
              if (Ie(v)) {
                tu(l, a, s, v, w);
                break e;
              }
              if ((k = Vn(v)) && (k = k.call(v))) {
                if (O = k.next(), !O.done) {
                  do
                    O = k.next();
                  while (!O.done);
                  tu(l, a, s, v, w);
                }
                break e;
              }
            }
            w === "together" ? (w = a.keyPath, k = a.row, O = a.row = mc(null), O.boundaries = [], O.together = !0, a.keyPath = s, Ar(l, a, v, -1), --O.pendingTasks === 0 && Sr(l, O), a.keyPath = w, a.row = k, k !== null && 0 < O.pendingTasks && (k.pendingTasks++, O.next = k)) : (w = a.keyPath, a.keyPath = s, Ar(l, a, v, -1), a.keyPath = w);
          }
          return;
        case Gl:
        case X:
          throw Error(W(343));
        case P:
          e: if (a.replay !== null) {
            v = a.keyPath, k = a.formatContext, O = a.row, a.keyPath = s, a.formatContext = an(
              l.resumableState,
              k
            ), a.row = null, s = w.children;
            try {
              Bt(l, a, s, -1);
            } finally {
              a.keyPath = v, a.formatContext = k, a.row = O;
            }
          } else {
            v = a.keyPath, C = a.formatContext;
            var K = a.row;
            z = a.blockedBoundary, _ = a.blockedPreamble;
            var xe = a.hoistableState, pe = a.blockedSegment, yn = w.fallback;
            w = w.children;
            var Qe = /* @__PURE__ */ new Set(), bn = 2 > a.formatContext.insertionMode ? Bo(
              l,
              a.row,
              Qe,
              L(),
              L()
            ) : Bo(
              l,
              a.row,
              Qe,
              null,
              null
            );
            l.trackedPostpones !== null && (bn.trackedContentKeyPath = s);
            var bt = Zr(
              l,
              pe.chunks.length,
              bn,
              a.formatContext,
              !1,
              !1
            );
            pe.children.push(bt), pe.lastPushedText = !1;
            var $n = Zr(
              l,
              0,
              null,
              a.formatContext,
              !1,
              !1
            );
            if ($n.parentFlushed = !0, l.trackedPostpones !== null) {
              k = a.componentStack, O = [s[0], "Suspense Fallback", s[2]], Z = [O[1], O[2], [], null], l.trackedPostpones.workingMap.set(O, Z), bn.trackedFallbackNode = Z, a.blockedSegment = bt, a.blockedPreamble = bn.fallbackPreamble, a.keyPath = O, a.formatContext = Ke(
                l.resumableState,
                C
              ), a.componentStack = qa(k), bt.status = 6;
              try {
                Bt(l, a, yn, -1), bt.lastPushedText && bt.textEmbedded && bt.chunks.push(We), bt.status = 1, Ra(l, z, bt);
              } catch (gr) {
                throw bt.status = l.status === 12 ? 3 : 4, gr;
              } finally {
                a.blockedSegment = pe, a.blockedPreamble = _, a.keyPath = v, a.formatContext = C;
              }
              a = xa(
                l,
                null,
                w,
                -1,
                bn,
                $n,
                bn.contentPreamble,
                bn.contentState,
                a.abortSet,
                s,
                an(
                  l.resumableState,
                  a.formatContext
                ),
                a.context,
                a.treeContext,
                null,
                k
              ), Ea(a), l.pingedTasks.push(a);
            } else {
              a.blockedBoundary = bn, a.blockedPreamble = bn.contentPreamble, a.hoistableState = bn.contentState, a.blockedSegment = $n, a.keyPath = s, a.formatContext = an(
                l.resumableState,
                C
              ), a.row = null, $n.status = 6;
              try {
                if (Bt(l, a, w, -1), $n.lastPushedText && $n.textEmbedded && $n.chunks.push(We), $n.status = 1, Ra(l, bn, $n), cu(bn, $n), bn.pendingTasks === 0 && bn.status === 0) {
                  if (bn.status = 1, !Lt(l, bn)) {
                    K !== null && --K.pendingTasks === 0 && Sr(l, K), l.pendingRootTasks === 0 && a.blockedPreamble && ri(l);
                    break e;
                  }
                } else
                  K !== null && K.together && $a(l, K);
              } catch (gr) {
                bn.status = 4, l.status === 12 ? ($n.status = 3, k = l.fatalError) : ($n.status = 4, k = gr), O = Ol(a.componentStack), Z = dr(
                  l,
                  k,
                  O
                ), bn.errorDigest = Z, lu(l, bn);
              } finally {
                a.blockedBoundary = z, a.blockedPreamble = _, a.hoistableState = xe, a.blockedSegment = pe, a.keyPath = v, a.formatContext = C, a.row = K;
              }
              a = xa(
                l,
                null,
                yn,
                -1,
                z,
                bt,
                bn.fallbackPreamble,
                bn.fallbackState,
                Qe,
                [s[0], "Suspense Fallback", s[2]],
                Ke(
                  l.resumableState,
                  a.formatContext
                ),
                a.context,
                a.treeContext,
                a.row,
                qa(
                  a.componentStack
                )
              ), Ea(a), l.pingedTasks.push(a);
            }
          }
          return;
      }
      if (typeof v == "object" && v !== null)
        switch (v.$$typeof) {
          case He:
            if ("ref" in w)
              for (pe in k = {}, w)
                pe !== "ref" && (k[pe] = w[pe]);
            else k = w;
            v = ru(
              l,
              a,
              s,
              v.render,
              k,
              C
            ), Ri(
              l,
              a,
              s,
              v,
              Rr !== 0,
              Dn,
              En
            );
            return;
          case Pe:
            eo(l, a, s, v.type, w, C);
            return;
          case ie:
            if (O = w.children, k = a.keyPath, w = w.value, Z = v._currentValue, v._currentValue = w, C = gt, gt = v = {
              parent: C,
              depth: C === null ? 0 : C.depth + 1,
              context: v,
              parentValue: Z,
              value: w
            }, a.context = v, a.keyPath = s, Ar(l, a, O, -1), l = gt, l === null) throw Error(W(403));
            l.context._currentValue = l.parentValue, l = gt = l.parent, a.context = l, a.keyPath = k;
            return;
          case Re:
            w = w.children, v = w(v._context._currentValue), w = a.keyPath, a.keyPath = s, Ar(l, a, v, -1), a.keyPath = w;
            return;
          case ee:
            if (k = v._init, v = k(v._payload), l.status === 12) throw null;
            eo(l, a, s, v, w, C);
            return;
        }
      throw Error(
        W(130, v == null ? v : typeof v, "")
      );
    }
  }
  function no(l, a, s, v, w) {
    var C = a.replay, k = a.blockedBoundary, _ = Zr(
      l,
      0,
      null,
      a.formatContext,
      !1,
      !1
    );
    _.id = s, _.parentFlushed = !0;
    try {
      a.replay = null, a.blockedSegment = _, Bt(l, a, v, w), _.status = 1, Ra(l, k, _), k === null ? l.completedRootSegment = _ : (cu(k, _), k.parentFlushed && l.partialBoundaries.push(k));
    } finally {
      a.replay = C, a.blockedSegment = null;
    }
  }
  function Ar(l, a, s, v) {
    a.replay !== null && typeof a.replay.slots == "number" ? no(l, a, a.replay.slots, s, v) : (a.node = s, a.childIndex = v, s = a.componentStack, Ea(a), kc(l, a), a.componentStack = s);
  }
  function kc(l, a) {
    var s = a.node, v = a.childIndex;
    if (s !== null) {
      if (typeof s == "object") {
        switch (s.$$typeof) {
          case ke:
            var w = s.type, C = s.key, k = s.props;
            s = k.ref;
            var _ = s !== void 0 ? s : null, O = Lu(w), z = C ?? (v === -1 ? 0 : v);
            if (C = [a.keyPath, O, z], a.replay !== null)
              e: {
                var Z = a.replay;
                for (v = Z.nodes, s = 0; s < v.length; s++) {
                  var K = v[s];
                  if (z === K[1]) {
                    if (K.length === 4) {
                      if (O !== null && O !== K[0])
                        throw Error(
                          W(490, K[0], O)
                        );
                      var xe = K[2];
                      O = K[3], z = a.node, a.replay = {
                        nodes: xe,
                        slots: O,
                        pendingTasks: 1
                      };
                      try {
                        if (eo(l, a, C, w, k, _), a.replay.pendingTasks === 1 && 0 < a.replay.nodes.length)
                          throw Error(W(488));
                        a.replay.pendingTasks--;
                      } catch (Je) {
                        if (typeof Je == "object" && Je !== null && (Je === ve || typeof Je.then == "function"))
                          throw a.node === z ? a.replay = Z : v.splice(s, 1), Je;
                        a.replay.pendingTasks--, k = Ol(a.componentStack), C = l, l = a.blockedBoundary, w = Je, k = dr(C, w, k), Ac(
                          C,
                          l,
                          xe,
                          O,
                          w,
                          k
                        );
                      }
                      a.replay = Z;
                    } else {
                      if (w !== P)
                        throw Error(
                          W(
                            490,
                            "Suspense",
                            Lu(w) || "Unknown"
                          )
                        );
                      n: {
                        Z = void 0, w = K[5], _ = K[2], O = K[3], z = K[4] === null ? [] : K[4][2], K = K[4] === null ? null : K[4][3];
                        var pe = a.keyPath, yn = a.formatContext, Qe = a.row, bn = a.replay, bt = a.blockedBoundary, $n = a.hoistableState, gr = k.children, ll = k.fallback, Dl = /* @__PURE__ */ new Set();
                        k = 2 > a.formatContext.insertionMode ? Bo(
                          l,
                          a.row,
                          Dl,
                          L(),
                          L()
                        ) : Bo(
                          l,
                          a.row,
                          Dl,
                          null,
                          null
                        ), k.parentFlushed = !0, k.rootSegmentID = w, a.blockedBoundary = k, a.hoistableState = k.contentState, a.keyPath = C, a.formatContext = an(
                          l.resumableState,
                          yn
                        ), a.row = null, a.replay = {
                          nodes: _,
                          slots: O,
                          pendingTasks: 1
                        };
                        try {
                          if (Bt(l, a, gr, -1), a.replay.pendingTasks === 1 && 0 < a.replay.nodes.length)
                            throw Error(W(488));
                          if (a.replay.pendingTasks--, k.pendingTasks === 0 && k.status === 0) {
                            k.status = 1, l.completedBoundaries.push(k);
                            break n;
                          }
                        } catch (Je) {
                          k.status = 4, xe = Ol(a.componentStack), Z = dr(
                            l,
                            Je,
                            xe
                          ), k.errorDigest = Z, a.replay.pendingTasks--, l.clientRenderedBoundaries.push(k);
                        } finally {
                          a.blockedBoundary = bt, a.hoistableState = $n, a.replay = bn, a.keyPath = pe, a.formatContext = yn, a.row = Qe;
                        }
                        xe = yt(
                          l,
                          null,
                          {
                            nodes: z,
                            slots: K,
                            pendingTasks: 0
                          },
                          ll,
                          -1,
                          bt,
                          k.fallbackState,
                          Dl,
                          [C[0], "Suspense Fallback", C[2]],
                          Ke(
                            l.resumableState,
                            a.formatContext
                          ),
                          a.context,
                          a.treeContext,
                          a.row,
                          qa(
                            a.componentStack
                          )
                        ), Ea(xe), l.pingedTasks.push(xe);
                      }
                    }
                    v.splice(s, 1);
                    break e;
                  }
                }
              }
            else eo(l, a, C, w, k, _);
            return;
          case nn:
            throw Error(W(257));
          case ee:
            if (xe = s._init, s = xe(s._payload), l.status === 12) throw null;
            Ar(l, a, s, v);
            return;
        }
        if (Ie(s)) {
          Sc(l, a, s, v);
          return;
        }
        if ((xe = Vn(s)) && (xe = xe.call(s))) {
          if (s = xe.next(), !s.done) {
            k = [];
            do
              k.push(s.value), s = xe.next();
            while (!s.done);
            Sc(l, a, k, v);
          }
          return;
        }
        if (typeof s.then == "function")
          return a.thenableState = null, Ar(l, a, eu(s), v);
        if (s.$$typeof === ie)
          return Ar(
            l,
            a,
            s._currentValue,
            v
          );
        throw v = Object.prototype.toString.call(s), Error(
          W(
            31,
            v === "[object Object]" ? "object with keys {" + Object.keys(s).join(", ") + "}" : v
          )
        );
      }
      typeof s == "string" ? (v = a.blockedSegment, v !== null && (v.lastPushedText = Jl(
        v.chunks,
        s,
        l.renderState,
        v.lastPushedText
      ))) : (typeof s == "number" || typeof s == "bigint") && (v = a.blockedSegment, v !== null && (v.lastPushedText = Jl(
        v.chunks,
        "" + s,
        l.renderState,
        v.lastPushedText
      )));
    }
  }
  function Sc(l, a, s, v) {
    var w = a.keyPath;
    if (v !== -1 && (a.keyPath = [a.keyPath, "Fragment", v], a.replay !== null)) {
      for (var C = a.replay, k = C.nodes, _ = 0; _ < k.length; _++) {
        var O = k[_];
        if (O[1] === v) {
          v = O[2], O = O[3], a.replay = { nodes: v, slots: O, pendingTasks: 1 };
          try {
            if (Sc(l, a, s, -1), a.replay.pendingTasks === 1 && 0 < a.replay.nodes.length)
              throw Error(W(488));
            a.replay.pendingTasks--;
          } catch (K) {
            if (typeof K == "object" && K !== null && (K === ve || typeof K.then == "function"))
              throw K;
            a.replay.pendingTasks--, s = Ol(a.componentStack);
            var z = a.blockedBoundary, Z = K;
            s = dr(l, Z, s), Ac(
              l,
              z,
              v,
              O,
              Z,
              s
            );
          }
          a.replay = C, k.splice(_, 1);
          break;
        }
      }
      a.keyPath = w;
      return;
    }
    if (C = a.treeContext, k = s.length, a.replay !== null && (_ = a.replay.slots, _ !== null && typeof _ == "object")) {
      for (v = 0; v < k; v++)
        O = s[v], a.treeContext = A(C, k, v), z = _[v], typeof z == "number" ? (no(l, a, z, O, v), delete _[v]) : Bt(l, a, O, v);
      a.treeContext = C, a.keyPath = w;
      return;
    }
    for (_ = 0; _ < k; _++)
      v = s[_], a.treeContext = A(C, k, _), Bt(l, a, v, _);
    a.treeContext = C, a.keyPath = w;
  }
  function _u(l, a, s) {
    if (s.status = 5, s.rootSegmentID = l.nextSegmentId++, l = s.trackedContentKeyPath, l === null) throw Error(W(486));
    var v = s.trackedFallbackNode, w = [], C = a.workingMap.get(l);
    return C === void 0 ? (s = [
      l[1],
      l[2],
      w,
      null,
      v,
      s.rootSegmentID
    ], a.workingMap.set(l, s), Yu(s, l[0], a), s) : (C[4] = v, C[5] = s.rootSegmentID, C);
  }
  function zu(l, a, s, v) {
    v.status = 5;
    var w = s.keyPath, C = s.blockedBoundary;
    if (C === null)
      v.id = l.nextSegmentId++, a.rootSlots = v.id, l.completedRootSegment !== null && (l.completedRootSegment.status = 5);
    else {
      if (C !== null && C.status === 0) {
        var k = _u(
          l,
          a,
          C
        );
        if (C.trackedContentKeyPath === w && s.childIndex === -1) {
          v.id === -1 && (v.id = v.parentFlushed ? C.rootSegmentID : l.nextSegmentId++), k[3] = v.id;
          return;
        }
      }
      if (v.id === -1 && (v.id = v.parentFlushed && C !== null ? C.rootSegmentID : l.nextSegmentId++), s.childIndex === -1)
        w === null ? a.rootSlots = v.id : (s = a.workingMap.get(w), s === void 0 ? (s = [w[1], w[2], [], v.id], Yu(s, w[0], a)) : s[3] = v.id);
      else {
        if (w === null) {
          if (l = a.rootSlots, l === null)
            l = a.rootSlots = {};
          else if (typeof l == "number")
            throw Error(W(491));
        } else if (C = a.workingMap, k = C.get(w), k === void 0)
          l = {}, k = [w[1], w[2], [], l], C.set(w, k), Yu(k, w[0], a);
        else if (l = k[3], l === null)
          l = k[3] = {};
        else if (typeof l == "number")
          throw Error(W(491));
        l[s.childIndex] = v.id;
      }
    }
  }
  function lu(l, a) {
    l = l.trackedPostpones, l !== null && (a = a.trackedContentKeyPath, a !== null && (a = l.workingMap.get(a), a !== void 0 && (a.length = 4, a[2] = [], a[3] = null)));
  }
  function Hu(l, a, s) {
    return yt(
      l,
      s,
      a.replay,
      a.node,
      a.childIndex,
      a.blockedBoundary,
      a.hoistableState,
      a.abortSet,
      a.keyPath,
      a.formatContext,
      a.context,
      a.treeContext,
      a.row,
      a.componentStack
    );
  }
  function Uu(l, a, s) {
    var v = a.blockedSegment, w = Zr(
      l,
      v.chunks.length,
      null,
      a.formatContext,
      v.lastPushedText,
      !0
    );
    return v.children.push(w), v.lastPushedText = !1, xa(
      l,
      s,
      a.node,
      a.childIndex,
      a.blockedBoundary,
      w,
      a.blockedPreamble,
      a.hoistableState,
      a.abortSet,
      a.keyPath,
      a.formatContext,
      a.context,
      a.treeContext,
      a.row,
      a.componentStack
    );
  }
  function Bt(l, a, s, v) {
    var w = a.formatContext, C = a.context, k = a.keyPath, _ = a.treeContext, O = a.componentStack, z = a.blockedSegment;
    if (z === null) {
      z = a.replay;
      try {
        return Ar(l, a, s, v);
      } catch (xe) {
        if (Al(), s = xe === ve ? Ze() : xe, l.status !== 12 && typeof s == "object" && s !== null) {
          if (typeof s.then == "function") {
            v = xe === ve ? Cr() : null, l = Hu(l, a, v).ping, s.then(l, l), a.formatContext = w, a.context = C, a.keyPath = k, a.treeContext = _, a.componentStack = O, a.replay = z, g(C);
            return;
          }
          if (s.message === "Maximum call stack size exceeded") {
            s = xe === ve ? Cr() : null, s = Hu(l, a, s), l.pingedTasks.push(s), a.formatContext = w, a.context = C, a.keyPath = k, a.treeContext = _, a.componentStack = O, a.replay = z, g(C);
            return;
          }
        }
      }
    } else {
      var Z = z.children.length, K = z.chunks.length;
      try {
        return Ar(l, a, s, v);
      } catch (xe) {
        if (Al(), z.children.length = Z, z.chunks.length = K, s = xe === ve ? Ze() : xe, l.status !== 12 && typeof s == "object" && s !== null) {
          if (typeof s.then == "function") {
            z = s, s = xe === ve ? Cr() : null, l = Uu(l, a, s).ping, z.then(l, l), a.formatContext = w, a.context = C, a.keyPath = k, a.treeContext = _, a.componentStack = O, g(C);
            return;
          }
          if (s.message === "Maximum call stack size exceeded") {
            z = xe === ve ? Cr() : null, z = Uu(l, a, z), l.pingedTasks.push(z), a.formatContext = w, a.context = C, a.keyPath = k, a.treeContext = _, a.componentStack = O, g(C);
            return;
          }
        }
      }
    }
    throw a.formatContext = w, a.context = C, a.keyPath = k, a.treeContext = _, g(C), s;
  }
  function iu(l) {
    var a = l.blockedBoundary, s = l.blockedSegment;
    s !== null && (s.status = 3, Ml(this, a, l.row, s));
  }
  function Ac(l, a, s, v, w, C) {
    for (var k = 0; k < s.length; k++) {
      var _ = s[k];
      if (_.length === 4)
        Ac(
          l,
          a,
          _[2],
          _[3],
          w,
          C
        );
      else {
        _ = _[5];
        var O = l, z = C, Z = Bo(
          O,
          null,
          /* @__PURE__ */ new Set(),
          null,
          null
        );
        Z.parentFlushed = !0, Z.rootSegmentID = _, Z.status = 4, Z.errorDigest = z, Z.parentFlushed && O.clientRenderedBoundaries.push(Z);
      }
    }
    if (s.length = 0, v !== null) {
      if (a === null) throw Error(W(487));
      if (a.status !== 4 && (a.status = 4, a.errorDigest = C, a.parentFlushed && l.clientRenderedBoundaries.push(a)), typeof v == "object") for (var K in v) delete v[K];
    }
  }
  function Pc(l, a, s) {
    var v = l.blockedBoundary, w = l.blockedSegment;
    if (w !== null) {
      if (w.status === 6) return;
      w.status = 3;
    }
    var C = Ol(l.componentStack);
    if (v === null) {
      if (a.status !== 13 && a.status !== 14) {
        if (v = l.replay, v === null) {
          a.trackedPostpones !== null && w !== null ? (v = a.trackedPostpones, dr(a, s, C), zu(a, v, l, w), Ml(a, null, l.row, w)) : (dr(a, s, C), _o(a, s));
          return;
        }
        v.pendingTasks--, v.pendingTasks === 0 && 0 < v.nodes.length && (w = dr(a, s, C), Ac(
          a,
          null,
          v.nodes,
          v.slots,
          s,
          w
        )), a.pendingRootTasks--, a.pendingRootTasks === 0 && Wu(a);
      }
    } else {
      var k = a.trackedPostpones;
      if (v.status !== 4) {
        if (k !== null && w !== null)
          return dr(a, s, C), zu(a, k, l, w), v.fallbackAbortableTasks.forEach(function(_) {
            return Pc(_, a, s);
          }), v.fallbackAbortableTasks.clear(), Ml(a, v, l.row, w);
        v.status = 4, w = dr(a, s, C), v.status = 4, v.errorDigest = w, lu(a, v), v.parentFlushed && a.clientRenderedBoundaries.push(v);
      }
      v.pendingTasks--, w = v.row, w !== null && --w.pendingTasks === 0 && Sr(a, w), v.fallbackAbortableTasks.forEach(function(_) {
        return Pc(_, a, s);
      }), v.fallbackAbortableTasks.clear();
    }
    l = l.row, l !== null && --l.pendingTasks === 0 && Sr(a, l), a.allPendingTasks--, a.allPendingTasks === 0 && ou(a);
  }
  function au(l, a) {
    try {
      var s = l.renderState, v = s.onHeaders;
      if (v) {
        var w = s.headers;
        if (w) {
          s.headers = null;
          var C = w.preconnects;
          if (w.fontPreloads && (C && (C += ", "), C += w.fontPreloads), w.highImagePreloads && (C && (C += ", "), C += w.highImagePreloads), !a) {
            var k = s.styles.values(), _ = k.next();
            e: for (; 0 < w.remainingCapacity && !_.done; _ = k.next())
              for (var O = _.value.sheets.values(), z = O.next(); 0 < w.remainingCapacity && !z.done; z = O.next()) {
                var Z = z.value, K = Z.props, xe = K.href, pe = Z.props, yn = qc(pe.href, "style", {
                  crossOrigin: pe.crossOrigin,
                  integrity: pe.integrity,
                  nonce: pe.nonce,
                  type: pe.type,
                  fetchPriority: pe.fetchPriority,
                  referrerPolicy: pe.referrerPolicy,
                  media: pe.media
                });
                if (0 <= (w.remainingCapacity -= yn.length + 2))
                  s.resets.style[xe] = At, C && (C += ", "), C += yn, s.resets.style[xe] = typeof K.crossOrigin == "string" || typeof K.integrity == "string" ? [K.crossOrigin, K.integrity] : At;
                else break e;
              }
          }
          v(C ? { Link: C } : {});
        }
      }
    } catch (Qe) {
      dr(l, Qe, {});
    }
  }
  function Wu(l) {
    l.trackedPostpones === null && au(l, !0), l.trackedPostpones === null && ri(l), l.onShellError = $, l = l.onShellReady, l();
  }
  function ou(l) {
    au(
      l,
      l.trackedPostpones === null ? !0 : l.completedRootSegment === null || l.completedRootSegment.status !== 5
    ), ri(l), l = l.onAllReady, l();
  }
  function cu(l, a) {
    if (a.chunks.length === 0 && a.children.length === 1 && a.children[0].boundary === null && a.children[0].id === -1) {
      var s = a.children[0];
      s.id = a.id, s.parentFlushed = !0, s.status !== 1 && s.status !== 3 && s.status !== 4 || cu(l, s);
    } else l.completedSegments.push(a);
  }
  function Ra(l, a, s) {
    if (Y !== null) {
      s = s.chunks;
      for (var v = 0, w = 0; w < s.length; w++)
        v += s[w].byteLength;
      a === null ? l.byteSize += v : a.byteSize += v;
    }
  }
  function Ml(l, a, s, v) {
    if (s !== null && (--s.pendingTasks === 0 ? Sr(l, s) : s.together && $a(l, s)), l.allPendingTasks--, a === null) {
      if (v !== null && v.parentFlushed) {
        if (l.completedRootSegment !== null)
          throw Error(W(389));
        l.completedRootSegment = v;
      }
      l.pendingRootTasks--, l.pendingRootTasks === 0 && Wu(l);
    } else if (a.pendingTasks--, a.status !== 4)
      if (a.pendingTasks === 0) {
        if (a.status === 0 && (a.status = 1), v !== null && v.parentFlushed && (v.status === 1 || v.status === 3) && cu(a, v), a.parentFlushed && l.completedBoundaries.push(a), a.status === 1)
          s = a.row, s !== null && Ja(s.hoistables, a.contentState), Lt(l, a) || (a.fallbackAbortableTasks.forEach(iu, l), a.fallbackAbortableTasks.clear(), s !== null && --s.pendingTasks === 0 && Sr(l, s)), l.pendingRootTasks === 0 && l.trackedPostpones === null && a.contentPreamble !== null && ri(l);
        else if (a.status === 5 && (a = a.row, a !== null)) {
          if (l.trackedPostpones !== null) {
            s = l.trackedPostpones;
            var w = a.next;
            if (w !== null && (v = w.boundaries, v !== null))
              for (w.boundaries = null, w = 0; w < v.length; w++) {
                var C = v[w];
                _u(l, s, C), Ml(l, C, null, null);
              }
          }
          --a.pendingTasks === 0 && Sr(l, a);
        }
      } else
        v === null || !v.parentFlushed || v.status !== 1 && v.status !== 3 || (cu(a, v), a.completedSegments.length === 1 && a.parentFlushed && l.partialBoundaries.push(a)), a = a.row, a !== null && a.together && $a(l, a);
    l.allPendingTasks === 0 && ou(l);
  }
  function cs(l) {
    if (l.status !== 14 && l.status !== 13) {
      var a = gt, s = Xl.H;
      Xl.H = pa;
      var v = Xl.A;
      Xl.A = Ec;
      var w = un;
      un = l;
      var C = mr;
      mr = l.resumableState;
      try {
        var k = l.pingedTasks, _;
        for (_ = 0; _ < k.length; _++) {
          var O = k[_], z = l, Z = O.blockedSegment;
          if (Z === null) {
            var K = z;
            if (O.replay.pendingTasks !== 0) {
              g(O.context);
              try {
                if (typeof O.replay.slots == "number" ? no(
                  K,
                  O,
                  O.replay.slots,
                  O.node,
                  O.childIndex
                ) : kc(K, O), O.replay.pendingTasks === 1 && 0 < O.replay.nodes.length)
                  throw Error(W(488));
                O.replay.pendingTasks--, O.abortSet.delete(O), Ml(
                  K,
                  O.blockedBoundary,
                  O.row,
                  null
                );
              } catch (Fr) {
                Al();
                var xe = Fr === ve ? Ze() : Fr;
                if (typeof xe == "object" && xe !== null && typeof xe.then == "function") {
                  var pe = O.ping;
                  xe.then(pe, pe), O.thenableState = Fr === ve ? Cr() : null;
                } else {
                  O.replay.pendingTasks--, O.abortSet.delete(O);
                  var yn = Ol(O.componentStack);
                  z = void 0;
                  var Qe = K, bn = O.blockedBoundary, bt = K.status === 12 ? K.fatalError : xe, $n = O.replay.nodes, gr = O.replay.slots;
                  z = dr(
                    Qe,
                    bt,
                    yn
                  ), Ac(
                    Qe,
                    bn,
                    $n,
                    gr,
                    bt,
                    z
                  ), K.pendingRootTasks--, K.pendingRootTasks === 0 && Wu(K), K.allPendingTasks--, K.allPendingTasks === 0 && ou(K);
                }
              }
            }
          } else if (K = void 0, Qe = Z, Qe.status === 0) {
            Qe.status = 6, g(O.context);
            var ll = Qe.children.length, Dl = Qe.chunks.length;
            try {
              kc(z, O), Qe.lastPushedText && Qe.textEmbedded && Qe.chunks.push(We), O.abortSet.delete(O), Qe.status = 1, Ra(z, O.blockedBoundary, Qe), Ml(
                z,
                O.blockedBoundary,
                O.row,
                Qe
              );
            } catch (Fr) {
              Al(), Qe.children.length = ll, Qe.chunks.length = Dl;
              var Je = Fr === ve ? Ze() : z.status === 12 ? z.fatalError : Fr;
              if (z.status === 12 && z.trackedPostpones !== null) {
                var Pr = z.trackedPostpones, Mt = Ol(O.componentStack);
                O.abortSet.delete(O), dr(z, Je, Mt), zu(z, Pr, O, Qe), Ml(
                  z,
                  O.blockedBoundary,
                  O.row,
                  Qe
                );
              } else if (typeof Je == "object" && Je !== null && typeof Je.then == "function") {
                Qe.status = 0, O.thenableState = Fr === ve ? Cr() : null;
                var Qr = O.ping;
                Je.then(Qr, Qr);
              } else {
                var ji = Ol(O.componentStack);
                O.abortSet.delete(O), Qe.status = 4;
                var wt = O.blockedBoundary, lo = O.row;
                if (lo !== null && --lo.pendingTasks === 0 && Sr(z, lo), z.allPendingTasks--, K = dr(
                  z,
                  Je,
                  ji
                ), wt === null) _o(z, Je);
                else if (wt.pendingTasks--, wt.status !== 4) {
                  wt.status = 4, wt.errorDigest = K, lu(z, wt);
                  var Nl = wt.row;
                  Nl !== null && --Nl.pendingTasks === 0 && Sr(z, Nl), wt.parentFlushed && z.clientRenderedBoundaries.push(wt), z.pendingRootTasks === 0 && z.trackedPostpones === null && wt.contentPreamble !== null && ri(z);
                }
                z.allPendingTasks === 0 && ou(z);
              }
            }
          }
        }
        k.splice(0, _), l.destination !== null && Ho(l, l.destination);
      } catch (Fr) {
        dr(l, Fr, {}), _o(l, Fr);
      } finally {
        mr = C, Xl.H = s, Xl.A = v, s === pa && g(a), un = w;
      }
    }
  }
  function to(l, a, s) {
    a.preambleChildren.length && s.push(a.preambleChildren);
    for (var v = !1, w = 0; w < a.children.length; w++)
      v = Fc(
        l,
        a.children[w],
        s
      ) || v;
    return v;
  }
  function Fc(l, a, s) {
    var v = a.boundary;
    if (v === null)
      return to(
        l,
        a,
        s
      );
    var w = v.contentPreamble, C = v.fallbackPreamble;
    if (w === null || C === null) return !1;
    switch (v.status) {
      case 1:
        if (fc(l.renderState, w), l.byteSize += v.byteSize, a = v.completedSegments[0], !a) throw Error(W(391));
        return to(
          l,
          a,
          s
        );
      case 5:
        if (l.trackedPostpones !== null) return !0;
      case 4:
        if (a.status === 1)
          return fc(l.renderState, C), to(
            l,
            a,
            s
          );
      default:
        return !0;
    }
  }
  function ri(l) {
    if (l.completedRootSegment && l.completedPreambleSegments === null) {
      var a = [], s = l.byteSize, v = Fc(
        l,
        l.completedRootSegment,
        a
      ), w = l.renderState.preamble;
      v === !1 || w.headChunks && w.bodyChunks ? l.completedPreambleSegments = a : l.byteSize = s;
    }
  }
  function zo(l, a, s, v) {
    switch (s.parentFlushed = !0, s.status) {
      case 0:
        s.id = l.nextSegmentId++;
      case 5:
        return v = s.id, s.lastPushedText = !1, s.textEmbedded = !1, l = l.renderState, J(a, Su), J(a, l.placeholderPrefix), l = fe(v.toString(16)), J(a, l), he(a, hc);
      case 1:
        s.status = 2;
        var w = !0, C = s.chunks, k = 0;
        s = s.children;
        for (var _ = 0; _ < s.length; _++) {
          for (w = s[_]; k < w.index; k++)
            J(a, C[k]);
          w = Oc(l, a, w, v);
        }
        for (; k < C.length - 1; k++)
          J(a, C[k]);
        return k < C.length && (w = he(a, C[k])), w;
      case 3:
        return !0;
      default:
        throw Error(W(390));
    }
  }
  var Ca = 0;
  function Oc(l, a, s, v) {
    var w = s.boundary;
    if (w === null)
      return zo(l, a, s, v);
    if (w.parentFlushed = !0, w.status === 4) {
      var C = w.row;
      C !== null && --C.pendingTasks === 0 && Sr(l, C), w = w.errorDigest, he(a, Kt), J(a, Au), w && (J(a, jl), J(a, fe(Ge(w))), J(
        a,
        Ni
      )), he(a, Pu), zo(l, a, s, v);
    } else if (w.status !== 1)
      w.status === 0 && (w.rootSegmentID = l.nextSegmentId++), 0 < w.completedSegments.length && l.partialBoundaries.push(w), Li(
        a,
        l.renderState,
        w.rootSegmentID
      ), v && Ja(v, w.fallbackState), zo(l, a, s, v);
    else if (!li && Lt(l, w) && (Ca + w.byteSize > l.progressiveChunkSize || Io(w.contentState)))
      w.rootSegmentID = l.nextSegmentId++, l.completedBoundaries.push(w), Li(
        a,
        l.renderState,
        w.rootSegmentID
      ), zo(l, a, s, v);
    else {
      if (Ca += w.byteSize, v && Ja(v, w.contentState), s = w.row, s !== null && Lt(l, w) && --s.pendingTasks === 0 && Sr(l, s), he(a, ca), s = w.completedSegments, s.length !== 1) throw Error(W(391));
      Oc(l, a, s[0], v);
    }
    return he(a, jn);
  }
  function ma(l, a, s, v) {
    return Wa(
      a,
      l.renderState,
      s.parentFormatContext,
      s.id
    ), Oc(l, a, s, v), $l(a, s.parentFormatContext);
  }
  function us(l, a, s) {
    Ca = s.byteSize;
    for (var v = s.completedSegments, w = 0; w < v.length; w++)
      ss(
        l,
        a,
        s,
        v[w]
      );
    v.length = 0, v = s.row, v !== null && Lt(l, s) && --v.pendingTasks === 0 && Sr(l, v), El(
      a,
      s.contentState,
      l.renderState
    ), v = l.resumableState, l = l.renderState, w = s.rootSegmentID, s = s.contentState;
    var C = l.stylesToHoist;
    return l.stylesToHoist = !1, J(a, l.startInlineScript), J(a, mn), C ? ((v.instructions & 4) === 0 && (v.instructions |= 4, J(a, ha)), (v.instructions & 2) === 0 && (v.instructions |= 2, J(a, Fo)), (v.instructions & 8) === 0 ? (v.instructions |= 8, J(a, jt)) : J(a, ls)) : ((v.instructions & 2) === 0 && (v.instructions |= 2, J(a, Fo)), J(a, Oo)), v = fe(w.toString(16)), J(a, l.boundaryPrefix), J(a, v), J(a, fa), J(a, l.segmentPrefix), J(a, v), C ? (J(a, gc), lr(a, s)) : J(a, Qc), s = he(a, Wi), Ur(a, l) && s;
  }
  function ss(l, a, s, v) {
    if (v.status === 2) return !0;
    var w = s.contentState, C = v.id;
    if (C === -1) {
      if ((v.id = s.rootSegmentID) === -1)
        throw Error(W(392));
      return ma(l, a, v, w);
    }
    return C === s.rootSegmentID ? ma(l, a, v, w) : (ma(l, a, v, w), s = l.resumableState, l = l.renderState, J(a, l.startInlineScript), J(a, mn), (s.instructions & 1) === 0 ? (s.instructions |= 1, J(a, Fu)) : J(a, Ou), J(a, l.segmentPrefix), C = fe(C.toString(16)), J(a, C), J(a, Mu), J(a, l.placeholderPrefix), J(a, C), a = he(a, Po), a);
  }
  var li = !1;
  function Ho(l, a) {
    nt = new Uint8Array(2048), Ae = 0;
    try {
      if (!(0 < l.pendingRootTasks)) {
        var s, v = l.completedRootSegment;
        if (v !== null) {
          if (v.status === 5) return;
          var w = l.completedPreambleSegments;
          if (w === null) return;
          Ca = l.byteSize;
          var C = l.resumableState, k = l.renderState, _ = k.preamble, O = _.htmlChunks, z = _.headChunks, Z;
          if (O) {
            for (Z = 0; Z < O.length; Z++)
              J(a, O[Z]);
            if (z)
              for (Z = 0; Z < z.length; Z++)
                J(a, z[Z]);
            else
              J(a, Zt("head")), J(a, mn);
          } else if (z)
            for (Z = 0; Z < z.length; Z++)
              J(a, z[Z]);
          var K = k.charsetChunks;
          for (Z = 0; Z < K.length; Z++)
            J(a, K[Z]);
          K.length = 0, k.preconnects.forEach(lt, a), k.preconnects.clear();
          var xe = k.viewportChunks;
          for (Z = 0; Z < xe.length; Z++)
            J(a, xe[Z]);
          xe.length = 0, k.fontPreloads.forEach(lt, a), k.fontPreloads.clear(), k.highImagePreloads.forEach(lt, a), k.highImagePreloads.clear(), $r = k, k.styles.forEach(pc, a), $r = null;
          var pe = k.importMapChunks;
          for (Z = 0; Z < pe.length; Z++)
            J(a, pe[Z]);
          pe.length = 0, k.bootstrapScripts.forEach(lt, a), k.scripts.forEach(lt, a), k.scripts.clear(), k.bulkPreloads.forEach(lt, a), k.bulkPreloads.clear(), O || z || (C.instructions |= 32);
          var yn = k.hoistableChunks;
          for (Z = 0; Z < yn.length; Z++)
            J(a, yn[Z]);
          for (C = yn.length = 0; C < w.length; C++) {
            var Qe = w[C];
            for (k = 0; k < Qe.length; k++)
              Oc(l, a, Qe[k], null);
          }
          var bn = l.renderState.preamble, bt = bn.headChunks;
          (bn.htmlChunks || bt) && J(a, yi("head"));
          var $n = bn.bodyChunks;
          if ($n)
            for (w = 0; w < $n.length; w++)
              J(a, $n[w]);
          Oc(l, a, v, null), l.completedRootSegment = null;
          var gr = l.renderState;
          if (l.allPendingTasks !== 0 || l.clientRenderedBoundaries.length !== 0 || l.completedBoundaries.length !== 0 || l.trackedPostpones !== null && (l.trackedPostpones.rootNodes.length !== 0 || l.trackedPostpones.rootSlots !== null)) {
            var ll = l.resumableState;
            if ((ll.instructions & 64) === 0) {
              if (ll.instructions |= 64, J(a, gr.startInlineScript), (ll.instructions & 32) === 0) {
                ll.instructions |= 32;
                var Dl = "_" + ll.idPrefix + "R_";
                J(a, kn), J(
                  a,
                  fe(Ge(Dl))
                ), J(a, Yn);
              }
              J(a, mn), J(a, Kl), he(a, vn);
            }
          }
          Ur(a, gr);
        }
        var Je = l.renderState;
        v = 0;
        var Pr = Je.viewportChunks;
        for (v = 0; v < Pr.length; v++)
          J(a, Pr[v]);
        Pr.length = 0, Je.preconnects.forEach(lt, a), Je.preconnects.clear(), Je.fontPreloads.forEach(lt, a), Je.fontPreloads.clear(), Je.highImagePreloads.forEach(
          lt,
          a
        ), Je.highImagePreloads.clear(), Je.styles.forEach(it, a), Je.scripts.forEach(lt, a), Je.scripts.clear(), Je.bulkPreloads.forEach(lt, a), Je.bulkPreloads.clear();
        var Mt = Je.hoistableChunks;
        for (v = 0; v < Mt.length; v++)
          J(a, Mt[v]);
        Mt.length = 0;
        var Qr = l.clientRenderedBoundaries;
        for (s = 0; s < Qr.length; s++) {
          var ji = Qr[s];
          Je = a;
          var wt = l.resumableState, lo = l.renderState, Nl = ji.rootSegmentID, Fr = ji.errorDigest;
          J(
            Je,
            lo.startInlineScript
          ), J(Je, mn), (wt.instructions & 4) === 0 ? (wt.instructions |= 4, J(Je, Mo)) : J(Je, ei), J(Je, lo.boundaryPrefix), J(Je, fe(Nl.toString(16))), J(Je, da), Fr && (J(
            Je,
            ga
          ), J(
            Je,
            fe(
              Ya(Fr || "")
            )
          ));
          var ii = he(
            Je,
            Iu
          );
          if (!ii) {
            l.destination = null, s++, Qr.splice(0, s);
            return;
          }
        }
        Qr.splice(0, s);
        var Or = l.completedBoundaries;
        for (s = 0; s < Or.length; s++)
          if (!us(l, a, Or[s])) {
            l.destination = null, s++, Or.splice(0, s);
            return;
          }
        Or.splice(0, s), Tr(a), nt = new Uint8Array(2048), Ae = 0, li = !0;
        var io = l.partialBoundaries;
        for (s = 0; s < io.length; s++) {
          var Wo = io[s];
          e: {
            Qr = l, ji = a, Ca = Wo.byteSize;
            var Jr = Wo.completedSegments;
            for (ii = 0; ii < Jr.length; ii++)
              if (!ss(
                Qr,
                ji,
                Wo,
                Jr[ii]
              )) {
                ii++, Jr.splice(0, ii);
                var Yo = !1;
                break e;
              }
            Jr.splice(0, ii);
            var Mr = Wo.row;
            Mr !== null && Mr.together && Wo.pendingTasks === 1 && (Mr.pendingTasks === 1 ? Bu(
              Qr,
              Mr,
              Mr.hoistables
            ) : Mr.pendingTasks--), Yo = El(
              ji,
              Wo.contentState,
              Qr.renderState
            );
          }
          if (!Yo) {
            l.destination = null, s++, io.splice(0, s);
            return;
          }
        }
        io.splice(0, s), li = !1;
        var ao = l.completedBoundaries;
        for (s = 0; s < ao.length; s++)
          if (!us(l, a, ao[s])) {
            l.destination = null, s++, ao.splice(0, s);
            return;
          }
        ao.splice(0, s);
      }
    } finally {
      li = !1, l.allPendingTasks === 0 && l.clientRenderedBoundaries.length === 0 && l.completedBoundaries.length === 0 ? (l.flushScheduled = !1, s = l.resumableState, s.hasBody && J(a, yi("body")), s.hasHtml && J(a, yi("html")), Tr(a), l.status = 14, a.close(), l.destination = null) : Tr(a);
    }
  }
  function ml(l) {
    l.flushScheduled = l.destination !== null, qr(function() {
      return cs(l);
    }), Kn(function() {
      l.status === 10 && (l.status = 11), l.trackedPostpones === null && au(l, l.pendingRootTasks === 0);
    });
  }
  function ka(l) {
    l.flushScheduled === !1 && l.pingedTasks.length === 0 && l.destination !== null && (l.flushScheduled = !0, Kn(function() {
      var a = l.destination;
      a ? Ho(l, a) : l.flushScheduled = !1;
    }));
  }
  function ro(l, a) {
    if (l.status === 13)
      l.status = 14, we(a, l.fatalError);
    else if (l.status !== 14 && l.destination === null) {
      l.destination = a;
      try {
        Ho(l, a);
      } catch (s) {
        dr(l, s, {}), _o(l, s);
      }
    }
  }
  function Il(l, a) {
    (l.status === 11 || l.status === 10) && (l.status = 12);
    try {
      var s = l.abortableTasks;
      if (0 < s.size) {
        var v = a === void 0 ? Error(W(432)) : typeof a == "object" && a !== null && typeof a.then == "function" ? Error(W(530)) : a;
        l.fatalError = v, s.forEach(function(w) {
          return Pc(w, l, v);
        }), s.clear();
      }
      l.destination !== null && Ho(l, l.destination);
    } catch (w) {
      dr(l, w, {}), _o(l, w);
    }
  }
  function Yu(l, a, s) {
    if (a === null) s.rootNodes.push(l);
    else {
      var v = s.workingMap, w = v.get(a);
      w === void 0 && (w = [a[1], a[2], [], null], v.set(a, w), Yu(w, a[0], s)), w[2].push(l);
    }
  }
  function fs(l) {
    var a = l.trackedPostpones;
    if (a === null || a.rootNodes.length === 0 && a.rootSlots === null)
      return l.trackedPostpones = null;
    if (l.completedRootSegment === null || l.completedRootSegment.status !== 5 && l.completedPreambleSegments !== null) {
      var s = l.nextSegmentId, v = a.rootSlots, w = l.resumableState;
      w.bootstrapScriptContent = void 0, w.bootstrapScripts = void 0, w.bootstrapModules = void 0;
    } else {
      s = 0, v = -1, w = l.resumableState;
      var C = l.renderState;
      w.nextFormID = 0, w.hasBody = !1, w.hasHtml = !1, w.unknownResources = { font: C.resets.font }, w.dnsResources = C.resets.dns, w.connectResources = C.resets.connect, w.imageResources = C.resets.image, w.styleResources = C.resets.style, w.scriptResources = {}, w.moduleUnknownResources = {}, w.moduleScriptResources = {}, w.instructions = 0;
    }
    return {
      nextSegmentId: s,
      rootFormatContext: l.rootFormatContext,
      progressiveChunkSize: l.progressiveChunkSize,
      resumableState: l.resumableState,
      replayNodes: a.rootNodes,
      replaySlots: v
    };
  }
  function Uo() {
    var l = de.version;
    if (l !== "19.2.6")
      throw Error(
        W(
          527,
          l,
          "19.2.6"
        )
      );
  }
  return Uo(), Uo(), Ys.prerender = function(l, a) {
    return new Promise(function(s, v) {
      var w = a ? a.onHeaders : void 0, C;
      w && (C = function(Z) {
        w(new Headers(Z));
      });
      var k = R(
        a ? a.identifierPrefix : void 0,
        a ? a.unstable_externalRuntimeSrc : void 0,
        a ? a.bootstrapScriptContent : void 0,
        a ? a.bootstrapScripts : void 0,
        a ? a.bootstrapModules : void 0
      ), _ = ja(
        l,
        k,
        yl(
          k,
          void 0,
          a ? a.unstable_externalRuntimeSrc : void 0,
          a ? a.importMap : void 0,
          C,
          a ? a.maxHeadersLength : void 0
        ),
        Ee(a ? a.namespaceURI : void 0),
        a ? a.progressiveChunkSize : void 0,
        a ? a.onError : void 0,
        function() {
          var Z = new ReadableStream(
            {
              type: "bytes",
              pull: function(K) {
                ro(_, K);
              },
              cancel: function(K) {
                _.destination = null, Il(_, K);
              }
            },
            { highWaterMark: 0 }
          );
          Z = { postponed: fs(_), prelude: Z }, s(Z);
        },
        void 0,
        void 0,
        v,
        a ? a.onPostpone : void 0
      );
      if (a && a.signal) {
        var O = a.signal;
        if (O.aborted) Il(_, O.reason);
        else {
          var z = function() {
            Il(_, O.reason), O.removeEventListener("abort", z);
          };
          O.addEventListener("abort", z);
        }
      }
      ml(_);
    });
  }, Ys.renderToReadableStream = function(l, a) {
    return new Promise(function(s, v) {
      var w, C, k = new Promise(function(pe, yn) {
        C = pe, w = yn;
      }), _ = a ? a.onHeaders : void 0, O;
      _ && (O = function(pe) {
        _(new Headers(pe));
      });
      var z = R(
        a ? a.identifierPrefix : void 0,
        a ? a.unstable_externalRuntimeSrc : void 0,
        a ? a.bootstrapScriptContent : void 0,
        a ? a.bootstrapScripts : void 0,
        a ? a.bootstrapModules : void 0
      ), Z = Lo(
        l,
        z,
        yl(
          z,
          a ? a.nonce : void 0,
          a ? a.unstable_externalRuntimeSrc : void 0,
          a ? a.importMap : void 0,
          O,
          a ? a.maxHeadersLength : void 0
        ),
        Ee(a ? a.namespaceURI : void 0),
        a ? a.progressiveChunkSize : void 0,
        a ? a.onError : void 0,
        C,
        function() {
          var pe = new ReadableStream(
            {
              type: "bytes",
              pull: function(yn) {
                ro(Z, yn);
              },
              cancel: function(yn) {
                Z.destination = null, Il(Z, yn);
              }
            },
            { highWaterMark: 0 }
          );
          pe.allReady = k, s(pe);
        },
        function(pe) {
          k.catch(function() {
          }), v(pe);
        },
        w,
        a ? a.onPostpone : void 0,
        a ? a.formState : void 0
      );
      if (a && a.signal) {
        var K = a.signal;
        if (K.aborted) Il(Z, K.reason);
        else {
          var xe = function() {
            Il(Z, K.reason), K.removeEventListener("abort", xe);
          };
          K.addEventListener("abort", xe);
        }
      }
      ml(Z);
    });
  }, Ys.resume = function(l, a, s) {
    return new Promise(function(v, w) {
      var C, k, _ = new Promise(function(K, xe) {
        k = K, C = xe;
      }), O = Ot(
        l,
        a,
        yl(
          a.resumableState,
          s ? s.nonce : void 0,
          void 0,
          void 0,
          void 0,
          void 0
        ),
        s ? s.onError : void 0,
        k,
        function() {
          var K = new ReadableStream(
            {
              type: "bytes",
              pull: function(xe) {
                ro(O, xe);
              },
              cancel: function(xe) {
                O.destination = null, Il(O, xe);
              }
            },
            { highWaterMark: 0 }
          );
          K.allReady = _, v(K);
        },
        function(K) {
          _.catch(function() {
          }), w(K);
        },
        C,
        s ? s.onPostpone : void 0
      );
      if (s && s.signal) {
        var z = s.signal;
        if (z.aborted) Il(O, z.reason);
        else {
          var Z = function() {
            Il(O, z.reason), z.removeEventListener("abort", Z);
          };
          z.addEventListener("abort", Z);
        }
      }
      ml(O);
    });
  }, Ys.resumeAndPrerender = function(l, a, s) {
    return new Promise(function(v, w) {
      var C = Cl(
        l,
        a,
        yl(
          a.resumableState,
          void 0,
          void 0,
          void 0,
          void 0,
          void 0
        ),
        s ? s.onError : void 0,
        function() {
          var O = new ReadableStream(
            {
              type: "bytes",
              pull: function(z) {
                ro(C, z);
              },
              cancel: function(z) {
                C.destination = null, Il(C, z);
              }
            },
            { highWaterMark: 0 }
          );
          O = { postponed: fs(C), prelude: O }, v(O);
        },
        void 0,
        void 0,
        w,
        s ? s.onPostpone : void 0
      );
      if (s && s.signal) {
        var k = s.signal;
        if (k.aborted) Il(C, k.reason);
        else {
          var _ = function() {
            Il(C, k.reason), k.removeEventListener("abort", _);
          };
          k.addEventListener("abort", _);
        }
      }
      ml(C);
    });
  }, Ys.version = "19.2.6", Ys;
}
var lf = {};
var Xf;
function oh() {
  return Xf || (Xf = 1, process.env.NODE_ENV !== "production" && (function() {
    function de(n, r, u, d) {
      return "" + r + (u === "s" ? "\\73 " : "\\53 ") + d;
    }
    function ue(n, r, u, d) {
      return "" + r + (u === "s" ? "\\u0073" : "\\u0053") + d;
    }
    function W(n) {
      return n === null || typeof n != "object" ? null : (n = bc && n[bc] || n["@@iterator"], typeof n == "function" ? n : null);
    }
    function ke(n) {
      return n = Object.prototype.toString.call(n), n.slice(8, n.length - 1);
    }
    function nn(n) {
      var r = JSON.stringify(n);
      return '"' + n + '"' === r ? n : r;
    }
    function be(n) {
      switch (typeof n) {
        case "string":
          return JSON.stringify(
            10 >= n.length ? n : n.slice(0, 10) + "..."
          );
        case "object":
          return Yi(n) ? "[...]" : n !== null && n.$$typeof === Xr ? "client" : (n = ke(n), n === "Object" ? "{...}" : n);
        case "function":
          return n.$$typeof === Xr ? "client" : (n = n.displayName || n.name) ? "function " + n : "function";
        default:
          return String(n);
      }
    }
    function Oe(n) {
      if (typeof n == "string") return n;
      switch (n) {
        case rl:
          return "Suspense";
        case xl:
          return "SuspenseList";
      }
      if (typeof n == "object")
        switch (n.$$typeof) {
          case Tl:
            return Oe(n.render);
          case Gn:
            return Oe(n.type);
          case El:
            var r = n._payload;
            n = n._init;
            try {
              return Oe(n(r));
            } catch {
            }
        }
      return "";
    }
    function Tn(n, r) {
      var u = ke(n);
      if (u !== "Object" && u !== "Array") return u;
      var d = -1, b = 0;
      if (Yi(n))
        if (pc.has(n)) {
          var E = pc.get(n);
          u = "<" + Oe(E) + ">";
          for (var F = 0; F < n.length; F++) {
            var D = n[F];
            D = typeof D == "string" ? D : typeof D == "object" && D !== null ? "{" + Tn(D) + "}" : "{" + be(D) + "}", "" + F === r ? (d = u.length, b = D.length, u += D) : u = 15 > D.length && 40 > u.length + D.length ? u + D : u + "{...}";
          }
          u += "</" + Oe(E) + ">";
        } else {
          for (u = "[", E = 0; E < n.length; E++)
            0 < E && (u += ", "), F = n[E], F = typeof F == "object" && F !== null ? Tn(F) : be(F), "" + E === r ? (d = u.length, b = F.length, u += F) : u = 10 > F.length && 40 > u.length + F.length ? u + F : u + "...";
          u += "]";
        }
      else if (n.$$typeof === Ya)
        u = "<" + Oe(n.type) + "/>";
      else {
        if (n.$$typeof === Xr) return "client";
        if (wc.has(n)) {
          for (u = wc.get(n), u = "<" + (Oe(u) || "..."), E = Object.keys(n), F = 0; F < E.length; F++) {
            u += " ", D = E[F], u += nn(D) + "=";
            var te = n[D], H = D === r && typeof te == "object" && te !== null ? Tn(te) : be(te);
            typeof te != "string" && (H = "{" + H + "}"), D === r ? (d = u.length, b = H.length, u += H) : u = 10 > H.length && 40 > u.length + H.length ? u + H : u + "...";
          }
          u += ">";
        } else {
          for (u = "{", E = Object.keys(n), F = 0; F < E.length; F++)
            0 < F && (u += ", "), D = E[F], u += nn(D) + ": ", te = n[D], te = typeof te == "object" && te !== null ? Tn(te) : be(te), D === r ? (d = u.length, b = te.length, u += te) : u = 10 > te.length && 40 > u.length + te.length ? u + te : u + "...";
          u += "}";
        }
      }
      return r === void 0 ? u : -1 < d && 0 < b ? (n = " ".repeat(d) + "^".repeat(b), `
  ` + u + `
  ` + n) : `
  ` + u;
    }
    function Re(n, r) {
      var u = n.length & 3, d = n.length - u, b = r;
      for (r = 0; r < d; ) {
        var E = n.charCodeAt(r) & 255 | (n.charCodeAt(++r) & 255) << 8 | (n.charCodeAt(++r) & 255) << 16 | (n.charCodeAt(++r) & 255) << 24;
        ++r, E = 3432918353 * (E & 65535) + ((3432918353 * (E >>> 16) & 65535) << 16) & 4294967295, E = E << 15 | E >>> 17, E = 461845907 * (E & 65535) + ((461845907 * (E >>> 16) & 65535) << 16) & 4294967295, b ^= E, b = b << 13 | b >>> 19, b = 5 * (b & 65535) + ((5 * (b >>> 16) & 65535) << 16) & 4294967295, b = (b & 65535) + 27492 + (((b >>> 16) + 58964 & 65535) << 16);
      }
      switch (E = 0, u) {
        case 3:
          E ^= (n.charCodeAt(r + 2) & 255) << 16;
        case 2:
          E ^= (n.charCodeAt(r + 1) & 255) << 8;
        case 1:
          E ^= n.charCodeAt(r) & 255, E = 3432918353 * (E & 65535) + ((3432918353 * (E >>> 16) & 65535) << 16) & 4294967295, E = E << 15 | E >>> 17, b ^= 461845907 * (E & 65535) + ((461845907 * (E >>> 16) & 65535) << 16) & 4294967295;
      }
      return b ^= n.length, b ^= b >>> 16, b = 2246822507 * (b & 65535) + ((2246822507 * (b >>> 16) & 65535) << 16) & 4294967295, b ^= b >>> 13, b = 3266489909 * (b & 65535) + ((3266489909 * (b >>> 16) & 65535) << 16) & 4294967295, (b ^ b >>> 16) >>> 0;
    }
    function ie(n) {
      return typeof Symbol == "function" && Symbol.toStringTag && n[Symbol.toStringTag] || n.constructor.name || "Object";
    }
    function He(n) {
      try {
        return P(n), !1;
      } catch {
        return !0;
      }
    }
    function P(n) {
      return "" + n;
    }
    function N(n, r) {
      if (He(n))
        return console.error(
          "The provided `%s` attribute is an unsupported type %s. This value must be coerced to a string before using it here.",
          r,
          ie(n)
        ), P(n);
    }
    function Pe(n, r) {
      if (He(n))
        return console.error(
          "The provided `%s` CSS property is an unsupported type %s. This value must be coerced to a string before using it here.",
          r,
          ie(n)
        ), P(n);
    }
    function ee(n) {
      if (He(n))
        return console.error(
          "The provided HTML markup uses a value of unsupported type %s. This value must be coerced to a string before using it here.",
          ie(n)
        ), P(n);
    }
    function X(n) {
      return kn.call(Xa, n) ? !0 : kn.call(Ga, n) ? !1 : va.test(n) ? Xa[n] = !0 : (Ga[n] = !0, console.error("Invalid attribute name: `%s`", n), !1);
    }
    function ft(n, r) {
      lr[r.type] || r.onChange || r.onInput || r.readOnly || r.disabled || r.value == null || console.error(
        n === "select" ? "You provided a `value` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultValue`. Otherwise, set `onChange`." : "You provided a `value` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultValue`. Otherwise, set either `onChange` or `readOnly`."
      ), r.onChange || r.readOnly || r.disabled || r.checked == null || console.error(
        "You provided a `checked` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultChecked`. Otherwise, set either `onChange` or `readOnly`."
      );
    }
    function tr(n, r) {
      if (kn.call(ti, r) && ti[r])
        return !0;
      if (Nu.test(r)) {
        if (n = "aria-" + r.slice(4).toLowerCase(), n = Rs.hasOwnProperty(n) ? n : null, n == null)
          return console.error(
            "Invalid ARIA attribute `%s`. ARIA attributes follow the pattern aria-* and must be lowercase.",
            r
          ), ti[r] = !0;
        if (r !== n)
          return console.error(
            "Invalid ARIA attribute `%s`. Did you mean `%s`?",
            r,
            n
          ), ti[r] = !0;
      }
      if (is.test(r)) {
        if (n = r.toLowerCase(), n = Rs.hasOwnProperty(n) ? n : null, n == null) return ti[r] = !0, !1;
        r !== n && (console.error(
          "Unknown ARIA attribute `%s`. Did you mean `%s`?",
          r,
          n
        ), ti[r] = !0);
      }
      return !0;
    }
    function Yt(n, r) {
      var u = [], d;
      for (d in r)
        tr(n, d) || u.push(d);
      r = u.map(function(b) {
        return "`" + b + "`";
      }).join(", "), u.length === 1 ? console.error(
        "Invalid aria prop %s on <%s> tag. For details, see https://react.dev/link/invalid-aria-props",
        r,
        n
      ) : 1 < u.length && console.error(
        "Invalid aria props %s on <%s> tag. For details, see https://react.dev/link/invalid-aria-props",
        r,
        n
      );
    }
    function Gl(n, r, u, d) {
      if (kn.call(fr, r) && fr[r])
        return !0;
      var b = r.toLowerCase();
      if (b === "onfocusin" || b === "onfocusout")
        return console.error(
          "React uses onFocus and onBlur instead of onFocusIn and onFocusOut. All React events are normalized to bubble, so onFocusIn and onFocusOut are not needed/supported by React."
        ), fr[r] = !0;
      if (typeof u == "function" && (n === "form" && r === "action" || n === "input" && r === "formAction" || n === "button" && r === "formAction"))
        return !0;
      if (Gi.test(r))
        return as.test(r) && console.error(
          "Invalid event handler property `%s`. React events use the camelCase naming convention, for example `onClick`.",
          r
        ), fr[r] = !0;
      if (Za.test(r) || qc.test(r)) return !0;
      if (b === "innerhtml")
        return console.error(
          "Directly setting property `innerHTML` is not permitted. For more information, lookup documentation on `dangerouslySetInnerHTML`."
        ), fr[r] = !0;
      if (b === "aria")
        return console.error(
          "The `aria` attribute is reserved for future use in React. Pass individual `aria-` attributes instead."
        ), fr[r] = !0;
      if (b === "is" && u !== null && u !== void 0 && typeof u != "string")
        return console.error(
          "Received a `%s` for a string attribute `is`. If this is expected, cast the value to a string.",
          typeof u
        ), fr[r] = !0;
      if (typeof u == "number" && isNaN(u))
        return console.error(
          "Received NaN for the `%s` attribute. If this is expected, cast the value to a string.",
          r
        ), fr[r] = !0;
      if (Tc.hasOwnProperty(b)) {
        if (b = Tc[b], b !== r)
          return console.error(
            "Invalid DOM property `%s`. Did you mean `%s`?",
            r,
            b
          ), fr[r] = !0;
      } else if (r !== b)
        return console.error(
          "React does not recognize the `%s` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `%s` instead. If you accidentally passed it from a parent component, remove it from the DOM element.",
          r,
          b
        ), fr[r] = !0;
      switch (r) {
        case "dangerouslySetInnerHTML":
        case "children":
        case "style":
        case "suppressContentEditableWarning":
        case "suppressHydrationWarning":
        case "defaultValue":
        case "defaultChecked":
        case "innerHTML":
        case "ref":
          return !0;
        case "innerText":
        case "textContent":
          return !0;
      }
      switch (typeof u) {
        case "boolean":
          switch (r) {
            case "autoFocus":
            case "checked":
            case "multiple":
            case "muted":
            case "selected":
            case "contentEditable":
            case "spellCheck":
            case "draggable":
            case "value":
            case "autoReverse":
            case "externalResourcesRequired":
            case "focusable":
            case "preserveAlpha":
            case "allowFullScreen":
            case "async":
            case "autoPlay":
            case "controls":
            case "default":
            case "defer":
            case "disabled":
            case "disablePictureInPicture":
            case "disableRemotePlayback":
            case "formNoValidate":
            case "hidden":
            case "loop":
            case "noModule":
            case "noValidate":
            case "open":
            case "playsInline":
            case "readOnly":
            case "required":
            case "reversed":
            case "scoped":
            case "seamless":
            case "itemScope":
            case "capture":
            case "download":
            case "inert":
              return !0;
            default:
              return b = r.toLowerCase().slice(0, 5), b === "data-" || b === "aria-" ? !0 : (u ? console.error(
                'Received `%s` for a non-boolean attribute `%s`.\n\nIf you want to write it to the DOM, pass a string instead: %s="%s" or %s={value.toString()}.',
                u,
                r,
                r,
                u,
                r
              ) : console.error(
                'Received `%s` for a non-boolean attribute `%s`.\n\nIf you want to write it to the DOM, pass a string instead: %s="%s" or %s={value.toString()}.\n\nIf you used to conditionally omit it with %s={condition && value}, pass %s={condition ? value : undefined} instead.',
                u,
                r,
                r,
                u,
                r,
                r,
                r
              ), fr[r] = !0);
          }
        case "function":
        case "symbol":
          return fr[r] = !0, !1;
        case "string":
          if (u === "false" || u === "true") {
            switch (r) {
              case "checked":
              case "selected":
              case "multiple":
              case "muted":
              case "allowFullScreen":
              case "async":
              case "autoPlay":
              case "controls":
              case "default":
              case "defer":
              case "disabled":
              case "disablePictureInPicture":
              case "disableRemotePlayback":
              case "formNoValidate":
              case "hidden":
              case "loop":
              case "noModule":
              case "noValidate":
              case "open":
              case "playsInline":
              case "readOnly":
              case "required":
              case "reversed":
              case "scoped":
              case "seamless":
              case "itemScope":
              case "inert":
                break;
              default:
                return !0;
            }
            console.error(
              "Received the string `%s` for the boolean attribute `%s`. %s Did you mean %s={%s}?",
              u,
              r,
              u === "false" ? "The browser will interpret it as a truthy value." : 'Although this works, it will not work as expected if you pass the string "false".',
              r,
              u
            ), fr[r] = !0;
          }
      }
      return !0;
    }
    function Hr(n, r, u) {
      var d = [], b;
      for (b in r)
        Gl(n, b, r[b]) || d.push(b);
      r = d.map(function(E) {
        return "`" + E + "`";
      }).join(", "), d.length === 1 ? console.error(
        "Invalid value for prop %s on <%s> tag. Either remove it from the element, or pass a string or number value to keep it in the DOM. For details, see https://react.dev/link/attribute-behavior ",
        r,
        n
      ) : 1 < d.length && console.error(
        "Invalid values for props %s on <%s> tag. Either remove them from the element, or pass a string or number value to keep them in the DOM. For details, see https://react.dev/link/attribute-behavior ",
        r,
        n
      );
    }
    function Vn(n) {
      return n.replace(ir, function(r, u) {
        return u.toUpperCase();
      });
    }
    function Ie(n) {
      if (typeof n == "boolean" || typeof n == "number" || typeof n == "bigint")
        return "" + n;
      ee(n), n = "" + n;
      var r = $c.exec(n);
      if (r) {
        var u = "", d, b = 0;
        for (d = r.index; d < n.length; d++) {
          switch (n.charCodeAt(d)) {
            case 34:
              r = "&quot;";
              break;
            case 38:
              r = "&amp;";
              break;
            case 39:
              r = "&#x27;";
              break;
            case 60:
              r = "&lt;";
              break;
            case 62:
              r = "&gt;";
              break;
            default:
              continue;
          }
          b !== d && (u += n.slice(b, d)), b = d + 1, u += r;
        }
        n = b !== d ? u + n.slice(b, d) : u;
      }
      return n;
    }
    function Ve(n) {
      return Cs.test("" + n) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : n;
    }
    function Et(n) {
      return ee(n), ("" + n).replace(ve, ue);
    }
    function rn(n, r, u, d, b) {
      return {
        idPrefix: n === void 0 ? "" : n,
        nextFormID: 0,
        streamingFormat: 0,
        bootstrapScriptContent: u,
        bootstrapScripts: d,
        bootstrapModules: b,
        instructions: o,
        hasBody: !1,
        hasHtml: !1,
        unknownResources: {},
        dnsResources: {},
        connectResources: { default: {}, anonymous: {}, credentials: {} },
        imageResources: {},
        styleResources: {},
        scriptResources: {},
        moduleUnknownResources: {},
        moduleScriptResources: {}
      };
    }
    function Kn(n, r, u, d) {
      return {
        insertionMode: n,
        selectedValue: r,
        tagScope: u,
        viewTransition: d
      };
    }
    function si(n, r, u) {
      var d = n.tagScope & -25;
      switch (r) {
        case "noscript":
          return Kn(ze, null, d | 1, null);
        case "select":
          return Kn(
            ze,
            u.value != null ? u.value : u.defaultValue,
            d,
            null
          );
        case "svg":
          return Kn(Xe, null, d, null);
        case "picture":
          return Kn(ze, null, d | 2, null);
        case "math":
          return Kn(at, null, d, null);
        case "foreignObject":
          return Kn(ze, null, d, null);
        case "table":
          return Kn(cn, null, d, null);
        case "thead":
        case "tbody":
        case "tfoot":
          return Kn(
            wn,
            null,
            d,
            null
          );
        case "colgroup":
          return Kn(
            en,
            null,
            d,
            null
          );
        case "tr":
          return Kn(
            Mn,
            null,
            d,
            null
          );
        case "head":
          if (n.insertionMode < ze)
            return Kn(
              je,
              null,
              d,
              null
            );
          break;
        case "html":
          if (n.insertionMode === on)
            return Kn(
              Ze,
              null,
              d,
              null
            );
      }
      return n.insertionMode >= cn || n.insertionMode < ze ? Kn(ze, null, d, null) : n.tagScope !== d ? Kn(
        n.insertionMode,
        n.selectedValue,
        d,
        null
      ) : n;
    }
    function Ln(n) {
      return n === null ? null : {
        update: n.update,
        enter: "none",
        exit: "none",
        share: n.update,
        name: n.autoName,
        autoName: n.autoName,
        nameIdx: 0
      };
    }
    function qr(n, r) {
      return r.tagScope & 32 && (n.instructions |= 128), Kn(
        r.insertionMode,
        r.selectedValue,
        r.tagScope | 12,
        Ln(r.viewTransition)
      );
    }
    function nt(n, r) {
      n = Ln(r.viewTransition);
      var u = r.tagScope | 16;
      return n !== null && n.share !== "none" && (u |= 64), Kn(
        r.insertionMode,
        r.selectedValue,
        u,
        n
      );
    }
    function Ae(n, r) {
      if (typeof r != "object")
        throw Error(
          "The `style` prop expects a mapping from style properties to values, not a string. For example, style={{marginRight: spacing + 'em'}} when using JSX."
        );
      var u = !0, d;
      for (d in r)
        if (kn.call(r, d)) {
          var b = r[d];
          if (b != null && typeof b != "boolean" && b !== "") {
            if (d.indexOf("--") === 0) {
              var E = Ie(d);
              Pe(b, d), b = Ie(("" + b).trim());
            } else {
              E = d;
              var F = b;
              if (-1 < E.indexOf("-")) {
                var D = E;
                qn.hasOwnProperty(D) && qn[D] || (qn[D] = !0, console.error(
                  "Unsupported style property %s. Did you mean %s?",
                  D,
                  Vn(D.replace(hr, "ms-"))
                ));
              } else if (Qa.test(E))
                D = E, qn.hasOwnProperty(D) && qn[D] || (qn[D] = !0, console.error(
                  "Unsupported vendor-prefixed style property %s. Did you mean %s?",
                  D,
                  D.charAt(0).toUpperCase() + D.slice(1)
                ));
              else if (ba.test(F)) {
                D = E;
                var te = F;
                zn.hasOwnProperty(te) && zn[te] || (zn[te] = !0, console.error(
                  `Style property values shouldn't contain a semicolon. Try "%s: %s" instead.`,
                  D,
                  te.replace(
                    ba,
                    ""
                  )
                ));
              }
              typeof F == "number" && (isNaN(F) ? Ja || (Ja = !0, console.error(
                "`NaN` is an invalid value for the `%s` css style property.",
                E
              )) : isFinite(F) || Io || (Io = !0, console.error(
                "`Infinity` is an invalid value for the `%s` css style property.",
                E
              ))), E = d, F = vt.get(E), F !== void 0 || (F = Ie(
                E.replace(Do, "-$1").toLowerCase().replace(Lu, "-ms-")
              ), vt.set(E, F)), E = F, typeof b == "number" ? b = b === 0 || ya.has(d) ? "" + b : b + "px" : (Pe(b, d), b = Ie(
                ("" + b).trim()
              ));
            }
            u ? (u = !1, n.push(
              Sn,
              E,
              Rr,
              b
            )) : n.push(Dn, E, Rr, b);
          }
        }
      u || n.push(qe);
    }
    function J(n, r, u) {
      u && typeof u != "function" && typeof u != "symbol" && n.push(En, r, Pn);
    }
    function he(n, r, u) {
      typeof u != "function" && typeof u != "symbol" && typeof u != "boolean" && n.push(
        En,
        r,
        An,
        Ie(u),
        qe
      );
    }
    function Tr(n, r) {
      this.push('<input type="hidden"'), vl(n), he(this, "name", r), he(this, "value", n), this.push(wa);
    }
    function vl(n) {
      if (typeof n != "string")
        throw Error(
          "File/Blob fields are not yet supported in progressive forms. Will fallback to client hydration."
        );
    }
    function fe(n, r) {
      if (typeof r.$$FORM_ACTION == "function") {
        var u = n.nextFormID++;
        n = n.idPrefix + u;
        try {
          var d = r.$$FORM_ACTION(n);
          if (d) {
            var b = d.data;
            b?.forEach(vl);
          }
          return d;
        } catch (E) {
          if (typeof E == "object" && E !== null && typeof E.then == "function")
            throw E;
          console.error(
            `Failed to serialize an action for progressive enhancement:
%s`,
            E
          );
        }
      }
      return null;
    }
    function T(n, r, u, d, b, E, F, D) {
      var te = null;
      if (typeof d == "function") {
        D === null || Va || (Va = !0, console.error(
          'Cannot specify a "name" prop for a button that specifies a function as a formAction. React needs it to encode which action should be invoked. It will get overridden.'
        )), b === null && E === null || xc || (xc = !0, console.error(
          "Cannot specify a formEncType or formMethod for a button that specifies a function as a formAction. React provides those automatically. They will get overridden."
        )), F === null || Ka || (Ka = !0, console.error(
          "Cannot specify a formTarget for a button that specifies a function as a formAction. The function will always be executed in the same window."
        ));
        var H = fe(r, d);
        H !== null ? (D = H.name, d = H.action || "", b = H.encType, E = H.method, F = H.target, te = H.data) : (n.push(
          En,
          "formAction",
          An,
          qt,
          qe
        ), F = E = b = d = D = null, Be(r, u));
      }
      return D != null && Y(n, "name", D), d != null && Y(n, "formAction", d), b != null && Y(n, "formEncType", b), E != null && Y(n, "formMethod", E), F != null && Y(n, "formTarget", F), te;
    }
    function Y(n, r, u) {
      switch (r) {
        case "className":
          he(n, "class", u);
          break;
        case "tabIndex":
          he(n, "tabindex", u);
          break;
        case "dir":
        case "role":
        case "viewBox":
        case "width":
        case "height":
          he(n, r, u);
          break;
        case "style":
          Ae(n, u);
          break;
        case "src":
        case "href":
          if (u === "") {
            console.error(
              r === "src" ? 'An empty string ("") was passed to the %s attribute. This may cause the browser to download the whole page again over the network. To fix this, either do not render the element at all or pass null to %s instead of an empty string.' : 'An empty string ("") was passed to the %s attribute. To fix this, either do not render the element at all or pass null to %s instead of an empty string.',
              r,
              r
            );
            break;
          }
        case "action":
        case "formAction":
          if (u == null || typeof u == "function" || typeof u == "symbol" || typeof u == "boolean")
            break;
          N(u, r), u = Ve("" + u), n.push(
            En,
            r,
            An,
            Ie(u),
            qe
          );
          break;
        case "defaultValue":
        case "defaultChecked":
        case "innerHTML":
        case "suppressContentEditableWarning":
        case "suppressHydrationWarning":
        case "ref":
          break;
        case "autoFocus":
        case "multiple":
        case "muted":
          J(n, r.toLowerCase(), u);
          break;
        case "xlinkHref":
          if (typeof u == "function" || typeof u == "symbol" || typeof u == "boolean")
            break;
          N(u, r), u = Ve("" + u), n.push(
            En,
            "xlink:href",
            An,
            Ie(u),
            qe
          );
          break;
        case "contentEditable":
        case "spellCheck":
        case "draggable":
        case "value":
        case "autoReverse":
        case "externalResourcesRequired":
        case "focusable":
        case "preserveAlpha":
          typeof u != "function" && typeof u != "symbol" && n.push(
            En,
            r,
            An,
            Ie(u),
            qe
          );
          break;
        case "inert":
          u !== "" || Ne[r] || (Ne[r] = !0, console.error(
            "Received an empty string for a boolean attribute `%s`. This will treat the attribute as if it were false. Either pass `false` to silence this warning, or pass `true` if you used an empty string in earlier versions of React to indicate this attribute is true.",
            r
          ));
        case "allowFullScreen":
        case "async":
        case "autoPlay":
        case "controls":
        case "default":
        case "defer":
        case "disabled":
        case "disablePictureInPicture":
        case "disableRemotePlayback":
        case "formNoValidate":
        case "hidden":
        case "loop":
        case "noModule":
        case "noValidate":
        case "open":
        case "playsInline":
        case "readOnly":
        case "required":
        case "reversed":
        case "scoped":
        case "seamless":
        case "itemScope":
          u && typeof u != "function" && typeof u != "symbol" && n.push(En, r, Pn);
          break;
        case "capture":
        case "download":
          u === !0 ? n.push(En, r, Pn) : u !== !1 && typeof u != "function" && typeof u != "symbol" && n.push(
            En,
            r,
            An,
            Ie(u),
            qe
          );
          break;
        case "cols":
        case "rows":
        case "size":
        case "span":
          typeof u != "function" && typeof u != "symbol" && !isNaN(u) && 1 <= u && n.push(
            En,
            r,
            An,
            Ie(u),
            qe
          );
          break;
        case "rowSpan":
        case "start":
          typeof u == "function" || typeof u == "symbol" || isNaN(u) || n.push(
            En,
            r,
            An,
            Ie(u),
            qe
          );
          break;
        case "xlinkActuate":
          he(n, "xlink:actuate", u);
          break;
        case "xlinkArcrole":
          he(n, "xlink:arcrole", u);
          break;
        case "xlinkRole":
          he(n, "xlink:role", u);
          break;
        case "xlinkShow":
          he(n, "xlink:show", u);
          break;
        case "xlinkTitle":
          he(n, "xlink:title", u);
          break;
        case "xlinkType":
          he(n, "xlink:type", u);
          break;
        case "xmlBase":
          he(n, "xml:base", u);
          break;
        case "xmlLang":
          he(n, "xml:lang", u);
          break;
        case "xmlSpace":
          he(n, "xml:space", u);
          break;
        default:
          if ((!(2 < r.length) || r[0] !== "o" && r[0] !== "O" || r[1] !== "n" && r[1] !== "N") && (r = Du.get(r) || r, X(r))) {
            switch (typeof u) {
              case "function":
              case "symbol":
                return;
              case "boolean":
                var d = r.toLowerCase().slice(0, 5);
                if (d !== "data-" && d !== "aria-") return;
            }
            n.push(
              En,
              r,
              An,
              Ie(u),
              qe
            );
          }
      }
    }
    function we(n, r, u) {
      if (r != null) {
        if (u != null)
          throw Error(
            "Can only set one of `children` or `props.dangerouslySetInnerHTML`."
          );
        if (typeof r != "object" || !("__html" in r))
          throw Error(
            "`props.dangerouslySetInnerHTML` must be in the form `{__html: ...}`. Please visit https://react.dev/link/dangerously-set-inner-html for more information."
          );
        r = r.__html, r != null && (ee(r), n.push("" + r));
      }
    }
    function Te(n, r) {
      var u = n[r];
      u != null && (u = Yi(u), n.multiple && !u ? console.error(
        "The `%s` prop supplied to <select> must be an array if `multiple` is true.",
        r
      ) : !n.multiple && u && console.error(
        "The `%s` prop supplied to <select> must be a scalar value if `multiple` is false.",
        r
      ));
    }
    function me(n) {
      var r = "";
      return Iu.Children.forEach(n, function(u) {
        u != null && (r += u, Fl || typeof u == "string" || typeof u == "number" || typeof u == "bigint" || (Fl = !0, console.error(
          "Cannot infer the option value of complex children. Pass a `value` prop or use a plain string as children to <option>."
        )));
      }), r;
    }
    function Be(n, r) {
      if ((n.instructions & 16) === o) {
        n.instructions |= 16;
        var u = r.preamble, d = r.bootstrapChunks;
        (u.htmlChunks || u.headChunks) && d.length === 0 ? (d.push(r.startInlineScript), el(d, n), d.push(
          sn,
          eu,
          $
        )) : d.unshift(
          r.startInlineScript,
          sn,
          eu,
          $
        );
      }
    }
    function Se(n, r) {
      n.push(mt("link"));
      for (var u in r)
        if (kn.call(r, u)) {
          var d = r[u];
          if (d != null)
            switch (u) {
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(
                  "link is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
                );
              default:
                Y(n, u, d);
            }
        }
      return n.push(wa), null;
    }
    function Rt(n) {
      return ee(n), ("" + n).replace(No, de);
    }
    function Rn(n, r, u) {
      n.push(mt(u));
      for (var d in r)
        if (kn.call(r, d)) {
          var b = r[d];
          if (b != null)
            switch (d) {
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(
                  u + " is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
                );
              default:
                Y(n, d, b);
            }
        }
      return n.push(wa), null;
    }
    function tt(n, r) {
      n.push(mt("title"));
      var u = null, d = null, b;
      for (b in r)
        if (kn.call(r, b)) {
          var E = r[b];
          if (E != null)
            switch (b) {
              case "children":
                u = E;
                break;
              case "dangerouslySetInnerHTML":
                d = E;
                break;
              default:
                Y(n, b, E);
            }
        }
      return n.push(sn), r = Array.isArray(u) ? 2 > u.length ? u[0] : null : u, typeof r != "function" && typeof r != "symbol" && r !== null && r !== void 0 && n.push(Ie("" + r)), we(n, d, u), n.push(St("title")), null;
    }
    function Ct(n, r) {
      n.push(mt("script"));
      var u = null, d = null, b;
      for (b in r)
        if (kn.call(r, b)) {
          var E = r[b];
          if (E != null)
            switch (b) {
              case "children":
                u = E;
                break;
              case "dangerouslySetInnerHTML":
                d = E;
                break;
              default:
                Y(n, b, E);
            }
        }
      return n.push(sn), u != null && typeof u != "string" && (r = typeof u == "number" ? "a number for children" : Array.isArray(u) ? "an array for children" : "something unexpected for children", console.error(
        "A script element was rendered with %s. If script element has children it must be a single string. Consider using dangerouslySetInnerHTML or passing a plain string as children.",
        r
      )), we(n, d, u), typeof u == "string" && n.push(Et(u)), n.push(St("script")), null;
    }
    function Da(n, r, u) {
      n.push(mt(u));
      var d = u = null, b;
      for (b in r)
        if (kn.call(r, b)) {
          var E = r[b];
          if (E != null)
            switch (b) {
              case "children":
                u = E;
                break;
              case "dangerouslySetInnerHTML":
                d = E;
                break;
              default:
                Y(n, b, E);
            }
        }
      return n.push(sn), we(n, d, u), u;
    }
    function Ge(n, r, u) {
      n.push(mt(u));
      var d = u = null, b;
      for (b in r)
        if (kn.call(r, b)) {
          var E = r[b];
          if (E != null)
            switch (b) {
              case "children":
                u = E;
                break;
              case "dangerouslySetInnerHTML":
                d = E;
                break;
              default:
                Y(n, b, E);
            }
        }
      return n.push(sn), we(n, d, u), typeof u == "string" ? (n.push(Ie(u)), null) : u;
    }
    function mt(n) {
      var r = Ec.get(n);
      if (r === void 0) {
        if (!mr.test(n)) throw Error("Invalid tag: " + n);
        r = "<" + n, Ec.set(n, r);
      }
      return r;
    }
    function xn(n, r, u, d, b, E, F, D, te) {
      Yt(r, u), r !== "input" && r !== "textarea" && r !== "select" || u == null || u.value !== null || xi || (xi = !0, r === "select" && u.multiple ? console.error(
        "`value` prop on `%s` should not be null. Consider using an empty array when `multiple` is set to `true` to clear the component or `undefined` for uncontrolled components.",
        r
      ) : console.error(
        "`value` prop on `%s` should not be null. Consider using an empty string to clear the component or `undefined` for uncontrolled components.",
        r
      ));
      e: if (r.indexOf("-") === -1) var H = !1;
      else
        switch (r) {
          case "annotation-xml":
          case "color-profile":
          case "font-face":
          case "font-face-src":
          case "font-face-uri":
          case "font-face-format":
          case "font-face-name":
          case "missing-glyph":
            H = !1;
            break e;
          default:
            H = !0;
        }
      switch (H || typeof u.is == "string" || Hr(r, u), !u.suppressContentEditableWarning && u.contentEditable && u.children != null && console.error(
        "A component is `contentEditable` and contains `children` managed by React. It is now your responsibility to guarantee that none of those nodes are unexpectedly modified or duplicated. This is probably not intentional."
      ), D.insertionMode !== Xe && D.insertionMode !== at && r.indexOf("-") === -1 && r.toLowerCase() !== r && console.error(
        "<%s /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.",
        r
      ), r) {
        case "div":
        case "span":
        case "svg":
        case "path":
          break;
        case "a":
          n.push(mt("a"));
          var j = null, ge = null, Ce;
          for (Ce in u)
            if (kn.call(u, Ce)) {
              var ye = u[Ce];
              if (ye != null)
                switch (Ce) {
                  case "children":
                    j = ye;
                    break;
                  case "dangerouslySetInnerHTML":
                    ge = ye;
                    break;
                  case "href":
                    ye === "" ? he(n, "href", "") : Y(n, Ce, ye);
                    break;
                  default:
                    Y(n, Ce, ye);
                }
            }
          if (n.push(sn), we(n, ge, j), typeof j == "string") {
            n.push(Ie(j));
            var ae = null;
          } else ae = j;
          return ae;
        case "g":
        case "p":
        case "li":
          break;
        case "select":
          ft("select", u), Te(u, "value"), Te(u, "defaultValue"), u.value === void 0 || u.defaultValue === void 0 || Al || (console.error(
            "Select elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled select element and remove one of these props. More info: https://react.dev/link/controlled-components"
          ), Al = !0), n.push(mt("select"));
          var fn = null, Jn = null, Ye;
          for (Ye in u)
            if (kn.call(u, Ye)) {
              var Fn = u[Ye];
              if (Fn != null)
                switch (Ye) {
                  case "children":
                    fn = Fn;
                    break;
                  case "dangerouslySetInnerHTML":
                    Jn = Fn;
                    break;
                  case "defaultValue":
                  case "value":
                    break;
                  default:
                    Y(
                      n,
                      Ye,
                      Fn
                    );
                }
            }
          return n.push(sn), we(n, Jn, fn), fn;
        case "option":
          var vr = D.selectedValue;
          n.push(mt("option"));
          var yr = null, In = null, $t = null, ki = null, Vr;
          for (Vr in u)
            if (kn.call(u, Vr)) {
              var Me = u[Vr];
              if (Me != null)
                switch (Vr) {
                  case "children":
                    yr = Me;
                    break;
                  case "selected":
                    $t = Me, Qi || (console.error(
                      "Use the `defaultValue` or `value` props on <select> instead of setting `selected` on <option>."
                    ), Qi = !0);
                    break;
                  case "dangerouslySetInnerHTML":
                    ki = Me;
                    break;
                  case "value":
                    In = Me;
                  default:
                    Y(
                      n,
                      Vr,
                      Me
                    );
                }
            }
          if (vr != null) {
            if (In !== null) {
              N(In, "value");
              var Hn = "" + In;
            } else
              ki === null || Ei || (Ei = !0, console.error(
                "Pass a `value` prop if you set dangerouslyInnerHTML so React knows which value should be selected."
              )), Hn = me(yr);
            if (Yi(vr)) {
              for (var Un = 0; Un < vr.length; Un++)
                if (N(vr[Un], "value"), "" + vr[Un] === Hn) {
                  n.push(' selected=""');
                  break;
                }
            } else
              N(vr, "select.value"), "" + vr === Hn && n.push(' selected=""');
          } else $t && n.push(' selected=""');
          return n.push(sn), we(n, ki, yr), yr;
        case "textarea":
          ft("textarea", u), u.value === void 0 || u.defaultValue === void 0 || Pl || (console.error(
            "Textarea elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled textarea and remove one of these props. More info: https://react.dev/link/controlled-components"
          ), Pl = !0), n.push(mt("textarea"));
          var Xn = null, pt = null, pn = null, tn;
          for (tn in u)
            if (kn.call(u, tn)) {
              var Dr = u[tn];
              if (Dr != null)
                switch (tn) {
                  case "children":
                    pn = Dr;
                    break;
                  case "value":
                    Xn = Dr;
                    break;
                  case "defaultValue":
                    pt = Dr;
                    break;
                  case "dangerouslySetInnerHTML":
                    throw Error(
                      "`dangerouslySetInnerHTML` does not make sense on <textarea>."
                    );
                  default:
                    Y(
                      n,
                      tn,
                      Dr
                    );
                }
            }
          if (Xn === null && pt !== null && (Xn = pt), n.push(sn), pn != null) {
            if (console.error(
              "Use the `defaultValue` or `value` props instead of setting children on <textarea>."
            ), Xn != null)
              throw Error(
                "If you supply `defaultValue` on a <textarea>, do not pass children."
              );
            if (Yi(pn)) {
              if (1 < pn.length)
                throw Error("<textarea> can only have at most one child.");
              ee(pn[0]), Xn = "" + pn[0];
            }
            ee(pn), Xn = "" + pn;
          }
          return typeof Xn == "string" && Xn[0] === `
` && n.push(pa), Xn !== null && (N(Xn, "value"), n.push(Ie("" + Xn))), null;
        case "input":
          ft("input", u), n.push(mt("input"));
          var Wn = null, br = null, ct = null, al = null, Vo = null, ol = null, Si = null, Ai = null, Pi = null, or;
          for (or in u)
            if (kn.call(u, or)) {
              var e = u[or];
              if (e != null)
                switch (or) {
                  case "children":
                  case "dangerouslySetInnerHTML":
                    throw Error(
                      "input is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
                    );
                  case "name":
                    Wn = e;
                    break;
                  case "formAction":
                    br = e;
                    break;
                  case "formEncType":
                    ct = e;
                    break;
                  case "formMethod":
                    al = e;
                    break;
                  case "formTarget":
                    Vo = e;
                    break;
                  case "defaultChecked":
                    Pi = e;
                    break;
                  case "defaultValue":
                    Si = e;
                    break;
                  case "checked":
                    Ai = e;
                    break;
                  case "value":
                    ol = e;
                    break;
                  default:
                    Y(
                      n,
                      or,
                      e
                    );
                }
            }
          br === null || u.type === "image" || u.type === "submit" || Jt || (Jt = !0, console.error(
            'An input can only specify a formAction along with type="submit" or type="image".'
          ));
          var t = T(
            n,
            d,
            b,
            br,
            ct,
            al,
            Vo,
            Wn
          );
          return Ai === null || Pi === null || Cr || (console.error(
            "%s contains an input of type %s with both checked and defaultChecked props. Input elements must be either controlled or uncontrolled (specify either the checked prop, or the defaultChecked prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://react.dev/link/controlled-components",
            "A component",
            u.type
          ), Cr = !0), ol === null || Si === null || Zi || (console.error(
            "%s contains an input of type %s with both value and defaultValue props. Input elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://react.dev/link/controlled-components",
            "A component",
            u.type
          ), Zi = !0), Ai !== null ? J(n, "checked", Ai) : Pi !== null && J(n, "checked", Pi), ol !== null ? Y(n, "value", ol) : Si !== null && Y(n, "value", Si), n.push(wa), t?.forEach(Tr, n), null;
        case "button":
          n.push(mt("button"));
          var c = null, h = null, y = null, x = null, S = null, M = null, V = null, B;
          for (B in u)
            if (kn.call(u, B)) {
              var U = u[B];
              if (U != null)
                switch (B) {
                  case "children":
                    c = U;
                    break;
                  case "dangerouslySetInnerHTML":
                    h = U;
                    break;
                  case "name":
                    y = U;
                    break;
                  case "formAction":
                    x = U;
                    break;
                  case "formEncType":
                    S = U;
                    break;
                  case "formMethod":
                    M = U;
                    break;
                  case "formTarget":
                    V = U;
                    break;
                  default:
                    Y(
                      n,
                      B,
                      U
                    );
                }
            }
          x === null || u.type == null || u.type === "submit" || Jt || (Jt = !0, console.error(
            'A button can only specify a formAction along with type="submit" or no type.'
          ));
          var oe = T(
            n,
            d,
            b,
            x,
            S,
            M,
            V,
            y
          );
          if (n.push(sn), oe?.forEach(Tr, n), we(n, h, c), typeof c == "string") {
            n.push(Ie(c));
            var se = null;
          } else se = c;
          return se;
        case "form":
          n.push(mt("form"));
          var ce = null, le = null, Ue = null, Zn = null, _e = null, hn = null, Pt;
          for (Pt in u)
            if (kn.call(u, Pt)) {
              var zt = u[Pt];
              if (zt != null)
                switch (Pt) {
                  case "children":
                    ce = zt;
                    break;
                  case "dangerouslySetInnerHTML":
                    le = zt;
                    break;
                  case "action":
                    Ue = zt;
                    break;
                  case "encType":
                    Zn = zt;
                    break;
                  case "method":
                    _e = zt;
                    break;
                  case "target":
                    hn = zt;
                    break;
                  default:
                    Y(
                      n,
                      Pt,
                      zt
                    );
                }
            }
          var On = null, Le = null;
          if (typeof Ue == "function") {
            Zn === null && _e === null || xc || (xc = !0, console.error(
              "Cannot specify a encType or method for a form that specifies a function as the action. React provides those automatically. They will get overridden."
            )), hn === null || Ka || (Ka = !0, console.error(
              "Cannot specify a target for a form that specifies a function as the action. The function will always be executed in the same window."
            ));
            var Ht = fe(
              d,
              Ue
            );
            Ht !== null ? (Ue = Ht.action || "", Zn = Ht.encType, _e = Ht.method, hn = Ht.target, On = Ht.data, Le = Ht.name) : (n.push(
              En,
              "action",
              An,
              qt,
              qe
            ), hn = _e = Zn = Ue = null, Be(d, b));
          }
          if (Ue != null && Y(n, "action", Ue), Zn != null && Y(n, "encType", Zn), _e != null && Y(n, "method", _e), hn != null && Y(n, "target", hn), n.push(sn), Le !== null && (n.push('<input type="hidden"'), he(n, "name", Le), n.push(wa), On?.forEach(
            Tr,
            n
          )), we(n, le, ce), typeof ce == "string") {
            n.push(Ie(ce));
            var Nr = null;
          } else Nr = ce;
          return Nr;
        case "menuitem":
          n.push(mt("menuitem"));
          for (var Qn in u)
            if (kn.call(u, Qn)) {
              var ut = u[Qn];
              if (ut != null)
                switch (Qn) {
                  case "children":
                  case "dangerouslySetInnerHTML":
                    throw Error(
                      "menuitems cannot have `children` nor `dangerouslySetInnerHTML`."
                    );
                  default:
                    Y(
                      n,
                      Qn,
                      ut
                    );
                }
            }
          return n.push(sn), null;
        case "object":
          n.push(mt("object"));
          var cl = null, wr = null, er;
          for (er in u)
            if (kn.call(u, er)) {
              var st = u[er];
              if (st != null)
                switch (er) {
                  case "children":
                    cl = st;
                    break;
                  case "dangerouslySetInnerHTML":
                    wr = st;
                    break;
                  case "data":
                    N(st, "data");
                    var Vt = Ve("" + st);
                    if (Vt === "") {
                      console.error(
                        'An empty string ("") was passed to the %s attribute. To fix this, either do not render the element at all or pass null to %s instead of an empty string.',
                        er,
                        er
                      );
                      break;
                    }
                    n.push(
                      En,
                      "data",
                      An,
                      Ie(Vt),
                      qe
                    );
                    break;
                  default:
                    Y(
                      n,
                      er,
                      st
                    );
                }
            }
          if (n.push(sn), we(n, wr, cl), typeof cl == "string") {
            n.push(Ie(cl));
            var ul = null;
          } else ul = cl;
          return ul;
        case "title":
          var Sl = D.tagScope & 1, nr = D.tagScope & 4;
          if (kn.call(u, "children")) {
            var Tt = u.children, Lr = Array.isArray(Tt) ? 2 > Tt.length ? Tt[0] : null : Tt;
            Array.isArray(Tt) && 1 < Tt.length ? console.error(
              "React expects the `children` prop of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found an Array with length %s instead. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert `children` of <title> tags to a single string value which is why Arrays of length greater than 1 are not supported. When using JSX it can be common to combine text nodes and value nodes. For example: <title>hello {nameOfUser}</title>. While not immediately apparent, `children` in this case is an Array with length 2. If your `children` prop is using this form try rewriting it using a template string: <title>{`hello ${nameOfUser}`}</title>.",
              Tt.length
            ) : typeof Lr == "function" || typeof Lr == "symbol" ? console.error(
              "React expect children of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found %s instead. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert children of <title> tags to a single string value.",
              typeof Lr == "function" ? "a Function" : "a Sybmol"
            ) : Lr && Lr.toString === {}.toString && (Lr.$$typeof != null ? console.error(
              "React expects the `children` prop of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found an object that appears to be a React element which never implements a suitable `toString` method. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert children of <title> tags to a single string value which is why rendering React elements is not supported. If the `children` of <title> is a React Component try moving the <title> tag into that component. If the `children` of <title> is some HTML markup change it to be Text only to be valid HTML."
            ) : console.error(
              "React expects the `children` prop of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found an object that does not implement a suitable `toString` method. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert children of <title> tags to a single string value. Using the default `toString` method available on every object is almost certainly an error. Consider whether the `children` of this <title> is an object in error and change it to a string or number value if so. Otherwise implement a `toString` method that React can use to produce a valid <title>."
            ));
          }
          if (D.insertionMode === Xe || Sl || u.itemProp != null)
            var sl = tt(
              n,
              u
            );
          else
            nr ? sl = null : (tt(b.hoistableChunks, u), sl = void 0);
          return sl;
        case "link":
          var Br = D.tagScope & 1, na = D.tagScope & 4, fl = u.rel, Ut = u.href, _l = u.precedence;
          if (D.insertionMode === Xe || Br || u.itemProp != null || typeof fl != "string" || typeof Ut != "string" || Ut === "") {
            fl === "stylesheet" && typeof u.precedence == "string" && (typeof Ut == "string" && Ut || console.error(
              'React encountered a `<link rel="stylesheet" .../>` with a `precedence` prop and expected the `href` prop to be a non-empty string but ecountered %s instead. If your intent was to have React hoist and deduplciate this stylesheet using the `precedence` prop ensure there is a non-empty string `href` prop as well, otherwise remove the `precedence` prop.',
              Ut === null ? "`null`" : Ut === void 0 ? "`undefined`" : Ut === "" ? "an empty string" : 'something with type "' + typeof Ut + '"'
            )), Se(n, u);
            var cr = null;
          } else if (u.rel === "stylesheet")
            if (typeof _l != "string" || u.disabled != null || u.onLoad || u.onError) {
              if (typeof _l == "string") {
                if (u.disabled != null)
                  console.error(
                    'React encountered a `<link rel="stylesheet" .../>` with a `precedence` prop and a `disabled` prop. The presence of the `disabled` prop indicates an intent to manage the stylesheet active state from your from your Component code and React will not hoist or deduplicate this stylesheet. If your intent was to have React hoist and deduplciate this stylesheet using the `precedence` prop remove the `disabled` prop, otherwise remove the `precedence` prop.'
                  );
                else if (u.onLoad || u.onError) {
                  var Qu = u.onLoad && u.onError ? "`onLoad` and `onError` props" : u.onLoad ? "`onLoad` prop" : "`onError` prop";
                  console.error(
                    'React encountered a `<link rel="stylesheet" .../>` with a `precedence` prop and %s. The presence of loading and error handlers indicates an intent to manage the stylesheet loading state from your from your Component code and React will not hoist or deduplicate this stylesheet. If your intent was to have React hoist and deduplciate this stylesheet using the `precedence` prop remove the %s, otherwise remove the `precedence` prop.',
                    Qu,
                    Qu
                  );
                }
              }
              cr = Se(
                n,
                u
              );
            } else {
              var Fi = b.styles.get(_l), Ft = d.styleResources.hasOwnProperty(
                Ut
              ) ? d.styleResources[Ut] : void 0;
              if (Ft !== I) {
                d.styleResources[Ut] = I, Fi || (Fi = {
                  precedence: Ie(_l),
                  rules: [],
                  hrefs: [],
                  sheets: /* @__PURE__ */ new Map()
                }, b.styles.set(_l, Fi));
                var zl = {
                  state: w,
                  props: it({}, u, {
                    "data-precedence": u.precedence,
                    precedence: null
                  })
                };
                if (Ft) {
                  Ft.length === 2 && yl(zl.props, Ft);
                  var _r = b.preloads.stylesheets.get(Ut);
                  _r && 0 < _r.length ? _r.length = 0 : zl.state = C;
                }
                Fi.sheets.set(Ut, zl), F && F.stylesheets.add(zl);
              } else if (Fi) {
                var Nc = Fi.sheets.get(Ut);
                Nc && F && F.stylesheets.add(Nc);
              }
              te && n.push("<!-- -->"), cr = null;
            }
          else
            u.onLoad || u.onError ? cr = Se(
              n,
              u
            ) : (te && n.push("<!-- -->"), cr = na ? null : Se(b.hoistableChunks, u));
          return cr;
        case "script":
          var Ko = D.tagScope & 1, ci = u.async;
          if (typeof u.src != "string" || !u.src || !ci || typeof ci == "function" || typeof ci == "symbol" || u.onLoad || u.onError || D.insertionMode === Xe || Ko || u.itemProp != null)
            var jo = Ct(
              n,
              u
            );
          else {
            var hl = u.src;
            if (u.type === "module")
              var Lc = d.moduleScriptResources, Ju = b.preloads.moduleScripts;
            else
              Lc = d.scriptResources, Ju = b.preloads.scripts;
            var Hl = Lc.hasOwnProperty(hl) ? Lc[hl] : void 0;
            if (Hl !== I) {
              Lc[hl] = I;
              var Bc = u;
              if (Hl) {
                Hl.length === 2 && (Bc = it({}, u), yl(Bc, Hl));
                var zr = Ju.get(hl);
                zr && (zr.length = 0);
              }
              var qo = [];
              b.scripts.add(qo), Ct(qo, Bc);
            }
            te && n.push("<!-- -->"), jo = null;
          }
          return jo;
        case "style":
          var go = D.tagScope & 1;
          if (kn.call(u, "children")) {
            var Fa = u.children, Ul = Array.isArray(Fa) ? 2 > Fa.length ? Fa[0] : null : Fa;
            (typeof Ul == "function" || typeof Ul == "symbol" || Array.isArray(Ul)) && console.error(
              "React expect children of <style> tags to be a string, number, or object with a `toString` method but found %s instead. In browsers style Elements can only have `Text` Nodes as children.",
              typeof Ul == "function" ? "a Function" : typeof Ul == "symbol" ? "a Sybmol" : "an Array"
            );
          }
          var Wl = u.precedence, Oi = u.href, dl = u.nonce;
          if (D.insertionMode === Xe || go || u.itemProp != null || typeof Wl != "string" || typeof Oi != "string" || Oi === "") {
            n.push(mt("style"));
            var pr = null, Oa = null, Mi;
            for (Mi in u)
              if (kn.call(u, Mi)) {
                var vo = u[Mi];
                if (vo != null)
                  switch (Mi) {
                    case "children":
                      pr = vo;
                      break;
                    case "dangerouslySetInnerHTML":
                      Oa = vo;
                      break;
                    default:
                      Y(
                        n,
                        Mi,
                        vo
                      );
                  }
              }
            n.push(sn);
            var ta = Array.isArray(pr) ? 2 > pr.length ? pr[0] : null : pr;
            typeof ta != "function" && typeof ta != "symbol" && ta !== null && ta !== void 0 && n.push(Rt(ta)), we(
              n,
              Oa,
              pr
            ), n.push(St("style"));
            var ws = null;
          } else {
            Oi.includes(" ") && console.error(
              'React expected the `href` prop for a <style> tag opting into hoisting semantics using the `precedence` prop to not have any spaces but ecountered spaces instead. using spaces in this prop will cause hydration of this style to fail on the client. The href for the <style> where this ocurred is "%s".',
              Oi
            );
            var Kr = b.styles.get(Wl), ui = d.styleResources.hasOwnProperty(Oi) ? d.styleResources[Oi] : void 0;
            if (ui !== I) {
              d.styleResources[Oi] = I, ui && console.error(
                'React encountered a hoistable style tag for the same href as a preload: "%s". When using a style tag to inline styles you should not also preload it as a stylsheet.',
                Oi
              ), Kr || (Kr = {
                precedence: Ie(Wl),
                rules: [],
                hrefs: [],
                sheets: /* @__PURE__ */ new Map()
              }, b.styles.set(
                Wl,
                Kr
              ));
              var _c = b.nonce.style;
              if (_c && _c !== dl)
                console.error(
                  'React encountered a style tag with `precedence` "%s" and `nonce` "%s". When React manages style rules using `precedence` it will only include rules if the nonce matches the style nonce "%s" that was included with this render.',
                  Wl,
                  dl,
                  _c
                );
              else {
                !_c && dl && console.error(
                  'React encountered a style tag with `precedence` "%s" and `nonce` "%s". When React manages style rules using `precedence` it will only include a nonce attributes if you also provide the same style nonce value as a render option.',
                  Wl,
                  dl
                ), Kr.hrefs.push(
                  Ie(Oi)
                );
                var pu = Kr.rules, Tu = null, Xs = null, yo;
                for (yo in u)
                  if (kn.call(u, yo)) {
                    var $o = u[yo];
                    if ($o != null)
                      switch (yo) {
                        case "children":
                          Tu = $o;
                          break;
                        case "dangerouslySetInnerHTML":
                          Xs = $o;
                      }
                  }
                var bo = Array.isArray(Tu) ? 2 > Tu.length ? Tu[0] : null : Tu;
                typeof bo != "function" && typeof bo != "symbol" && bo !== null && bo !== void 0 && pu.push(Rt(bo)), we(pu, Xs, Tu);
              }
            }
            Kr && F && F.styles.add(Kr), te && n.push("<!-- -->"), ws = void 0;
          }
          return ws;
        case "meta":
          var xu = D.tagScope & 1, Ls = D.tagScope & 4;
          if (D.insertionMode === Xe || xu || u.itemProp != null)
            var Ss = Rn(
              n,
              u,
              "meta"
            );
          else
            te && n.push("<!-- -->"), Ss = Ls ? null : typeof u.charSet == "string" ? Rn(b.charsetChunks, u, "meta") : u.name === "viewport" ? Rn(b.viewportChunks, u, "meta") : Rn(
              b.hoistableChunks,
              u,
              "meta"
            );
          return Ss;
        case "listing":
        case "pre":
          n.push(mt(r));
          var jr = null, Ii = null, wo;
          for (wo in u)
            if (kn.call(u, wo)) {
              var Vu = u[wo];
              if (Vu != null)
                switch (wo) {
                  case "children":
                    jr = Vu;
                    break;
                  case "dangerouslySetInnerHTML":
                    Ii = Vu;
                    break;
                  default:
                    Y(
                      n,
                      wo,
                      Vu
                    );
                }
            }
          if (n.push(sn), Ii != null) {
            if (jr != null)
              throw Error(
                "Can only set one of `children` or `props.dangerouslySetInnerHTML`."
              );
            if (typeof Ii != "object" || !("__html" in Ii))
              throw Error(
                "`props.dangerouslySetInnerHTML` must be in the form `{__html: ...}`. Please visit https://react.dev/link/dangerously-set-inner-html for more information."
              );
            var Yl = Ii.__html;
            Yl != null && (typeof Yl == "string" && 0 < Yl.length && Yl[0] === `
` ? n.push(pa, Yl) : (ee(Yl), n.push("" + Yl)));
          }
          return typeof jr == "string" && jr[0] === `
` && n.push(pa), jr;
        case "img":
          var Wt = D.tagScope & 3, xt = u.src, et = u.srcSet;
          if (!(u.loading === "lazy" || !xt && !et || typeof xt != "string" && xt != null || typeof et != "string" && et != null || u.fetchPriority === "low" || Wt) && (typeof xt != "string" || xt[4] !== ":" || xt[0] !== "d" && xt[0] !== "D" || xt[1] !== "a" && xt[1] !== "A" || xt[2] !== "t" && xt[2] !== "T" || xt[3] !== "a" && xt[3] !== "A") && (typeof et != "string" || et[4] !== ":" || et[0] !== "d" && et[0] !== "D" || et[1] !== "a" && et[1] !== "A" || et[2] !== "t" && et[2] !== "T" || et[3] !== "a" && et[3] !== "A")) {
            F !== null && D.tagScope & 64 && (F.suspenseyImages = !0);
            var As = typeof u.sizes == "string" ? u.sizes : void 0, ec = et ? et + `
` + (As || "") : xt, Ku = b.preloads.images, nc = Ku.get(ec);
            if (nc)
              (u.fetchPriority === "high" || 10 > b.highImagePreloads.size) && (Ku.delete(ec), b.highImagePreloads.add(nc));
            else if (!d.imageResources.hasOwnProperty(ec)) {
              d.imageResources[ec] = G;
              var zc = u.crossOrigin, ju = typeof zc == "string" ? zc === "use-credentials" ? zc : "" : void 0, Hc = b.headers, Eu;
              Hc && 0 < Hc.remainingCapacity && typeof u.srcSet != "string" && (u.fetchPriority === "high" || 500 > Hc.highImagePreloads.length) && (Eu = R(xt, "image", {
                imageSrcSet: u.srcSet,
                imageSizes: u.sizes,
                crossOrigin: ju,
                integrity: u.integrity,
                nonce: u.nonce,
                type: u.type,
                fetchPriority: u.fetchPriority,
                referrerPolicy: u.refererPolicy
              }), 0 <= (Hc.remainingCapacity -= Eu.length + 2)) ? (b.resets.image[ec] = G, Hc.highImagePreloads && (Hc.highImagePreloads += ", "), Hc.highImagePreloads += Eu) : (nc = [], Se(nc, {
                rel: "preload",
                as: "image",
                href: et ? void 0 : xt,
                imageSrcSet: et,
                imageSizes: As,
                crossOrigin: ju,
                integrity: u.integrity,
                type: u.type,
                fetchPriority: u.fetchPriority,
                referrerPolicy: u.referrerPolicy
              }), u.fetchPriority === "high" || 10 > b.highImagePreloads.size ? b.highImagePreloads.add(nc) : (b.bulkPreloads.add(nc), Ku.set(ec, nc)));
            }
          }
          return Rn(n, u, "img");
        case "base":
        case "area":
        case "br":
        case "col":
        case "embed":
        case "hr":
        case "keygen":
        case "param":
        case "source":
        case "track":
        case "wbr":
          return Rn(n, u, r);
        case "annotation-xml":
        case "color-profile":
        case "font-face":
        case "font-face-src":
        case "font-face-uri":
        case "font-face-format":
        case "font-face-name":
        case "missing-glyph":
          break;
        case "head":
          if (D.insertionMode < ze) {
            var Ru = E || b.preamble;
            if (Ru.headChunks)
              throw Error("The `<head>` tag may only be rendered once.");
            E !== null && n.push("<!--head-->"), Ru.headChunks = [];
            var ps = Da(
              Ru.headChunks,
              u,
              "head"
            );
          } else
            ps = Ge(
              n,
              u,
              "head"
            );
          return ps;
        case "body":
          if (D.insertionMode < ze) {
            var Ps = E || b.preamble;
            if (Ps.bodyChunks)
              throw Error("The `<body>` tag may only be rendered once.");
            E !== null && n.push("<!--body-->"), Ps.bodyChunks = [];
            var Bs = Da(
              Ps.bodyChunks,
              u,
              "body"
            );
          } else
            Bs = Ge(
              n,
              u,
              "body"
            );
          return Bs;
        case "html":
          if (D.insertionMode === on) {
            var qu = E || b.preamble;
            if (qu.htmlChunks)
              throw Error("The `<html>` tag may only be rendered once.");
            E !== null && n.push("<!--html-->"), qu.htmlChunks = [Z];
            var $u = Da(
              qu.htmlChunks,
              u,
              "html"
            );
          } else
            $u = Ge(
              n,
              u,
              "html"
            );
          return $u;
        default:
          if (r.indexOf("-") !== -1) {
            n.push(mt(r));
            var Uc = null, po = null, Ma;
            for (Ma in u)
              if (kn.call(u, Ma)) {
                var gl = u[Ma];
                if (gl != null) {
                  var Cu = Ma;
                  switch (Ma) {
                    case "children":
                      Uc = gl;
                      break;
                    case "dangerouslySetInnerHTML":
                      po = gl;
                      break;
                    case "style":
                      Ae(n, gl);
                      break;
                    case "suppressContentEditableWarning":
                    case "suppressHydrationWarning":
                    case "ref":
                      break;
                    case "className":
                      Cu = "class";
                    default:
                      if (X(Ma) && typeof gl != "function" && typeof gl != "symbol" && gl !== !1) {
                        if (gl === !0)
                          gl = "";
                        else if (typeof gl == "object")
                          continue;
                        n.push(
                          En,
                          Cu,
                          An,
                          Ie(gl),
                          qe
                        );
                      }
                  }
                }
              }
            return n.push(sn), we(
              n,
              po,
              Uc
            ), Uc;
          }
      }
      return Ge(n, u, r);
    }
    function St(n) {
      var r = kr.get(n);
      return r === void 0 && (r = "</" + n + ">", kr.set(n, r)), r;
    }
    function Gt(n, r) {
      n = n.preamble, n.htmlChunks === null && r.htmlChunks && (n.htmlChunks = r.htmlChunks), n.headChunks === null && r.headChunks && (n.headChunks = r.headChunks), n.bodyChunks === null && r.bodyChunks && (n.bodyChunks = r.bodyChunks);
    }
    function Xl(n, r) {
      r = r.bootstrapChunks;
      for (var u = 0; u < r.length - 1; u++)
        n.push(r[u]);
      return u < r.length ? (u = r[u], r.length = 0, n.push(u)) : !0;
    }
    function Xt(n, r, u) {
      if (n.push(nu), u === null)
        throw Error(
          "An ID must have been assigned before we can complete the boundary."
        );
      return n.push(r.boundaryPrefix), r = u.toString(16), n.push(r), n.push(Lt);
    }
    function De(n, r, u, d) {
      switch (u.insertionMode) {
        case on:
        case Ze:
        case je:
        case ze:
          return n.push(xa), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(yt);
        case Xe:
          return n.push(Ea), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(qa);
        case at:
          return n.push(dr), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(_o);
        case cn:
          return n.push(Bu), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push($a);
        case wn:
          return n.push(tu), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(ru);
        case Mn:
          return n.push(eo), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(no);
        case en:
          return n.push(kc), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(Sc);
        default:
          throw Error("Unknown insertion mode. This is a bug in React.");
      }
    }
    function xr(n, r) {
      switch (r.insertionMode) {
        case on:
        case Ze:
        case je:
        case ze:
          return n.push(Zr);
        case Xe:
          return n.push(Ol);
        case at:
          return n.push(Sr);
        case cn:
          return n.push(mc);
        case wn:
          return n.push(Ri);
        case Mn:
          return n.push(Ar);
        case en:
          return n.push(_u);
        default:
          throw Error("Unknown insertion mode. This is a bug in React.");
      }
    }
    function At(n) {
      return JSON.stringify(n).replace(
        zo,
        function(r) {
          switch (r) {
            case "<":
              return "\\u003c";
            case "\u2028":
              return "\\u2028";
            case "\u2029":
              return "\\u2029";
            default:
              throw Error(
                "escapeJSStringsForInstructionScripts encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
              );
          }
        }
      );
    }
    function $r(n) {
      return JSON.stringify(n).replace(
        Ca,
        function(r) {
          switch (r) {
            case "&":
              return "\\u0026";
            case ">":
              return "\\u003e";
            case "<":
              return "\\u003c";
            case "\u2028":
              return "\\u2028";
            case "\u2029":
              return "\\u2029";
            default:
              throw Error(
                "escapeJSObjectForInstructionScripts encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
              );
          }
        }
      );
    }
    function Na(n) {
      var r = n.rules, u = n.hrefs;
      0 < r.length && u.length === 0 && console.error(
        "React expected to have at least one href for an a hoistable style but found none. This is a bug in React."
      );
      var d = 0;
      if (u.length) {
        for (this.push(re.startInlineStyle), this.push(Oc), this.push(n.precedence), this.push(ma); d < u.length - 1; d++)
          this.push(u[d]), this.push(Il);
        for (this.push(u[d]), this.push(us), d = 0; d < r.length; d++) this.push(r[d]);
        Ho = this.push(ss), li = !0, r.length = 0, u.length = 0;
      }
    }
    function vn(n) {
      return n.state !== k ? li = !0 : !1;
    }
    function rr(n, r, u) {
      return li = !1, Ho = !0, re = u, r.styles.forEach(Na, n), re = null, r.stylesheets.forEach(vn), li && (u.stylesToHoist = !0), Ho;
    }
    function Bn(n) {
      for (var r = 0; r < n.length; r++) this.push(n[r]);
      n.length = 0;
    }
    function rc(n) {
      Se(ml, n.props);
      for (var r = 0; r < ml.length; r++)
        this.push(ml[r]);
      ml.length = 0, n.state = k;
    }
    function ht(n) {
      var r = 0 < n.sheets.size;
      n.sheets.forEach(rc, this), n.sheets.clear();
      var u = n.rules, d = n.hrefs;
      if (!r || d.length) {
        if (this.push(re.startInlineStyle), this.push(ka), this.push(n.precedence), n = 0, d.length) {
          for (this.push(ro); n < d.length - 1; n++)
            this.push(d[n]), this.push(Il);
          this.push(d[n]);
        }
        for (this.push(Yu), n = 0; n < u.length; n++)
          this.push(u[n]);
        this.push(fs), u.length = 0, d.length = 0;
      }
    }
    function To(n) {
      if (n.state === w) {
        n.state = C;
        var r = n.props;
        for (Se(ml, {
          rel: "preload",
          as: "style",
          href: n.props.href,
          crossOrigin: r.crossOrigin,
          fetchPriority: r.fetchPriority,
          integrity: r.integrity,
          media: r.media,
          hrefLang: r.hrefLang,
          referrerPolicy: r.referrerPolicy
        }), n = 0; n < ml.length; n++)
          this.push(ml[n]);
        ml.length = 0;
      }
    }
    function xo(n) {
      n.sheets.forEach(To, this), n.sheets.clear();
    }
    function el(n, r) {
      (r.instructions & A) === o && (r.instructions |= A, n.push(
        Uo,
        Ie("_" + r.idPrefix + "R_"),
        qe
      ));
    }
    function aa(n, r) {
      n.push(l);
      var u = l;
      r.stylesheets.forEach(function(d) {
        if (d.state !== k)
          if (d.state === _)
            n.push(u), d = d.props.href, N(d, "href"), d = $r("" + d), n.push(d), n.push(v), u = a;
          else {
            n.push(u);
            var b = d.props["data-precedence"], E = d.props, F = Ve("" + d.props.href);
            F = $r(F), n.push(F), N(b, "precedence"), b = "" + b, n.push(s), b = $r(b), n.push(b);
            for (var D in E)
              if (kn.call(E, D) && (b = E[D], b != null))
                switch (D) {
                  case "href":
                  case "rel":
                  case "precedence":
                  case "data-precedence":
                    break;
                  case "children":
                  case "dangerouslySetInnerHTML":
                    throw Error(
                      "link is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
                    );
                  default:
                    fi(
                      n,
                      D,
                      b
                    );
                }
            n.push(v), u = a, d.state = _;
          }
      }), n.push(v);
    }
    function fi(n, r, u) {
      var d = r.toLowerCase();
      switch (typeof u) {
        case "function":
        case "symbol":
          return;
      }
      switch (r) {
        case "innerHTML":
        case "dangerouslySetInnerHTML":
        case "suppressContentEditableWarning":
        case "suppressHydrationWarning":
        case "style":
        case "ref":
          return;
        case "className":
          d = "class", N(u, d), r = "" + u;
          break;
        case "hidden":
          if (u === !1) return;
          r = "";
          break;
        case "src":
        case "href":
          u = Ve(u), N(u, d), r = "" + u;
          break;
        default:
          if (2 < r.length && (r[0] === "o" || r[0] === "O") && (r[1] === "n" || r[1] === "N") || !X(r))
            return;
          N(u, d), r = "" + u;
      }
      n.push(s), d = $r(d), n.push(d), n.push(s), d = $r(r), n.push(d);
    }
    function Zl() {
      return { styles: /* @__PURE__ */ new Set(), stylesheets: /* @__PURE__ */ new Set(), suspenseyImages: !1 };
    }
    function Ql(n, r, u, d) {
      (n.scriptResources.hasOwnProperty(u) || n.moduleScriptResources.hasOwnProperty(u)) && console.error(
        'Internal React Error: React expected bootstrap script or module with src "%s" to not have been preloaded already. please file an issue',
        u
      ), n.scriptResources[u] = I, n.moduleScriptResources[u] = I, n = [], Se(n, d), r.bootstrapScripts.add(n);
    }
    function yl(n, r) {
      n.crossOrigin == null && (n.crossOrigin = r[0]), n.integrity == null && (n.integrity = r[1]);
    }
    function R(n, r, u) {
      n = L(n), r = Ee(r, "as"), r = "<" + n + '>; rel=preload; as="' + r + '"';
      for (var d in u)
        kn.call(u, d) && (n = u[d], typeof n == "string" && (r += "; " + d.toLowerCase() + '="' + Ee(
          n,
          d
        ) + '"'));
      return r;
    }
    function L(n) {
      return N(n, "href"), ("" + n).replace(
        O,
        ne
      );
    }
    function ne(n) {
      switch (n) {
        case "<":
          return "%3C";
        case ">":
          return "%3E";
        case `
`:
          return "%0A";
        case "\r":
          return "%0D";
        default:
          throw Error(
            "escapeLinkHrefForHeaderContextReplacer encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
          );
      }
    }
    function Ee(n, r) {
      return He(n) && (console.error(
        "The provided `%s` option is an unsupported type %s. This value must be coerced to a string before using it here.",
        r,
        ie(n)
      ), P(n)), ("" + n).replace(
        z,
        Fe
      );
    }
    function Fe(n) {
      switch (n) {
        case '"':
          return "%22";
        case "'":
          return "%27";
        case ";":
          return "%3B";
        case ",":
          return "%2C";
        case `
`:
          return "%0A";
        case "\r":
          return "%0D";
        default:
          throw Error(
            "escapeStringForLinkHeaderQuotedParamValueContextReplacer encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
          );
      }
    }
    function ln(n) {
      this.styles.add(n);
    }
    function Ke(n) {
      this.stylesheets.add(n);
    }
    function an(n, r) {
      r.styles.forEach(ln, n), r.stylesheets.forEach(Ke, n), r.suspenseyImages && (n.suspenseyImages = !0);
    }
    function We(n, r) {
      var u = n.idPrefix, d = [], b = n.bootstrapScriptContent, E = n.bootstrapScripts, F = n.bootstrapModules;
      if (b !== void 0 && (d.push("<script"), el(d, n), d.push(
        sn,
        Et(b),
        $
      )), u = {
        placeholderPrefix: u + "P:",
        segmentPrefix: u + "S:",
        boundaryPrefix: u + "B:",
        startInlineScript: "<script",
        startInlineStyle: "<style",
        preamble: { htmlChunks: null, headChunks: null, bodyChunks: null },
        externalRuntimeScript: null,
        bootstrapChunks: d,
        importMapChunks: [],
        onHeaders: void 0,
        headers: null,
        resets: {
          font: {},
          dns: {},
          connect: { default: {}, anonymous: {}, credentials: {} },
          image: {},
          style: {}
        },
        charsetChunks: [],
        viewportChunks: [],
        hoistableChunks: [],
        preconnects: /* @__PURE__ */ new Set(),
        fontPreloads: /* @__PURE__ */ new Set(),
        highImagePreloads: /* @__PURE__ */ new Set(),
        styles: /* @__PURE__ */ new Map(),
        bootstrapScripts: /* @__PURE__ */ new Set(),
        scripts: /* @__PURE__ */ new Set(),
        bulkPreloads: /* @__PURE__ */ new Set(),
        preloads: {
          images: /* @__PURE__ */ new Map(),
          stylesheets: /* @__PURE__ */ new Map(),
          scripts: /* @__PURE__ */ new Map(),
          moduleScripts: /* @__PURE__ */ new Map()
        },
        nonce: { script: void 0, style: void 0 },
        hoistableState: null,
        stylesToHoist: !1
      }, E !== void 0)
        for (b = 0; b < E.length; b++) {
          var D = E[b], te, H = void 0, j = void 0, ge = {
            rel: "preload",
            as: "script",
            fetchPriority: "low",
            nonce: void 0
          };
          typeof D == "string" ? ge.href = te = D : (ge.href = te = D.src, ge.integrity = j = typeof D.integrity == "string" ? D.integrity : void 0, ge.crossOrigin = H = typeof D == "string" || D.crossOrigin == null ? void 0 : D.crossOrigin === "use-credentials" ? "use-credentials" : ""), Ql(n, u, te, ge), d.push(
            '<script src="',
            Ie(te),
            qe
          ), typeof j == "string" && d.push(
            ' integrity="',
            Ie(j),
            qe
          ), typeof H == "string" && d.push(
            ' crossorigin="',
            Ie(H),
            qe
          ), el(d, n), d.push(' async=""><\/script>');
        }
      if (F !== void 0)
        for (E = 0; E < F.length; E++)
          b = F[E], H = te = void 0, j = {
            rel: "modulepreload",
            fetchPriority: "low",
            nonce: void 0
          }, typeof b == "string" ? j.href = D = b : (j.href = D = b.src, j.integrity = H = typeof b.integrity == "string" ? b.integrity : void 0, j.crossOrigin = te = typeof b == "string" || b.crossOrigin == null ? void 0 : b.crossOrigin === "use-credentials" ? "use-credentials" : ""), Ql(
            n,
            u,
            D,
            j
          ), d.push(
            '<script type="module" src="',
            Ie(D),
            qe
          ), typeof H == "string" && d.push(
            ' integrity="',
            Ie(H),
            qe
          ), typeof te == "string" && d.push(
            ' crossorigin="',
            Ie(te),
            qe
          ), el(d, n), d.push(' async=""><\/script>');
      return {
        placeholderPrefix: u.placeholderPrefix,
        segmentPrefix: u.segmentPrefix,
        boundaryPrefix: u.boundaryPrefix,
        startInlineScript: u.startInlineScript,
        startInlineStyle: u.startInlineStyle,
        preamble: u.preamble,
        externalRuntimeScript: u.externalRuntimeScript,
        bootstrapChunks: u.bootstrapChunks,
        importMapChunks: u.importMapChunks,
        onHeaders: u.onHeaders,
        headers: u.headers,
        resets: u.resets,
        charsetChunks: u.charsetChunks,
        viewportChunks: u.viewportChunks,
        hoistableChunks: u.hoistableChunks,
        preconnects: u.preconnects,
        fontPreloads: u.fontPreloads,
        highImagePreloads: u.highImagePreloads,
        styles: u.styles,
        bootstrapScripts: u.bootstrapScripts,
        scripts: u.scripts,
        bulkPreloads: u.bulkPreloads,
        preloads: u.preloads,
        nonce: u.nonce,
        stylesToHoist: u.stylesToHoist,
        generateStaticMarkup: r
      };
    }
    function Jl(n, r, u, d) {
      return u.generateStaticMarkup ? (n.push(Ie(r)), !1) : (r === "" ? n = d : (d && n.push("<!-- -->"), n.push(Ie(r)), n = !0), n);
    }
    function nl(n, r, u, d) {
      r.generateStaticMarkup || u && d && n.push("<!-- -->");
    }
    function dt(n) {
      if (n == null) return null;
      if (typeof n == "function")
        return n.$$typeof === xe ? null : n.displayName || n.name || null;
      if (typeof n == "string") return n;
      switch (n) {
        case Ti:
          return "Fragment";
        case yc:
          return "Profiler";
        case vc:
          return "StrictMode";
        case rl:
          return "Suspense";
        case xl:
          return "SuspenseList";
        case ni:
          return "Activity";
      }
      if (typeof n == "object")
        switch (typeof n.tag == "number" && console.error(
          "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
        ), n.$$typeof) {
          case Nt:
            return "Portal";
          case pl:
            return n.displayName || "Context";
          case Jc:
            return (n._context.displayName || "Context") + ".Consumer";
          case Tl:
            var r = n.render;
            return n = n.displayName, n || (n = r.displayName || r.name || "", n = n !== "" ? "ForwardRef(" + n + ")" : "ForwardRef"), n;
          case Gn:
            return r = n.displayName || null, r !== null ? r : dt(n.type) || "Memo";
          case El:
            r = n._payload, n = n._init;
            try {
              return dt(n(r));
            } catch {
            }
        }
      return null;
    }
    function hi(n, r) {
      if (n !== r) {
        n.context._currentValue2 = n.parentValue, n = n.parent;
        var u = r.parent;
        if (n === null) {
          if (u !== null)
            throw Error(
              "The stacks must reach the root at the same time. This is a bug in React."
            );
        } else {
          if (u === null)
            throw Error(
              "The stacks must reach the root at the same time. This is a bug in React."
            );
          hi(n, u);
        }
        r.context._currentValue2 = r.value;
      }
    }
    function oa(n) {
      n.context._currentValue2 = n.parentValue, n = n.parent, n !== null && oa(n);
    }
    function La(n) {
      var r = n.parent;
      r !== null && La(r), n.context._currentValue2 = n.value;
    }
    function ur(n, r) {
      if (n.context._currentValue2 = n.parentValue, n = n.parent, n === null)
        throw Error(
          "The depth must equal at least at zero before reaching the root. This is a bug in React."
        );
      n.depth === r.depth ? hi(n, r) : ur(n, r);
    }
    function tl(n, r) {
      var u = r.parent;
      if (u === null)
        throw Error(
          "The depth must equal at least at zero before reaching the root. This is a bug in React."
        );
      n.depth === u.depth ? hi(n, u) : tl(n, u), r.context._currentValue2 = r.value;
    }
    function Yn(n) {
      var r = Qe;
      r !== n && (r === null ? La(n) : n === null ? oa(r) : r.depth === n.depth ? hi(r, n) : r.depth > n.depth ? ur(r, n) : tl(r, n), Qe = n);
    }
    function lc(n) {
      if (n !== null && typeof n != "function") {
        var r = String(n);
        ji.has(r) || (ji.add(r), console.error(
          "Expected the last optional `callback` argument to be a function. Instead received: %s.",
          n
        ));
      }
    }
    function bl(n, r) {
      n = (n = n.constructor) && dt(n) || "ReactClass";
      var u = n + "." + r;
      bn[u] || (console.error(
        `Can only update a mounting component. This usually means you called %s() outside componentWillMount() on the server. This is a no-op.

Please check the code for the %s component.`,
        r,
        n
      ), bn[u] = !0);
    }
    function Cn(n, r, u) {
      var d = n.id;
      n = n.overflow;
      var b = 32 - Nl(d) - 1;
      d &= ~(1 << b), u += 1;
      var E = 32 - Nl(r) + b;
      if (30 < E) {
        var F = b - b % 5;
        return E = (d & (1 << F) - 1).toString(32), d >>= F, b -= F, {
          id: 1 << 32 - Nl(r) + b | u << b | d,
          overflow: E + n
        };
      }
      return {
        id: 1 << E | u << b | d,
        overflow: n
      };
    }
    function es(n) {
      return n >>>= 0, n === 0 ? 32 : 31 - (Fr(n) / ii | 0) | 0;
    }
    function dn() {
    }
    function ic(n, r, u) {
      switch (u = n[u], u === void 0 ? n.push(r) : u !== r && (r.then(dn, dn), r = u), r.status) {
        case "fulfilled":
          return r.value;
        case "rejected":
          throw r.reason;
        default:
          switch (typeof r.status == "string" ? r.then(dn, dn) : (n = r, n.status = "pending", n.then(
            function(d) {
              if (r.status === "pending") {
                var b = r;
                b.status = "fulfilled", b.value = d;
              }
            },
            function(d) {
              if (r.status === "pending") {
                var b = r;
                b.status = "rejected", b.reason = d;
              }
            }
          )), r.status) {
            case "fulfilled":
              return r.value;
            case "rejected":
              throw r.reason;
          }
          throw io = r, Or;
      }
    }
    function ac() {
      if (io === null)
        throw Error(
          "Expected a suspended thenable. This is a bug in React. Please file an issue."
        );
      var n = io;
      return io = null, n;
    }
    function oc(n, r) {
      return n === r && (n !== 0 || 1 / n === 1 / r) || n !== n && r !== r;
    }
    function di() {
      if (Jr === null)
        throw Error(
          `Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:
1. You might have mismatching versions of React and the renderer (such as React DOM)
2. You might be breaking the Rules of Hooks
3. You might have more than one copy of React in the same app
See https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.`
        );
      return Ci && console.error(
        "Do not call Hooks inside useEffect(...), useMemo(...), or other built-in Hooks. You can only call Hooks at the top level of your React function. For more information, see https://react.dev/link/rules-of-hooks"
      ), Jr;
    }
    function _n() {
      if (0 < hu)
        throw Error("Rendered more hooks than during the previous render");
      return { memoizedState: null, queue: null, next: null };
    }
    function mn() {
      return ot === null ? Gu === null ? (Go = !1, Gu = ot = _n()) : (Go = !0, ot = Gu) : ot.next === null ? (Go = !1, ot = ot.next = _n()) : (Go = !0, ot = ot.next), ot;
    }
    function Vl() {
      var n = Xo;
      return Xo = null, n;
    }
    function sr() {
      Ci = !1, ao = Mr = Yo = Jr = null, ai = !1, Gu = null, hu = 0, ot = Sa = null;
    }
    function Ba(n) {
      return Ci && console.error(
        "Context can only be read while React is rendering. In classes, you can read it in the render method or getDerivedStateFromProps. In function components, you can read it directly in the function body, but not inside Hooks like useReducer() or useMemo()."
      ), n._currentValue2;
    }
    function Wc(n, r) {
      return typeof r == "function" ? r(n) : r;
    }
    function Er(n, r, u) {
      if (n !== Wc && (co = "useReducer"), Jr = di(), ot = mn(), Go) {
        if (u = ot.queue, r = u.dispatch, Sa !== null) {
          var d = Sa.get(u);
          if (d !== void 0) {
            Sa.delete(u), u = ot.memoizedState;
            do {
              var b = d.action;
              Ci = !0, u = n(u, b), Ci = !1, d = d.next;
            } while (d !== null);
            return ot.memoizedState = u, [u, r];
          }
        }
        return [ot.memoizedState, r];
      }
      return Ci = !0, n = n === Wc ? typeof r == "function" ? r() : r : u !== void 0 ? u(r) : r, Ci = !1, ot.memoizedState = n, n = ot.queue = { last: null, dispatch: null }, n = n.dispatch = ku.bind(
        null,
        Jr,
        n
      ), [ot.memoizedState, n];
    }
    function ns(n, r) {
      if (Jr = di(), ot = mn(), r = r === void 0 ? null : r, ot !== null) {
        var u = ot.memoizedState;
        if (u !== null && r !== null) {
          e: {
            var d = u[1];
            if (d === null)
              console.error(
                "%s received a final argument during this render, but not during the previous render. Even though the final argument is optional, its type cannot change between renders.",
                co
              ), d = !1;
            else {
              r.length !== d.length && console.error(
                `The final argument passed to %s changed size between renders. The order and size of this array must remain constant.

Previous: %s
Incoming: %s`,
                co,
                "[" + r.join(", ") + "]",
                "[" + d.join(", ") + "]"
              );
              for (var b = 0; b < d.length && b < r.length; b++)
                if (!Wo(r[b], d[b])) {
                  d = !1;
                  break e;
                }
              d = !0;
            }
          }
          if (d) return u[0];
        }
      }
      return Ci = !0, n = n(), Ci = !1, ot.memoizedState = [n, r], n;
    }
    function ku(n, r, u) {
      if (25 <= hu)
        throw Error(
          "Too many re-renders. React limits the number of renders to prevent an infinite loop."
        );
      if (n === Jr)
        if (ai = !0, n = { action: u, next: null }, Sa === null && (Sa = /* @__PURE__ */ new Map()), u = Sa.get(r), u === void 0)
          Sa.set(r, n);
        else {
          for (r = u; r.next !== null; ) r = r.next;
          r.next = n;
        }
    }
    function Yc() {
      throw Error(
        "A function wrapped in useEffectEvent can't be called during rendering."
      );
    }
    function rt() {
      throw Error("startTransition cannot be called during server rendering.");
    }
    function Gc() {
      throw Error("Cannot update optimistic state while rendering.");
    }
    function Eo(n, r, u) {
      di();
      var d = oo++, b = Mr;
      if (typeof n.$$FORM_ACTION == "function") {
        var E = null, F = ao;
        b = b.formState;
        var D = n.$$IS_SIGNATURE_EQUAL;
        if (b !== null && typeof D == "function") {
          var te = b[1];
          D.call(n, b[2], b[3]) && (E = u !== void 0 ? "p" + u : "k" + Re(
            JSON.stringify([
              F,
              null,
              d
            ]),
            0
          ), te === E && (su = d, r = b[0]));
        }
        var H = n.bind(null, r);
        return n = function(ge) {
          H(ge);
        }, typeof H.$$FORM_ACTION == "function" && (n.$$FORM_ACTION = function(ge) {
          ge = H.$$FORM_ACTION(ge), u !== void 0 && (N(u, "target"), u += "", ge.action = u);
          var Ce = ge.data;
          return Ce && (E === null && (E = u !== void 0 ? "p" + u : "k" + Re(
            JSON.stringify([
              F,
              null,
              d
            ]),
            0
          )), Ce.append("$ACTION_KEY", E)), ge;
        }), [r, n, !1];
      }
      var j = n.bind(null, r);
      return [
        r,
        function(ge) {
          j(ge);
        },
        !1
      ];
    }
    function wl(n) {
      var r = fu;
      return fu += 1, Xo === null && (Xo = []), ic(Xo, n, r);
    }
    function _a() {
      throw Error("Cache cannot be refreshed during server rendering.");
    }
    function ts() {
    }
    function rs() {
      if (kl === 0) {
        Aa = console.log, qi = console.info, du = console.warn, gu = console.error, vu = console.group, so = console.groupCollapsed, gs = console.groupEnd;
        var n = {
          configurable: !0,
          enumerable: !0,
          value: ts,
          writable: !0
        };
        Object.defineProperties(console, {
          info: n,
          log: n,
          warn: n,
          error: n,
          group: n,
          groupCollapsed: n,
          groupEnd: n
        });
      }
      kl++;
    }
    function Ro() {
      if (kl--, kl === 0) {
        var n = { configurable: !0, enumerable: !0, writable: !0 };
        Object.defineProperties(console, {
          log: it({}, n, { value: Aa }),
          info: it({}, n, { value: qi }),
          warn: it({}, n, { value: du }),
          error: it({}, n, { value: gu }),
          group: it({}, n, { value: vu }),
          groupCollapsed: it({}, n, { value: so }),
          groupEnd: it({}, n, { value: gs })
        });
      }
      0 > kl && console.error(
        "disabledDepth fell below zero. This is a bug in React. Please file an issue."
      );
    }
    function Co(n) {
      var r = Error.prepareStackTrace;
      if (Error.prepareStackTrace = void 0, n = n.stack, Error.prepareStackTrace = r, n.startsWith(`Error: react-stack-top-frame
`) && (n = n.slice(29)), r = n.indexOf(`
`), r !== -1 && (n = n.slice(r + 1)), r = n.indexOf("react_stack_bottom_frame"), r !== -1 && (r = n.lastIndexOf(
        `
`,
        r
      )), r !== -1)
        n = n.slice(0, r);
      else return "";
      return n;
    }
    function gi(n) {
      if (Xu === void 0)
        try {
          throw Error();
        } catch (u) {
          var r = u.stack.trim().match(/\n( *(at )?)/);
          Xu = r && r[1] || "", Zo = -1 < u.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < u.stack.indexOf("@") ? "@unknown:0:0" : "";
        }
      return `
` + Xu + n + Zo;
    }
    function vi(n, r) {
      if (!n || vs) return "";
      var u = yu.get(n);
      if (u !== void 0) return u;
      vs = !0, u = Error.prepareStackTrace, Error.prepareStackTrace = void 0;
      var d = null;
      d = gt.H, gt.H = null, rs();
      try {
        var b = {
          DetermineComponentFrameRoot: function() {
            try {
              if (r) {
                var Ce = function() {
                  throw Error();
                };
                if (Object.defineProperty(Ce.prototype, "props", {
                  set: function() {
                    throw Error();
                  }
                }), typeof Reflect == "object" && Reflect.construct) {
                  try {
                    Reflect.construct(Ce, []);
                  } catch (ae) {
                    var ye = ae;
                  }
                  Reflect.construct(n, [], Ce);
                } else {
                  try {
                    Ce.call();
                  } catch (ae) {
                    ye = ae;
                  }
                  n.call(Ce.prototype);
                }
              } else {
                try {
                  throw Error();
                } catch (ae) {
                  ye = ae;
                }
                (Ce = n()) && typeof Ce.catch == "function" && Ce.catch(function() {
                });
              }
            } catch (ae) {
              if (ae && ye && typeof ae.stack == "string")
                return [ae.stack, ye.stack];
            }
            return [null, null];
          }
        };
        b.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
        var E = Object.getOwnPropertyDescriptor(
          b.DetermineComponentFrameRoot,
          "name"
        );
        E && E.configurable && Object.defineProperty(
          b.DetermineComponentFrameRoot,
          "name",
          { value: "DetermineComponentFrameRoot" }
        );
        var F = b.DetermineComponentFrameRoot(), D = F[0], te = F[1];
        if (D && te) {
          var H = D.split(`
`), j = te.split(`
`);
          for (F = E = 0; E < H.length && !H[E].includes(
            "DetermineComponentFrameRoot"
          ); )
            E++;
          for (; F < j.length && !j[F].includes(
            "DetermineComponentFrameRoot"
          ); )
            F++;
          if (E === H.length || F === j.length)
            for (E = H.length - 1, F = j.length - 1; 1 <= E && 0 <= F && H[E] !== j[F]; )
              F--;
          for (; 1 <= E && 0 <= F; E--, F--)
            if (H[E] !== j[F]) {
              if (E !== 1 || F !== 1)
                do
                  if (E--, F--, 0 > F || H[E] !== j[F]) {
                    var ge = `
` + H[E].replace(
                      " at new ",
                      " at "
                    );
                    return n.displayName && ge.includes("<anonymous>") && (ge = ge.replace("<anonymous>", n.displayName)), typeof n == "function" && yu.set(n, ge), ge;
                  }
                while (1 <= E && 0 <= F);
              break;
            }
        }
      } finally {
        vs = !1, gt.H = d, Ro(), Error.prepareStackTrace = u;
      }
      return H = (H = n ? n.displayName || n.name : "") ? gi(H) : "", typeof n == "function" && yu.set(n, H), H;
    }
    function Xc(n) {
      if (typeof n == "string") return gi(n);
      if (typeof n == "function")
        return n.prototype && n.prototype.isReactComponent ? vi(n, !0) : vi(n, !1);
      if (typeof n == "object" && n !== null) {
        switch (n.$$typeof) {
          case Tl:
            return vi(n.render, !1);
          case Gn:
            return vi(n.type, !1);
          case El:
            var r = n, u = r._payload;
            r = r._init;
            try {
              n = r(u);
            } catch {
              return gi("Lazy");
            }
            return Xc(n);
        }
        if (typeof n.name == "string") {
          e: {
            if (u = n.name, r = n.env, n = n.debugLocation, n != null) {
              n = Co(n);
              var d = n.lastIndexOf(`
`);
              if (n = d === -1 ? n : n.slice(d + 1), n.indexOf(u) !== -1) {
                u = `
` + n;
                break e;
              }
            }
            u = gi(
              u + (r ? " [" + r + "]" : "")
            );
          }
          return u;
        }
      }
      switch (n) {
        case xl:
          return gi("SuspenseList");
        case rl:
          return gi("Suspense");
      }
      return "";
    }
    function cc(n, r) {
      return (500 < r.byteSize || !1) && r.contentPreamble === null;
    }
    function uc(n) {
      if (typeof n == "object" && n !== null && typeof n.environmentName == "string") {
        var r = n.environmentName;
        n = [n].slice(0), typeof n[0] == "string" ? n.splice(
          0,
          1,
          "[%s] " + n[0],
          " " + r + " "
        ) : n.splice(0, 0, "[%s]", " " + r + " "), n.unshift(console), r = K.apply(console.error, n), r();
      } else console.error(n);
      return null;
    }
    function Zt(n, r, u, d, b, E, F, D, te, H, j) {
      var ge = /* @__PURE__ */ new Set();
      this.destination = null, this.flushScheduled = !1, this.resumableState = n, this.renderState = r, this.rootFormatContext = u, this.progressiveChunkSize = d === void 0 ? 12800 : d, this.status = 10, this.fatalError = null, this.pendingRootTasks = this.allPendingTasks = this.nextSegmentId = 0, this.completedPreambleSegments = this.completedRootSegment = null, this.byteSize = 0, this.abortableTasks = ge, this.pingedTasks = [], this.clientRenderedBoundaries = [], this.completedBoundaries = [], this.partialBoundaries = [], this.trackedPostpones = null, this.onError = b === void 0 ? uc : b, this.onPostpone = H === void 0 ? dn : H, this.onAllReady = E === void 0 ? dn : E, this.onShellReady = F === void 0 ? dn : F, this.onShellError = D === void 0 ? dn : D, this.onFatalError = te === void 0 ? dn : te, this.formState = j === void 0 ? null : j, this.didWarnForKey = null;
    }
    function mo(n, r, u, d, b, E, F, D, te, H, j, ge) {
      var Ce = ys();
      return 1e3 < Ce - Ds && (gt.recentlyCreatedOwnerStacks = 0, Ds = Ce), r = new Zt(
        r,
        u,
        d,
        b,
        E,
        F,
        D,
        te,
        H,
        j,
        ge
      ), u = Ur(
        r,
        0,
        null,
        d,
        !1,
        !1
      ), u.parentFlushed = !0, n = yi(
        r,
        null,
        n,
        -1,
        null,
        u,
        null,
        null,
        r.abortableTasks,
        null,
        d,
        null,
        lo,
        null,
        null,
        pe,
        null
      ), Wr(n), r.pingedTasks.push(n), r;
    }
    function sc(n, r) {
      n.pingedTasks.push(r), n.pingedTasks.length === 1 && (n.flushScheduled = n.destination !== null, Fu(n));
    }
    function Zc(n, r, u, d, b) {
      return u = {
        status: $i,
        rootSegmentID: -1,
        parentFlushed: !1,
        pendingTasks: 0,
        row: r,
        completedSegments: [],
        byteSize: 0,
        fallbackAbortableTasks: u,
        errorDigest: null,
        contentState: Zl(),
        fallbackState: Zl(),
        contentPreamble: d,
        fallbackPreamble: b,
        trackedContentKeyPath: null,
        trackedFallbackNode: null,
        errorMessage: null,
        errorStack: null,
        errorComponentStack: null
      }, r !== null && (r.pendingTasks++, d = r.boundaries, d !== null && (n.allPendingTasks++, u.pendingTasks++, d.push(u)), n = r.inheritedHoistables, n !== null && an(u.contentState, n)), u;
    }
    function yi(n, r, u, d, b, E, F, D, te, H, j, ge, Ce, ye, ae, fn, Jn) {
      n.allPendingTasks++, b === null ? n.pendingRootTasks++ : b.pendingTasks++, ye !== null && ye.pendingTasks++;
      var Ye = {
        replay: null,
        node: u,
        childIndex: d,
        ping: function() {
          return sc(n, Ye);
        },
        blockedBoundary: b,
        blockedSegment: E,
        blockedPreamble: F,
        hoistableState: D,
        abortSet: te,
        keyPath: H,
        formatContext: j,
        context: ge,
        treeContext: Ce,
        row: ye,
        componentStack: ae,
        thenableState: r
      };
      return Ye.debugTask = Jn, te.add(Ye), Ye;
    }
    function fc(n, r, u, d, b, E, F, D, te, H, j, ge, Ce, ye, ae, fn) {
      n.allPendingTasks++, E === null ? n.pendingRootTasks++ : E.pendingTasks++, Ce !== null && Ce.pendingTasks++, u.pendingTasks++;
      var Jn = {
        replay: u,
        node: d,
        childIndex: b,
        ping: function() {
          return sc(n, Jn);
        },
        blockedBoundary: E,
        blockedSegment: null,
        blockedPreamble: null,
        hoistableState: F,
        abortSet: D,
        keyPath: te,
        formatContext: H,
        context: j,
        treeContext: ge,
        row: Ce,
        componentStack: ye,
        thenableState: r
      };
      return Jn.debugTask = fn, D.add(Jn), Jn;
    }
    function Ur(n, r, u, d, b, E) {
      return {
        status: $i,
        parentFlushed: !1,
        id: -1,
        index: r,
        chunks: [],
        children: [],
        preambleChildren: [],
        parentFormatContext: d,
        boundary: u,
        lastPushedText: b,
        textEmbedded: E
      };
    }
    function Kl() {
      if (Ll === null || Ll.componentStack === null)
        return "";
      var n = Ll.componentStack;
      try {
        var r = "";
        if (typeof n.type == "string")
          r += gi(n.type);
        else if (typeof n.type == "function") {
          if (!n.owner) {
            var u = r, d = n.type, b = d ? d.displayName || d.name : "", E = b ? gi(b) : "";
            r = u + E;
          }
        } else
          n.owner || (r += Xc(n.type));
        for (; n; )
          u = null, n.debugStack != null ? u = Co(
            n.debugStack
          ) : (E = n, E.stack != null && (u = typeof E.stack != "string" ? E.stack = Co(
            E.stack
          ) : E.stack)), (n = n.owner) && u && (r += `
` + u);
        var F = r;
      } catch (D) {
        F = `
Error generating stack: ` + D.message + `
` + D.stack;
      }
      return F;
    }
    function Su(n, r) {
      if (r != null)
        for (var u = r.length - 1; 0 <= u; u--) {
          var d = r[u];
          if (typeof d.name == "string" || typeof d.time == "number") break;
          if (d.awaited != null) {
            var b = d.debugStack == null ? d.awaited : d;
            if (b.debugStack !== void 0) {
              n.componentStack = {
                parent: n.componentStack,
                type: d,
                owner: b.owner,
                stack: b.debugStack
              }, n.debugTask = b.debugTask;
              break;
            }
          }
        }
    }
    function hc(n, r) {
      if (r != null)
        for (var u = 0; u < r.length; u++) {
          var d = r[u];
          typeof d.name == "string" && d.debugStack !== void 0 && (n.componentStack = {
            parent: n.componentStack,
            type: d,
            owner: d.owner,
            stack: d.debugStack
          }, n.debugTask = d.debugTask);
        }
    }
    function Wr(n) {
      var r = n.node;
      if (typeof r == "object" && r !== null)
        switch (r.$$typeof) {
          case Ya:
            var u = r.type, d = r._owner, b = r._debugStack;
            hc(n, r._debugInfo), n.debugTask = r._debugTask, n.componentStack = {
              parent: n.componentStack,
              type: u,
              owner: d,
              stack: b
            };
            break;
          case El:
            hc(n, r._debugInfo);
            break;
          default:
            typeof r.then == "function" && hc(n, r._debugInfo);
        }
    }
    function dc(n) {
      return n === null ? null : {
        parent: n.parent,
        type: "Suspense Fallback",
        owner: n.owner,
        stack: n.stack
      };
    }
    function ca(n) {
      var r = {};
      return n && Object.defineProperty(r, "componentStack", {
        configurable: !0,
        enumerable: !0,
        get: function() {
          try {
            var u = "", d = n;
            do
              u += Xc(d.type), d = d.parent;
            while (d);
            var b = u;
          } catch (E) {
            b = `
Error generating stack: ` + E.message + `
` + E.stack;
          }
          return Object.defineProperty(r, "componentStack", {
            value: b
          }), b;
        }
      }), r;
    }
    function ko(n, r, u, d, b) {
      n.errorDigest = r, u instanceof Error ? (r = String(u.message), u = String(u.stack)) : (r = typeof u == "object" && u !== null ? Tn(u) : String(u), u = null), b = b ? `Switched to client rendering because the server rendering aborted due to:

` : `Switched to client rendering because the server rendering errored:

`, n.errorMessage = b + r, n.errorStack = u !== null ? b + u : null, n.errorComponentStack = d.componentStack;
    }
    function Yr(n, r, u, d) {
      if (n = n.onError, r = d ? d.run(n.bind(null, r, u)) : n(r, u), r != null && typeof r != "string")
        console.error(
          'onError returned something with a type other than "string". onError should return a string and may return null or undefined but must not return anything else. It received something of type "%s" instead',
          typeof r
        );
      else return r;
    }
    function Kt(n, r, u, d) {
      u = n.onShellError;
      var b = n.onFatalError;
      d ? (d.run(u.bind(null, r)), d.run(b.bind(null, r))) : (u(r), b(r)), n.destination !== null ? (n.status = ea, n.destination.destroy(r)) : (n.status = 13, n.fatalError = r);
    }
    function jn(n, r) {
      Au(n, r.next, r.hoistables);
    }
    function Au(n, r, u) {
      for (; r !== null; ) {
        u !== null && (an(r.hoistables, u), r.inheritedHoistables = u);
        var d = r.boundaries;
        if (d !== null) {
          r.boundaries = null;
          for (var b = 0; b < d.length; b++) {
            var E = d[b];
            u !== null && an(
              E.contentState,
              u
            ), $l(n, E, null, null);
          }
        }
        if (r.pendingTasks--, 0 < r.pendingTasks) break;
        u = r.hoistables, r = r.next;
      }
    }
    function Ni(n, r) {
      var u = r.boundaries;
      if (u !== null && r.pendingTasks === u.length) {
        for (var d = !0, b = 0; b < u.length; b++) {
          var E = u[b];
          if (E.pendingTasks !== 1 || E.parentFlushed || cc(n, E)) {
            d = !1;
            break;
          }
        }
        d && Au(n, r, r.hoistables);
      }
    }
    function jl(n) {
      var r = {
        pendingTasks: 1,
        boundaries: null,
        hoistables: Zl(),
        inheritedHoistables: null,
        together: !1,
        next: null
      };
      return n !== null && 0 < n.pendingTasks && (r.pendingTasks++, r.boundaries = [], n.next = r), r;
    }
    function Pu(n, r, u, d, b) {
      var E = r.keyPath, F = r.treeContext, D = r.row, te = r.componentStack, H = r.debugTask;
      hc(r, r.node.props.children._debugInfo), r.keyPath = u, u = d.length;
      var j = null;
      if (r.replay !== null) {
        var ge = r.replay.slots;
        if (ge !== null && typeof ge == "object")
          for (var Ce = 0; Ce < u; Ce++) {
            var ye = b !== "backwards" && b !== "unstable_legacy-backwards" ? Ce : u - 1 - Ce, ae = d[ye];
            r.row = j = jl(
              j
            ), r.treeContext = Cn(F, u, ye);
            var fn = ge[ye];
            typeof fn == "number" ? (Bi(n, r, fn, ae, ye), delete ge[ye]) : Dt(n, r, ae, ye), --j.pendingTasks === 0 && jn(n, j);
          }
        else
          for (ge = 0; ge < u; ge++)
            Ce = b !== "backwards" && b !== "unstable_legacy-backwards" ? ge : u - 1 - ge, ye = d[Ce], It(n, r, ye), r.row = j = jl(j), r.treeContext = Cn(F, u, Ce), Dt(n, r, ye, Ce), --j.pendingTasks === 0 && jn(n, j);
      } else if (b !== "backwards" && b !== "unstable_legacy-backwards")
        for (b = 0; b < u; b++)
          ge = d[b], It(n, r, ge), r.row = j = jl(j), r.treeContext = Cn(
            F,
            u,
            b
          ), Dt(n, r, ge, b), --j.pendingTasks === 0 && jn(n, j);
      else {
        for (b = r.blockedSegment, ge = b.children.length, Ce = b.chunks.length, ye = u - 1; 0 <= ye; ye--) {
          ae = d[ye], r.row = j = jl(
            j
          ), r.treeContext = Cn(F, u, ye), fn = Ur(
            n,
            Ce,
            null,
            r.formatContext,
            ye === 0 ? b.lastPushedText : !0,
            !0
          ), b.children.splice(ge, 0, fn), r.blockedSegment = fn, It(n, r, ae);
          try {
            Dt(n, r, ae, ye), nl(
              fn.chunks,
              n.renderState,
              fn.lastPushedText,
              fn.textEmbedded
            ), fn.status = Ir, --j.pendingTasks === 0 && jn(n, j);
          } catch (Jn) {
            throw fn.status = n.status === 12 ? Bl : Nn, Jn;
          }
        }
        r.blockedSegment = b, b.lastPushedText = !1;
      }
      D !== null && j !== null && 0 < j.pendingTasks && (D.pendingTasks++, j.next = D), r.treeContext = F, r.row = D, r.keyPath = E, r.componentStack = te, r.debugTask = H;
    }
    function Li(n, r, u, d, b, E) {
      var F = r.thenableState;
      for (r.thenableState = null, Jr = {}, Yo = r, Mr = n, ao = u, Ci = !1, oo = uu = 0, su = -1, fu = 0, Xo = F, n = Zu(d, b, E); ai; )
        ai = !1, oo = uu = 0, su = -1, fu = 0, hu += 1, ot = null, n = d(b, E);
      return sr(), n;
    }
    function bi(n, r, u, d, b, E, F) {
      var D = !1;
      if (E !== 0 && n.formState !== null) {
        var te = r.blockedSegment;
        if (te !== null) {
          D = !0, te = te.chunks;
          for (var H = 0; H < E; H++)
            H === F ? te.push("<!--F!-->") : te.push("<!--F-->");
        }
      }
      E = r.keyPath, r.keyPath = u, b ? (u = r.treeContext, r.treeContext = Cn(u, 1, 0), Dt(n, r, d, -1), r.treeContext = u) : D ? Dt(n, r, d, -1) : $e(n, r, d, -1), r.keyPath = E;
    }
    function So(n, r, u, d, b, E) {
      if (typeof d == "function")
        if (d.prototype && d.prototype.isReactComponent) {
          var F = b;
          if ("ref" in b) {
            F = {};
            for (var D in b)
              D !== "ref" && (F[D] = b[D]);
          }
          var te = d.defaultProps;
          if (te) {
            F === b && (F = it({}, F, b));
            for (var H in te)
              F[H] === void 0 && (F[H] = te[H]);
          }
          var j = F, ge = pe, Ce = d.contextType;
          if ("contextType" in d && Ce !== null && (Ce === void 0 || Ce.$$typeof !== pl) && !Qr.has(d)) {
            Qr.add(d);
            var ye = Ce === void 0 ? " However, it is set to undefined. This can be caused by a typo or by mixing up named and default imports. This can also happen due to a circular dependency, so try moving the createContext() call to a separate file." : typeof Ce != "object" ? " However, it is set to a " + typeof Ce + "." : Ce.$$typeof === Jc ? " Did you accidentally pass the Context.Consumer instead?" : " However, it is set to an object with keys {" + Object.keys(Ce).join(", ") + "}.";
            console.error(
              "%s defines an invalid contextType. contextType should point to the Context object returned by React.createContext().%s",
              dt(d) || "Component",
              ye
            );
          }
          typeof Ce == "object" && Ce !== null && (ge = Ce._currentValue2);
          var ae = new d(j, ge);
          if (typeof d.getDerivedStateFromProps == "function" && (ae.state === null || ae.state === void 0)) {
            var fn = dt(d) || "Component";
            $n.has(fn) || ($n.add(fn), console.error(
              "`%s` uses `getDerivedStateFromProps` but its initial state is %s. This is not recommended. Instead, define the initial state by assigning an object to `this.state` in the constructor of `%s`. This ensures that `getDerivedStateFromProps` arguments have a consistent shape.",
              fn,
              ae.state === null ? "null" : "undefined",
              fn
            ));
          }
          if (typeof d.getDerivedStateFromProps == "function" || typeof ae.getSnapshotBeforeUpdate == "function") {
            var Jn = null, Ye = null, Fn = null;
            if (typeof ae.componentWillMount == "function" && ae.componentWillMount.__suppressDeprecationWarning !== !0 ? Jn = "componentWillMount" : typeof ae.UNSAFE_componentWillMount == "function" && (Jn = "UNSAFE_componentWillMount"), typeof ae.componentWillReceiveProps == "function" && ae.componentWillReceiveProps.__suppressDeprecationWarning !== !0 ? Ye = "componentWillReceiveProps" : typeof ae.UNSAFE_componentWillReceiveProps == "function" && (Ye = "UNSAFE_componentWillReceiveProps"), typeof ae.componentWillUpdate == "function" && ae.componentWillUpdate.__suppressDeprecationWarning !== !0 ? Fn = "componentWillUpdate" : typeof ae.UNSAFE_componentWillUpdate == "function" && (Fn = "UNSAFE_componentWillUpdate"), Jn !== null || Ye !== null || Fn !== null) {
              var vr = dt(d) || "Component", yr = typeof d.getDerivedStateFromProps == "function" ? "getDerivedStateFromProps()" : "getSnapshotBeforeUpdate()";
              ll.has(vr) || (ll.add(
                vr
              ), console.error(
                `Unsafe legacy lifecycles will not be called for components using new component APIs.

%s uses %s but also contains the following legacy lifecycles:%s%s%s

The above lifecycles should be removed. Learn more about this warning here:
https://react.dev/link/unsafe-component-lifecycles`,
                vr,
                yr,
                Jn !== null ? `
  ` + Jn : "",
                Ye !== null ? `
  ` + Ye : "",
                Fn !== null ? `
  ` + Fn : ""
              ));
            }
          }
          var In = dt(d) || "Component";
          ae.render || (d.prototype && typeof d.prototype.render == "function" ? console.error(
            "No `render` method found on the %s instance: did you accidentally return an object from the constructor?",
            In
          ) : console.error(
            "No `render` method found on the %s instance: you may have forgotten to define `render`.",
            In
          )), !ae.getInitialState || ae.getInitialState.isReactClassApproved || ae.state || console.error(
            "getInitialState was defined on %s, a plain JavaScript class. This is only supported for classes created using React.createClass. Did you mean to define a state property instead?",
            In
          ), ae.getDefaultProps && !ae.getDefaultProps.isReactClassApproved && console.error(
            "getDefaultProps was defined on %s, a plain JavaScript class. This is only supported for classes created using React.createClass. Use a static property to define defaultProps instead.",
            In
          ), ae.contextType && console.error(
            "contextType was defined as an instance property on %s. Use a static property to define contextType instead.",
            In
          ), d.childContextTypes && !Mt.has(d) && (Mt.add(d), console.error(
            "%s uses the legacy childContextTypes API which was removed in React 19. Use React.createContext() instead. (https://react.dev/link/legacy-context)",
            In
          )), d.contextTypes && !Pr.has(d) && (Pr.add(d), console.error(
            "%s uses the legacy contextTypes API which was removed in React 19. Use React.createContext() with static contextType instead. (https://react.dev/link/legacy-context)",
            In
          )), typeof ae.componentShouldUpdate == "function" && console.error(
            "%s has a method called componentShouldUpdate(). Did you mean shouldComponentUpdate()? The name is phrased as a question because the function is expected to return a value.",
            In
          ), d.prototype && d.prototype.isPureReactComponent && typeof ae.shouldComponentUpdate < "u" && console.error(
            "%s has a method called shouldComponentUpdate(). shouldComponentUpdate should not be used when extending React.PureComponent. Please extend React.Component if shouldComponentUpdate is used.",
            dt(d) || "A pure component"
          ), typeof ae.componentDidUnmount == "function" && console.error(
            "%s has a method called componentDidUnmount(). But there is no such lifecycle method. Did you mean componentWillUnmount()?",
            In
          ), typeof ae.componentDidReceiveProps == "function" && console.error(
            "%s has a method called componentDidReceiveProps(). But there is no such lifecycle method. If you meant to update the state in response to changing props, use componentWillReceiveProps(). If you meant to fetch data or run side-effects or mutations after React has updated the UI, use componentDidUpdate().",
            In
          ), typeof ae.componentWillRecieveProps == "function" && console.error(
            "%s has a method called componentWillRecieveProps(). Did you mean componentWillReceiveProps()?",
            In
          ), typeof ae.UNSAFE_componentWillRecieveProps == "function" && console.error(
            "%s has a method called UNSAFE_componentWillRecieveProps(). Did you mean UNSAFE_componentWillReceiveProps()?",
            In
          );
          var $t = ae.props !== j;
          ae.props !== void 0 && $t && console.error(
            "When calling super() in `%s`, make sure to pass up the same props that your component's constructor was passed.",
            In
          ), ae.defaultProps && console.error(
            "Setting defaultProps as an instance property on %s is not supported and will be ignored. Instead, define defaultProps as a static property on %s.",
            In,
            In
          ), typeof ae.getSnapshotBeforeUpdate != "function" || typeof ae.componentDidUpdate == "function" || gr.has(d) || (gr.add(d), console.error(
            "%s: getSnapshotBeforeUpdate() should be used with componentDidUpdate(). This component defines getSnapshotBeforeUpdate() only.",
            dt(d)
          )), typeof ae.getDerivedStateFromProps == "function" && console.error(
            "%s: getDerivedStateFromProps() is defined as an instance method and will be ignored. Instead, declare it as a static method.",
            In
          ), typeof ae.getDerivedStateFromError == "function" && console.error(
            "%s: getDerivedStateFromError() is defined as an instance method and will be ignored. Instead, declare it as a static method.",
            In
          ), typeof d.getSnapshotBeforeUpdate == "function" && console.error(
            "%s: getSnapshotBeforeUpdate() is defined as a static method and will be ignored. Instead, declare it as an instance method.",
            In
          );
          var ki = ae.state;
          ki && (typeof ki != "object" || Yi(ki)) && console.error("%s.state: must be set to an object or null", In), typeof ae.getChildContext == "function" && typeof d.childContextTypes != "object" && console.error(
            "%s.getChildContext(): childContextTypes must be defined in order to use getChildContext().",
            In
          );
          var Vr = ae.state !== void 0 ? ae.state : null;
          ae.updater = wt, ae.props = j, ae.state = Vr;
          var Me = { queue: [], replace: !1 };
          ae._reactInternals = Me;
          var Hn = d.contextType;
          if (ae.context = typeof Hn == "object" && Hn !== null ? Hn._currentValue2 : pe, ae.state === j) {
            var Un = dt(d) || "Component";
            Dl.has(
              Un
            ) || (Dl.add(
              Un
            ), console.error(
              "%s: It is not recommended to assign props directly to state because updates to props won't be reflected in state. In most cases, it is better to use props directly.",
              Un
            ));
          }
          var Xn = d.getDerivedStateFromProps;
          if (typeof Xn == "function") {
            var pt = Xn(
              j,
              Vr
            );
            if (pt === void 0) {
              var pn = dt(d) || "Component";
              Je.has(pn) || (Je.add(pn), console.error(
                "%s.getDerivedStateFromProps(): A valid state object (or null) must be returned. You have returned undefined.",
                pn
              ));
            }
            var tn = pt == null ? Vr : it({}, Vr, pt);
            ae.state = tn;
          }
          if (typeof d.getDerivedStateFromProps != "function" && typeof ae.getSnapshotBeforeUpdate != "function" && (typeof ae.UNSAFE_componentWillMount == "function" || typeof ae.componentWillMount == "function")) {
            var Dr = ae.state;
            if (typeof ae.componentWillMount == "function") {
              if (ae.componentWillMount.__suppressDeprecationWarning !== !0) {
                var Wn = dt(d) || "Unknown";
                bt[Wn] || (console.warn(
                  `componentWillMount has been renamed, and is not recommended for use. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move code from componentWillMount to componentDidMount (preferred in most cases) or the constructor.

Please update the following components: %s`,
                  Wn
                ), bt[Wn] = !0);
              }
              ae.componentWillMount();
            }
            if (typeof ae.UNSAFE_componentWillMount == "function" && ae.UNSAFE_componentWillMount(), Dr !== ae.state && (console.error(
              "%s.componentWillMount(): Assigning directly to this.state is deprecated (except inside a component's constructor). Use setState instead.",
              dt(d) || "Component"
            ), wt.enqueueReplaceState(
              ae,
              ae.state,
              null
            )), Me.queue !== null && 0 < Me.queue.length) {
              var br = Me.queue, ct = Me.replace;
              if (Me.queue = null, Me.replace = !1, ct && br.length === 1)
                ae.state = br[0];
              else {
                for (var al = ct ? br[0] : ae.state, Vo = !0, ol = ct ? 1 : 0; ol < br.length; ol++) {
                  var Si = br[ol], Ai = typeof Si == "function" ? Si.call(
                    ae,
                    al,
                    j,
                    void 0
                  ) : Si;
                  Ai != null && (Vo ? (Vo = !1, al = it(
                    {},
                    al,
                    Ai
                  )) : it(al, Ai));
                }
                ae.state = al;
              }
            } else Me.queue = null;
          }
          var Pi = bu(ae);
          if (n.status === 12) throw null;
          ae.props !== j && (fo || console.error(
            "It looks like %s is reassigning its own `this.props` while rendering. This is not supported and can lead to confusing bugs.",
            dt(d) || "a component"
          ), fo = !0);
          var or = r.keyPath;
          r.keyPath = u, $e(n, r, Pi, -1), r.keyPath = or;
        } else {
          if (d.prototype && typeof d.prototype.render == "function") {
            var e = dt(d) || "Unknown";
            Mc[e] || (console.error(
              "The <%s /> component appears to have a render method, but doesn't extend React.Component. This is likely to cause errors. Change %s to extend React.Component instead.",
              e,
              e
            ), Mc[e] = !0);
          }
          var t = Li(
            n,
            r,
            u,
            d,
            b,
            void 0
          );
          if (n.status === 12) throw null;
          var c = uu !== 0, h = oo, y = su;
          if (d.contextTypes) {
            var x = dt(d) || "Unknown";
            wu[x] || (wu[x] = !0, console.error(
              "%s uses the legacy contextTypes API which was removed in React 19. Use React.createContext() with React.useContext() instead. (https://react.dev/link/legacy-context)",
              x
            ));
          }
          if (d && d.childContextTypes && console.error(
            `childContextTypes cannot be defined on a function component.
  %s.childContextTypes = ...`,
            d.displayName || d.name || "Component"
          ), typeof d.getDerivedStateFromProps == "function") {
            var S = dt(d) || "Unknown";
            Jo[S] || (console.error(
              "%s: Function components do not support getDerivedStateFromProps.",
              S
            ), Jo[S] = !0);
          }
          if (typeof d.contextType == "object" && d.contextType !== null) {
            var M = dt(d) || "Unknown";
            bs[M] || (console.error(
              "%s: Function components do not support contextType.",
              M
            ), bs[M] = !0);
          }
          bi(
            n,
            r,
            u,
            t,
            c,
            h,
            y
          );
        }
      else if (typeof d == "string") {
        var V = r.blockedSegment;
        if (V === null) {
          var B = b.children, U = r.formatContext, oe = r.keyPath;
          r.formatContext = si(U, d, b), r.keyPath = u, Dt(n, r, B, -1), r.formatContext = U, r.keyPath = oe;
        } else {
          var se = xn(
            V.chunks,
            d,
            b,
            n.resumableState,
            n.renderState,
            r.blockedPreamble,
            r.hoistableState,
            r.formatContext,
            V.lastPushedText
          );
          V.lastPushedText = !1;
          var ce = r.formatContext, le = r.keyPath;
          if (r.keyPath = u, (r.formatContext = si(
            ce,
            d,
            b
          )).insertionMode === je) {
            var Ue = Ur(
              n,
              0,
              null,
              r.formatContext,
              !1,
              !1
            );
            V.preambleChildren.push(Ue), r.blockedSegment = Ue;
            try {
              Ue.status = 6, Dt(n, r, se, -1), nl(
                Ue.chunks,
                n.renderState,
                Ue.lastPushedText,
                Ue.textEmbedded
              ), Ue.status = Ir;
            } finally {
              r.blockedSegment = V;
            }
          } else Dt(n, r, se, -1);
          r.formatContext = ce, r.keyPath = le;
          e: {
            var Zn = V.chunks, _e = n.resumableState;
            switch (d) {
              case "title":
              case "style":
              case "script":
              case "area":
              case "base":
              case "br":
              case "col":
              case "embed":
              case "hr":
              case "img":
              case "input":
              case "keygen":
              case "link":
              case "meta":
              case "param":
              case "source":
              case "track":
              case "wbr":
                break e;
              case "body":
                if (ce.insertionMode <= Ze) {
                  _e.hasBody = !0;
                  break e;
                }
                break;
              case "html":
                if (ce.insertionMode === on) {
                  _e.hasHtml = !0;
                  break e;
                }
                break;
              case "head":
                if (ce.insertionMode <= Ze) break e;
            }
            Zn.push(St(d));
          }
          V.lastPushedText = !1;
        }
      } else {
        switch (d) {
          case Vc:
          case vc:
          case yc:
          case Ti:
            var hn = r.keyPath;
            r.keyPath = u, $e(n, r, b.children, -1), r.keyPath = hn;
            return;
          case ni:
            var Pt = r.blockedSegment;
            if (Pt === null) {
              if (b.mode !== "hidden") {
                var zt = r.keyPath;
                r.keyPath = u, Dt(n, r, b.children, -1), r.keyPath = zt;
              }
            } else if (b.mode !== "hidden") {
              n.renderState.generateStaticMarkup || Pt.chunks.push("<!--&-->"), Pt.lastPushedText = !1;
              var On = r.keyPath;
              r.keyPath = u, Dt(n, r, b.children, -1), r.keyPath = On, n.renderState.generateStaticMarkup || Pt.chunks.push("<!--/&-->"), Pt.lastPushedText = !1;
            }
            return;
          case xl:
            e: {
              var Le = b.children, Ht = b.revealOrder;
              if (Ht === "forwards" || Ht === "backwards" || Ht === "unstable_legacy-backwards") {
                if (Yi(Le)) {
                  Pu(
                    n,
                    r,
                    u,
                    Le,
                    Ht
                  );
                  break e;
                }
                var Nr = W(Le);
                if (Nr) {
                  var Qn = Nr.call(Le);
                  if (Qn) {
                    Ao(
                      r,
                      Le,
                      -1,
                      Qn,
                      Nr
                    );
                    var ut = Qn.next();
                    if (!ut.done) {
                      var cl = [];
                      do
                        cl.push(ut.value), ut = Qn.next();
                      while (!ut.done);
                      Pu(
                        n,
                        r,
                        u,
                        Le,
                        Ht
                      );
                    }
                    break e;
                  }
                }
              }
              if (Ht === "together") {
                var wr = r.keyPath, er = r.row, st = r.row = jl(null);
                st.boundaries = [], st.together = !0, r.keyPath = u, $e(n, r, Le, -1), --st.pendingTasks === 0 && jn(n, st), r.keyPath = wr, r.row = er, er !== null && 0 < st.pendingTasks && (er.pendingTasks++, st.next = er);
              } else {
                var Vt = r.keyPath;
                r.keyPath = u, $e(n, r, Le, -1), r.keyPath = Vt;
              }
            }
            return;
          case jc:
          case lt:
            throw Error(
              "ReactDOMServer does not yet support scope components."
            );
          case rl:
            e: if (r.replay !== null) {
              var ul = r.keyPath, Sl = r.formatContext, nr = r.row;
              r.keyPath = u, r.formatContext = nt(
                n.resumableState,
                Sl
              ), r.row = null;
              var Tt = b.children;
              try {
                Dt(n, r, Tt, -1);
              } finally {
                r.keyPath = ul, r.formatContext = Sl, r.row = nr;
              }
            } else {
              var Lr = r.keyPath, sl = r.formatContext, Br = r.row, na = r.blockedBoundary, fl = r.blockedPreamble, Ut = r.hoistableState, _l = r.blockedSegment, cr = b.fallback, Qu = b.children, Fi = /* @__PURE__ */ new Set(), Ft = Zc(
                n,
                r.row,
                Fi,
                null,
                null
              );
              n.trackedPostpones !== null && (Ft.trackedContentKeyPath = u);
              var zl = Ur(
                n,
                _l.chunks.length,
                Ft,
                r.formatContext,
                !1,
                !1
              );
              _l.children.push(zl), _l.lastPushedText = !1;
              var _r = Ur(
                n,
                0,
                null,
                r.formatContext,
                !1,
                !1
              );
              if (_r.parentFlushed = !0, n.trackedPostpones !== null) {
                var Nc = r.componentStack, Ko = [
                  u[0],
                  "Suspense Fallback",
                  u[2]
                ], ci = [
                  Ko[1],
                  Ko[2],
                  [],
                  null
                ];
                n.trackedPostpones.workingMap.set(
                  Ko,
                  ci
                ), Ft.trackedFallbackNode = ci, r.blockedSegment = zl, r.blockedPreamble = Ft.fallbackPreamble, r.keyPath = Ko, r.formatContext = qr(
                  n.resumableState,
                  sl
                ), r.componentStack = dc(
                  Nc
                ), zl.status = 6;
                try {
                  Dt(n, r, cr, -1), nl(
                    zl.chunks,
                    n.renderState,
                    zl.lastPushedText,
                    zl.textEmbedded
                  ), zl.status = Ir;
                } catch (pu) {
                  throw zl.status = n.status === 12 ? Bl : Nn, pu;
                } finally {
                  r.blockedSegment = _l, r.blockedPreamble = fl, r.keyPath = Lr, r.formatContext = sl;
                }
                var jo = yi(
                  n,
                  null,
                  Qu,
                  -1,
                  Ft,
                  _r,
                  Ft.contentPreamble,
                  Ft.contentState,
                  r.abortSet,
                  u,
                  nt(
                    n.resumableState,
                    r.formatContext
                  ),
                  r.context,
                  r.treeContext,
                  null,
                  Nc,
                  pe,
                  r.debugTask
                );
                Wr(jo), n.pingedTasks.push(jo);
              } else {
                r.blockedBoundary = Ft, r.blockedPreamble = Ft.contentPreamble, r.hoistableState = Ft.contentState, r.blockedSegment = _r, r.keyPath = u, r.formatContext = nt(
                  n.resumableState,
                  sl
                ), r.row = null, _r.status = 6;
                try {
                  if (Dt(n, r, Qu, -1), nl(
                    _r.chunks,
                    n.renderState,
                    _r.lastPushedText,
                    _r.textEmbedded
                  ), _r.status = Ir, Wa(Ft, _r), Ft.pendingTasks === 0 && Ft.status === $i) {
                    if (Ft.status = Ir, !cc(n, Ft)) {
                      Br !== null && --Br.pendingTasks === 0 && jn(n, Br), n.pendingRootTasks === 0 && r.blockedPreamble && Po(n);
                      break e;
                    }
                  } else
                    Br !== null && Br.together && Ni(n, Br);
                } catch (pu) {
                  if (Ft.status = ar, n.status === 12) {
                    _r.status = Bl;
                    var hl = n.fatalError;
                  } else
                    _r.status = Nn, hl = pu;
                  var Lc = ca(r.componentStack), Ju = Yr(
                    n,
                    hl,
                    Lc,
                    r.debugTask
                  );
                  ko(
                    Ft,
                    Ju,
                    hl,
                    Lc,
                    !1
                  ), za(n, Ft);
                } finally {
                  r.blockedBoundary = na, r.blockedPreamble = fl, r.hoistableState = Ut, r.blockedSegment = _l, r.keyPath = Lr, r.formatContext = sl, r.row = Br;
                }
                var Hl = yi(
                  n,
                  null,
                  cr,
                  -1,
                  na,
                  zl,
                  Ft.fallbackPreamble,
                  Ft.fallbackState,
                  Fi,
                  [u[0], "Suspense Fallback", u[2]],
                  qr(
                    n.resumableState,
                    r.formatContext
                  ),
                  r.context,
                  r.treeContext,
                  r.row,
                  dc(
                    r.componentStack
                  ),
                  pe,
                  r.debugTask
                );
                Wr(Hl), n.pingedTasks.push(Hl);
              }
            }
            return;
        }
        if (typeof d == "object" && d !== null)
          switch (d.$$typeof) {
            case Tl:
              if ("ref" in b) {
                var Bc = {};
                for (var zr in b)
                  zr !== "ref" && (Bc[zr] = b[zr]);
              } else Bc = b;
              var qo = Li(
                n,
                r,
                u,
                d.render,
                Bc,
                E
              );
              bi(
                n,
                r,
                u,
                qo,
                uu !== 0,
                oo,
                su
              );
              return;
            case Gn:
              So(n, r, u, d.type, b, E);
              return;
            case pl:
              var go = b.value, Fa = b.children, Ul = r.context, Wl = r.keyPath, Oi = d._currentValue2;
              d._currentValue2 = go, d._currentRenderer2 !== void 0 && d._currentRenderer2 !== null && d._currentRenderer2 !== yn && console.error(
                "Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported."
              ), d._currentRenderer2 = yn;
              var dl = Qe, pr = {
                parent: dl,
                depth: dl === null ? 0 : dl.depth + 1,
                context: d,
                parentValue: Oi,
                value: go
              };
              Qe = pr, r.context = pr, r.keyPath = u, $e(n, r, Fa, -1);
              var Oa = Qe;
              if (Oa === null)
                throw Error(
                  "Tried to pop a Context at the root of the app. This is a bug in React."
                );
              Oa.context !== d && console.error(
                "The parent context is not the expected context. This is probably a bug in React."
              ), Oa.context._currentValue2 = Oa.parentValue, d._currentRenderer2 !== void 0 && d._currentRenderer2 !== null && d._currentRenderer2 !== yn && console.error(
                "Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported."
              ), d._currentRenderer2 = yn;
              var Mi = Qe = Oa.parent;
              r.context = Mi, r.keyPath = Wl, Ul !== r.context && console.error(
                "Popping the context provider did not return back to the original snapshot. This is a bug in React."
              );
              return;
            case Jc:
              var vo = d._context, ta = b.children;
              typeof ta != "function" && console.error(
                "A context consumer was rendered with multiple children, or a child that isn't a function. A context consumer expects a single child that is a function. If you did pass a function, make sure there is no trailing or leading whitespace around it."
              );
              var ws = ta(vo._currentValue2), Kr = r.keyPath;
              r.keyPath = u, $e(n, r, ws, -1), r.keyPath = Kr;
              return;
            case El:
              var ui = Is(d);
              if (n.status === 12) throw null;
              So(n, r, u, ui, b, E);
              return;
          }
        var _c = "";
        throw (d === void 0 || typeof d == "object" && d !== null && Object.keys(d).length === 0) && (_c += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports."), Error(
          "Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: " + ((d == null ? d : typeof d) + "." + _c)
        );
      }
    }
    function Bi(n, r, u, d, b) {
      var E = r.replay, F = r.blockedBoundary, D = Ur(
        n,
        0,
        null,
        r.formatContext,
        !1,
        !1
      );
      D.id = u, D.parentFlushed = !0;
      try {
        r.replay = null, r.blockedSegment = D, Dt(n, r, d, b), D.status = Ir, F === null ? n.completedRootSegment = D : (Wa(F, D), F.parentFlushed && n.partialBoundaries.push(F));
      } finally {
        r.replay = E, r.blockedSegment = null;
      }
    }
    function _i(n, r, u, d, b, E, F, D, te, H) {
      E = H.nodes;
      for (var j = 0; j < E.length; j++) {
        var ge = E[j];
        if (b === ge[1]) {
          if (ge.length === 4) {
            if (d !== null && d !== ge[0])
              throw Error(
                "Expected the resume to render <" + ge[0] + "> in this slot but instead it rendered <" + d + ">. The tree doesn't match so React will fallback to client rendering."
              );
            var Ce = ge[2];
            d = ge[3], b = r.node, r.replay = { nodes: Ce, slots: d, pendingTasks: 1 };
            try {
              if (So(n, r, u, F, D, te), r.replay.pendingTasks === 1 && 0 < r.replay.nodes.length)
                throw Error(
                  "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                );
              r.replay.pendingTasks--;
            } catch ($t) {
              if (typeof $t == "object" && $t !== null && ($t === Or || typeof $t.then == "function"))
                throw r.node === b ? r.replay = H : E.splice(j, 1), $t;
              r.replay.pendingTasks--, F = ca(r.componentStack), D = n, n = r.blockedBoundary, u = $t, te = d, d = Yr(D, u, F, r.debugTask), Ui(
                D,
                n,
                Ce,
                te,
                u,
                d,
                F,
                !1
              );
            }
            r.replay = H;
          } else {
            if (F !== rl)
              throw Error(
                "Expected the resume to render <Suspense> in this slot but instead it rendered <" + (dt(F) || "Unknown") + ">. The tree doesn't match so React will fallback to client rendering."
              );
            e: {
              H = void 0, d = ge[5], F = ge[2], te = ge[3], b = ge[4] === null ? [] : ge[4][2], ge = ge[4] === null ? null : ge[4][3];
              var ye = r.keyPath, ae = r.formatContext, fn = r.row, Jn = r.replay, Ye = r.blockedBoundary, Fn = r.hoistableState, vr = D.children, yr = D.fallback, In = /* @__PURE__ */ new Set();
              D = Zc(
                n,
                r.row,
                In,
                null,
                null
              ), D.parentFlushed = !0, D.rootSegmentID = d, r.blockedBoundary = D, r.hoistableState = D.contentState, r.keyPath = u, r.formatContext = nt(
                n.resumableState,
                ae
              ), r.row = null, r.replay = { nodes: F, slots: te, pendingTasks: 1 };
              try {
                if (Dt(n, r, vr, -1), r.replay.pendingTasks === 1 && 0 < r.replay.nodes.length)
                  throw Error(
                    "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                  );
                if (r.replay.pendingTasks--, D.pendingTasks === 0 && D.status === $i) {
                  D.status = Ir, n.completedBoundaries.push(D);
                  break e;
                }
              } catch ($t) {
                D.status = ar, Ce = ca(r.componentStack), H = Yr(
                  n,
                  $t,
                  Ce,
                  r.debugTask
                ), ko(D, H, $t, Ce, !1), r.replay.pendingTasks--, n.clientRenderedBoundaries.push(D);
              } finally {
                r.blockedBoundary = Ye, r.hoistableState = Fn, r.replay = Jn, r.keyPath = ye, r.formatContext = ae, r.row = fn;
              }
              D = fc(
                n,
                null,
                { nodes: b, slots: ge, pendingTasks: 0 },
                yr,
                -1,
                Ye,
                D.fallbackState,
                In,
                [u[0], "Suspense Fallback", u[2]],
                qr(
                  n.resumableState,
                  r.formatContext
                ),
                r.context,
                r.treeContext,
                r.row,
                dc(
                  r.componentStack
                ),
                pe,
                r.debugTask
              ), Wr(D), n.pingedTasks.push(D);
            }
          }
          E.splice(j, 1);
          break;
        }
      }
    }
    function Ao(n, r, u, d, b) {
      d === r ? (u !== -1 || n.componentStack === null || typeof n.componentStack.type != "function" || Object.prototype.toString.call(n.componentStack.type) !== "[object GeneratorFunction]" || Object.prototype.toString.call(d) !== "[object Generator]") && (Ic || console.error(
        "Using Iterators as children is unsupported and will likely yield unexpected results because enumerating a generator mutates it. You may convert it to an array with `Array.from()` or the `[...spread]` operator before rendering. You can also use an Iterable that can iterate multiple times over the same items."
      ), Ic = !0) : r.entries !== b || oi || (console.error(
        "Using Maps as children is not supported. Use an array of keyed ReactElements instead."
      ), oi = !0);
    }
    function $e(n, r, u, d) {
      r.replay !== null && typeof r.replay.slots == "number" ? Bi(n, r, r.replay.slots, u, d) : (r.node = u, r.childIndex = d, u = r.componentStack, d = r.debugTask, Wr(r), ql(n, r), r.componentStack = u, r.debugTask = d);
    }
    function ql(n, r) {
      var u = r.node, d = r.childIndex;
      if (u !== null) {
        if (typeof u == "object") {
          switch (u.$$typeof) {
            case Ya:
              var b = u.type, E = u.key;
              u = u.props;
              var F = u.ref;
              F = F !== void 0 ? F : null;
              var D = r.debugTask, te = dt(b);
              E = E ?? (d === -1 ? 0 : d);
              var H = [r.keyPath, te, E];
              r.replay !== null ? D ? D.run(
                _i.bind(
                  null,
                  n,
                  r,
                  H,
                  te,
                  E,
                  d,
                  b,
                  u,
                  F,
                  r.replay
                )
              ) : _i(
                n,
                r,
                H,
                te,
                E,
                d,
                b,
                u,
                F,
                r.replay
              ) : D ? D.run(
                So.bind(
                  null,
                  n,
                  r,
                  H,
                  b,
                  u,
                  F
                )
              ) : So(n, r, H, b, u, F);
              return;
            case Nt:
              throw Error(
                "Portals are not currently supported by the server renderer. Render them conditionally so that they only appear on the client render."
              );
            case El:
              if (b = Is(u), n.status === 12) throw null;
              $e(n, r, b, d);
              return;
          }
          if (Yi(u)) {
            wi(n, r, u, d);
            return;
          }
          if ((E = W(u)) && (b = E.call(u))) {
            if (Ao(r, u, d, b, E), u = b.next(), !u.done) {
              E = [];
              do
                E.push(u.value), u = b.next();
              while (!u.done);
              wi(n, r, E, d);
            }
            return;
          }
          if (typeof u.then == "function")
            return r.thenableState = null, $e(
              n,
              r,
              wl(u),
              d
            );
          if (u.$$typeof === pl)
            return $e(
              n,
              r,
              u._currentValue2,
              d
            );
          throw n = Object.prototype.toString.call(u), Error(
            "Objects are not valid as a React child (found: " + (n === "[object Object]" ? "object with keys {" + Object.keys(u).join(", ") + "}" : n) + "). If you meant to render a collection of children, use an array instead."
          );
        }
        typeof u == "string" ? (r = r.blockedSegment, r !== null && (r.lastPushedText = Jl(
          r.chunks,
          u,
          n.renderState,
          r.lastPushedText
        ))) : typeof u == "number" || typeof u == "bigint" ? (r = r.blockedSegment, r !== null && (r.lastPushedText = Jl(
          r.chunks,
          "" + u,
          n.renderState,
          r.lastPushedText
        ))) : (typeof u == "function" && (n = u.displayName || u.name || "Component", console.error(
          "Functions are not valid as a React child. This may happen if you return %s instead of <%s /> from render. Or maybe you meant to call this function rather than return it.",
          n,
          n
        )), typeof u == "symbol" && console.error(
          `Symbols are not valid as a React child.
  %s`,
          String(u)
        ));
      }
    }
    function It(n, r, u) {
      if (u !== null && typeof u == "object" && (u.$$typeof === Ya || u.$$typeof === Nt) && u._store && (!u._store.validated && u.key == null || u._store.validated === 2)) {
        if (typeof u._store != "object")
          throw Error(
            "React Component in warnForMissingKey should have a _store. This error is likely caused by a bug in React. Please file an issue."
          );
        u._store.validated = 1;
        var d = n.didWarnForKey;
        if (d == null && (d = n.didWarnForKey = /* @__PURE__ */ new WeakSet()), n = r.componentStack, n !== null && !d.has(n)) {
          d.add(n);
          var b = dt(u.type);
          d = u._owner;
          var E = n.owner;
          if (n = "", E && typeof E.type < "u") {
            var F = dt(E.type);
            F && (n = `

Check the render method of \`` + F + "`.");
          }
          n || b && (n = `

Check the top-level render call using <` + b + ">."), b = "", d != null && E !== d && (E = null, typeof d.type < "u" ? E = dt(d.type) : typeof d.name == "string" && (E = d.name), E && (b = " It was passed a child from " + E + ".")), d = r.componentStack, r.componentStack = {
            parent: r.componentStack,
            type: u.type,
            owner: u._owner,
            stack: u._debugStack
          }, console.error(
            'Each child in a list should have a unique "key" prop.%s%s See https://react.dev/link/warning-keys for more information.',
            n,
            b
          ), r.componentStack = d;
        }
      }
    }
    function wi(n, r, u, d) {
      var b = r.keyPath, E = r.componentStack, F = r.debugTask;
      if (hc(r, r.node._debugInfo), d !== -1 && (r.keyPath = [r.keyPath, "Fragment", d], r.replay !== null)) {
        for (var D = r.replay, te = D.nodes, H = 0; H < te.length; H++) {
          var j = te[H];
          if (j[1] === d) {
            d = j[2], j = j[3], r.replay = { nodes: d, slots: j, pendingTasks: 1 };
            try {
              if (wi(n, r, u, -1), r.replay.pendingTasks === 1 && 0 < r.replay.nodes.length)
                throw Error(
                  "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                );
              r.replay.pendingTasks--;
            } catch (ae) {
              if (typeof ae == "object" && ae !== null && (ae === Or || typeof ae.then == "function"))
                throw ae;
              r.replay.pendingTasks--;
              var ge = ca(r.componentStack);
              u = r.blockedBoundary;
              var Ce = ae, ye = j;
              j = Yr(
                n,
                Ce,
                ge,
                r.debugTask
              ), Ui(
                n,
                u,
                d,
                ye,
                Ce,
                j,
                ge,
                !1
              );
            }
            r.replay = D, te.splice(H, 1);
            break;
          }
        }
        r.keyPath = b, r.componentStack = E, r.debugTask = F;
        return;
      }
      if (D = r.treeContext, te = u.length, r.replay !== null && (H = r.replay.slots, H !== null && typeof H == "object")) {
        for (d = 0; d < te; d++)
          j = u[d], r.treeContext = Cn(
            D,
            te,
            d
          ), Ce = H[d], typeof Ce == "number" ? (Bi(n, r, Ce, j, d), delete H[d]) : Dt(n, r, j, d);
        r.treeContext = D, r.keyPath = b, r.componentStack = E, r.debugTask = F;
        return;
      }
      for (H = 0; H < te; H++)
        d = u[H], It(n, r, d), r.treeContext = Cn(D, te, H), Dt(n, r, d, H);
      r.treeContext = D, r.keyPath = b, r.componentStack = E, r.debugTask = F;
    }
    function Qt(n, r, u) {
      if (u.status = il, u.rootSegmentID = n.nextSegmentId++, n = u.trackedContentKeyPath, n === null)
        throw Error(
          "It should not be possible to postpone at the root. This is a bug in React."
        );
      var d = u.trackedFallbackNode, b = [], E = r.workingMap.get(n);
      return E === void 0 ? (u = [
        n[1],
        n[2],
        b,
        null,
        d,
        u.rootSegmentID
      ], r.workingMap.set(n, u), ei(u, n[0], r), u) : (E[4] = d, E[5] = u.rootSegmentID, E);
    }
    function ua(n, r, u, d) {
      d.status = il;
      var b = u.keyPath, E = u.blockedBoundary;
      if (E === null)
        d.id = n.nextSegmentId++, r.rootSlots = d.id, n.completedRootSegment !== null && (n.completedRootSegment.status = il);
      else {
        if (E !== null && E.status === $i) {
          var F = Qt(
            n,
            r,
            E
          );
          if (E.trackedContentKeyPath === b && u.childIndex === -1) {
            d.id === -1 && (d.id = d.parentFlushed ? E.rootSegmentID : n.nextSegmentId++), F[3] = d.id;
            return;
          }
        }
        if (d.id === -1 && (d.id = d.parentFlushed && E !== null ? E.rootSegmentID : n.nextSegmentId++), u.childIndex === -1)
          b === null ? r.rootSlots = d.id : (u = r.workingMap.get(b), u === void 0 ? (u = [b[1], b[2], [], d.id], ei(u, b[0], r)) : u[3] = d.id);
        else {
          if (b === null) {
            if (n = r.rootSlots, n === null)
              n = r.rootSlots = {};
            else if (typeof n == "number")
              throw Error(
                "It should not be possible to postpone both at the root of an element as well as a slot below. This is a bug in React."
              );
          } else if (E = r.workingMap, F = E.get(b), F === void 0)
            n = {}, F = [b[1], b[2], [], n], E.set(b, F), ei(F, b[0], r);
          else if (n = F[3], n === null)
            n = F[3] = {};
          else if (typeof n == "number")
            throw Error(
              "It should not be possible to postpone both at the root of an element as well as a slot below. This is a bug in React."
            );
          n[u.childIndex] = d.id;
        }
      }
    }
    function za(n, r) {
      n = n.trackedPostpones, n !== null && (r = r.trackedContentKeyPath, r !== null && (r = n.workingMap.get(r), r !== void 0 && (r.length = 4, r[2] = [], r[3] = null)));
    }
    function pi(n, r, u) {
      return fc(
        n,
        u,
        r.replay,
        r.node,
        r.childIndex,
        r.blockedBoundary,
        r.hoistableState,
        r.abortSet,
        r.keyPath,
        r.formatContext,
        r.context,
        r.treeContext,
        r.row,
        r.componentStack,
        pe,
        r.debugTask
      );
    }
    function zi(n, r, u) {
      var d = r.blockedSegment, b = Ur(
        n,
        d.chunks.length,
        null,
        r.formatContext,
        d.lastPushedText,
        !0
      );
      return d.children.push(b), d.lastPushedText = !1, yi(
        n,
        u,
        r.node,
        r.childIndex,
        r.blockedBoundary,
        b,
        r.blockedPreamble,
        r.hoistableState,
        r.abortSet,
        r.keyPath,
        r.formatContext,
        r.context,
        r.treeContext,
        r.row,
        r.componentStack,
        pe,
        r.debugTask
      );
    }
    function Dt(n, r, u, d) {
      var b = r.formatContext, E = r.context, F = r.keyPath, D = r.treeContext, te = r.componentStack, H = r.debugTask, j = r.blockedSegment;
      if (j === null) {
        j = r.replay;
        try {
          return $e(n, r, u, d);
        } catch (ye) {
          if (sr(), u = ye === Or ? ac() : ye, n.status !== 12 && typeof u == "object" && u !== null) {
            if (typeof u.then == "function") {
              d = ye === Or ? Vl() : null, n = pi(
                n,
                r,
                d
              ).ping, u.then(n, n), r.formatContext = b, r.context = E, r.keyPath = F, r.treeContext = D, r.componentStack = te, r.replay = j, r.debugTask = H, Yn(E);
              return;
            }
            if (u.message === "Maximum call stack size exceeded") {
              u = ye === Or ? Vl() : null, u = pi(n, r, u), n.pingedTasks.push(u), r.formatContext = b, r.context = E, r.keyPath = F, r.treeContext = D, r.componentStack = te, r.replay = j, r.debugTask = H, Yn(E);
              return;
            }
          }
        }
      } else {
        var ge = j.children.length, Ce = j.chunks.length;
        try {
          return $e(n, r, u, d);
        } catch (ye) {
          if (sr(), j.children.length = ge, j.chunks.length = Ce, u = ye === Or ? ac() : ye, n.status !== 12 && typeof u == "object" && u !== null) {
            if (typeof u.then == "function") {
              j = u, u = ye === Or ? Vl() : null, n = zi(n, r, u).ping, j.then(n, n), r.formatContext = b, r.context = E, r.keyPath = F, r.treeContext = D, r.componentStack = te, r.debugTask = H, Yn(E);
              return;
            }
            if (u.message === "Maximum call stack size exceeded") {
              j = ye === Or ? Vl() : null, j = zi(n, r, j), n.pingedTasks.push(j), r.formatContext = b, r.context = E, r.keyPath = F, r.treeContext = D, r.componentStack = te, r.debugTask = H, Yn(E);
              return;
            }
          }
        }
      }
      throw r.formatContext = b, r.context = E, r.keyPath = F, r.treeContext = D, Yn(E), u;
    }
    function Hi(n) {
      var r = n.blockedBoundary, u = n.blockedSegment;
      u !== null && (u.status = Bl, $l(this, r, n.row, u));
    }
    function Ui(n, r, u, d, b, E, F, D) {
      for (var te = 0; te < u.length; te++) {
        var H = u[te];
        if (H.length === 4)
          Ui(
            n,
            r,
            H[2],
            H[3],
            b,
            E,
            F,
            D
          );
        else {
          var j = n;
          H = H[5];
          var ge = b, Ce = E, ye = F, ae = D, fn = Zc(
            j,
            null,
            /* @__PURE__ */ new Set(),
            null,
            null
          );
          fn.parentFlushed = !0, fn.rootSegmentID = H, fn.status = ar, ko(
            fn,
            Ce,
            ge,
            ye,
            ae
          ), fn.parentFlushed && j.clientRenderedBoundaries.push(fn);
        }
      }
      if (u.length = 0, d !== null) {
        if (r === null)
          throw Error(
            "We should not have any resumable nodes in the shell. This is a bug in React."
          );
        if (r.status !== ar && (r.status = ar, ko(
          r,
          E,
          b,
          F,
          D
        ), r.parentFlushed && n.clientRenderedBoundaries.push(r)), typeof d == "object")
          for (var Jn in d) delete d[Jn];
      }
    }
    function Ha(n, r, u) {
      var d = n.blockedBoundary, b = n.blockedSegment;
      if (b !== null) {
        if (b.status === 6) return;
        b.status = Bl;
      }
      var E = ca(n.componentStack), F = n.node;
      if (F !== null && typeof F == "object" && Su(n, F._debugInfo), d === null) {
        if (r.status !== 13 && r.status !== ea) {
          if (d = n.replay, d === null) {
            r.trackedPostpones !== null && b !== null ? (d = r.trackedPostpones, Yr(r, u, E, n.debugTask), ua(r, d, n, b), $l(r, null, n.row, b)) : (Yr(r, u, E, n.debugTask), Kt(r, u, E, n.debugTask));
            return;
          }
          d.pendingTasks--, d.pendingTasks === 0 && 0 < d.nodes.length && (b = Yr(r, u, E, null), Ui(
            r,
            null,
            d.nodes,
            d.slots,
            u,
            b,
            E,
            !0
          )), r.pendingRootTasks--, r.pendingRootTasks === 0 && Ua(r);
        }
      } else {
        if (F = r.trackedPostpones, d.status !== ar) {
          if (F !== null && b !== null)
            return Yr(r, u, E, n.debugTask), ua(r, F, n, b), d.fallbackAbortableTasks.forEach(function(D) {
              return Ha(D, r, u);
            }), d.fallbackAbortableTasks.clear(), $l(r, d, n.row, b);
          d.status = ar, b = Yr(
            r,
            u,
            E,
            n.debugTask
          ), d.status = ar, ko(d, b, u, E, !0), za(r, d), d.parentFlushed && r.clientRenderedBoundaries.push(d);
        }
        d.pendingTasks--, E = d.row, E !== null && --E.pendingTasks === 0 && jn(r, E), d.fallbackAbortableTasks.forEach(function(D) {
          return Ha(D, r, u);
        }), d.fallbackAbortableTasks.clear();
      }
      n = n.row, n !== null && --n.pendingTasks === 0 && jn(r, n), r.allPendingTasks--, r.allPendingTasks === 0 && Gr(r);
    }
    function sa(n, r) {
      try {
        var u = n.renderState, d = u.onHeaders;
        if (d) {
          var b = u.headers;
          if (b) {
            u.headers = null;
            var E = b.preconnects;
            if (b.fontPreloads && (E && (E += ", "), E += b.fontPreloads), b.highImagePreloads && (E && (E += ", "), E += b.highImagePreloads), !r) {
              var F = u.styles.values(), D = F.next();
              e: for (; 0 < b.remainingCapacity && !D.done; D = F.next())
                for (var te = D.value.sheets.values(), H = te.next(); 0 < b.remainingCapacity && !H.done; H = te.next()) {
                  var j = H.value, ge = j.props, Ce = ge.href, ye = j.props, ae = R(
                    ye.href,
                    "style",
                    {
                      crossOrigin: ye.crossOrigin,
                      integrity: ye.integrity,
                      nonce: ye.nonce,
                      type: ye.type,
                      fetchPriority: ye.fetchPriority,
                      referrerPolicy: ye.referrerPolicy,
                      media: ye.media
                    }
                  );
                  if (0 <= (b.remainingCapacity -= ae.length + 2))
                    u.resets.style[Ce] = G, E && (E += ", "), E += ae, u.resets.style[Ce] = typeof ge.crossOrigin == "string" || typeof ge.integrity == "string" ? [ge.crossOrigin, ge.integrity] : G;
                  else break e;
                }
            }
            d(E ? { Link: E } : {});
          }
        }
      } catch (fn) {
        Yr(n, fn, {}, null);
      }
    }
    function Ua(n) {
      n.trackedPostpones === null && sa(n, !0), n.trackedPostpones === null && Po(n), n.onShellError = dn, n = n.onShellReady, n();
    }
    function Gr(n) {
      sa(
        n,
        n.trackedPostpones === null ? !0 : n.completedRootSegment === null || n.completedRootSegment.status !== il
      ), Po(n), n = n.onAllReady, n();
    }
    function Wa(n, r) {
      if (r.chunks.length === 0 && r.children.length === 1 && r.children[0].boundary === null && r.children[0].id === -1) {
        var u = r.children[0];
        u.id = r.id, u.parentFlushed = !0, u.status !== Ir && u.status !== Bl && u.status !== Nn || Wa(n, u);
      } else n.completedSegments.push(r);
    }
    function $l(n, r, u, d) {
      if (u !== null && (--u.pendingTasks === 0 ? jn(n, u) : u.together && Ni(n, u)), n.allPendingTasks--, r === null) {
        if (d !== null && d.parentFlushed) {
          if (n.completedRootSegment !== null)
            throw Error(
              "There can only be one root segment. This is a bug in React."
            );
          n.completedRootSegment = d;
        }
        n.pendingRootTasks--, n.pendingRootTasks === 0 && Ua(n);
      } else if (r.pendingTasks--, r.status !== ar)
        if (r.pendingTasks === 0) {
          if (r.status === $i && (r.status = Ir), d !== null && d.parentFlushed && (d.status === Ir || d.status === Bl) && Wa(r, d), r.parentFlushed && n.completedBoundaries.push(r), r.status === Ir)
            u = r.row, u !== null && an(u.hoistables, r.contentState), cc(n, r) || (r.fallbackAbortableTasks.forEach(
              Hi,
              n
            ), r.fallbackAbortableTasks.clear(), u !== null && --u.pendingTasks === 0 && jn(n, u)), n.pendingRootTasks === 0 && n.trackedPostpones === null && r.contentPreamble !== null && Po(n);
          else if (r.status === il && (r = r.row, r !== null)) {
            if (n.trackedPostpones !== null) {
              u = n.trackedPostpones;
              var b = r.next;
              if (b !== null && (d = b.boundaries, d !== null))
                for (b.boundaries = null, b = 0; b < d.length; b++) {
                  var E = d[b];
                  Qt(n, u, E), $l(n, E, null, null);
                }
            }
            --r.pendingTasks === 0 && jn(n, r);
          }
        } else
          d === null || !d.parentFlushed || d.status !== Ir && d.status !== Bl || (Wa(r, d), r.completedSegments.length === 1 && r.parentFlushed && n.partialBoundaries.push(r)), r = r.row, r !== null && r.together && Ni(n, r);
      n.allPendingTasks === 0 && Gr(n);
    }
    function Fu(n) {
      if (n.status !== ea && n.status !== 13) {
        var r = Qe, u = gt.H;
        gt.H = uo;
        var d = gt.A;
        gt.A = ds;
        var b = _t;
        _t = n;
        var E = gt.getCurrentStack;
        gt.getCurrentStack = Kl;
        var F = hs;
        hs = n.resumableState;
        try {
          var D = n.pingedTasks, te;
          for (te = 0; te < D.length; te++) {
            var H = n, j = D[te], ge = j.blockedSegment;
            if (ge === null) {
              var Ce = void 0, ye = H;
              if (H = j, H.replay.pendingTasks !== 0) {
                Yn(H.context), Ce = Ll, Ll = H;
                try {
                  if (typeof H.replay.slots == "number" ? Bi(
                    ye,
                    H,
                    H.replay.slots,
                    H.node,
                    H.childIndex
                  ) : ql(ye, H), H.replay.pendingTasks === 1 && 0 < H.replay.nodes.length)
                    throw Error(
                      "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                    );
                  H.replay.pendingTasks--, H.abortSet.delete(H), $l(
                    ye,
                    H.blockedBoundary,
                    H.row,
                    null
                  );
                } catch (ct) {
                  sr();
                  var ae = ct === Or ? ac() : ct;
                  if (typeof ae == "object" && ae !== null && typeof ae.then == "function") {
                    var fn = H.ping;
                    ae.then(fn, fn), H.thenableState = ct === Or ? Vl() : null;
                  } else {
                    H.replay.pendingTasks--, H.abortSet.delete(H);
                    var Jn = ca(H.componentStack), Ye = void 0, Fn = ye, vr = H.blockedBoundary, yr = ye.status === 12 ? ye.fatalError : ae, In = Jn, $t = H.replay.nodes, ki = H.replay.slots;
                    Ye = Yr(
                      Fn,
                      yr,
                      In,
                      H.debugTask
                    ), Ui(
                      Fn,
                      vr,
                      $t,
                      ki,
                      yr,
                      Ye,
                      In,
                      !1
                    ), ye.pendingRootTasks--, ye.pendingRootTasks === 0 && Ua(ye), ye.allPendingTasks--, ye.allPendingTasks === 0 && Gr(ye);
                  }
                } finally {
                  Ll = Ce;
                }
              }
            } else if (ye = Ce = void 0, Ye = j, Fn = ge, Fn.status === $i) {
              Fn.status = 6, Yn(Ye.context), ye = Ll, Ll = Ye;
              var Vr = Fn.children.length, Me = Fn.chunks.length;
              try {
                ql(H, Ye), nl(
                  Fn.chunks,
                  H.renderState,
                  Fn.lastPushedText,
                  Fn.textEmbedded
                ), Ye.abortSet.delete(Ye), Fn.status = Ir, $l(
                  H,
                  Ye.blockedBoundary,
                  Ye.row,
                  Fn
                );
              } catch (ct) {
                sr(), Fn.children.length = Vr, Fn.chunks.length = Me;
                var Hn = ct === Or ? ac() : H.status === 12 ? H.fatalError : ct;
                if (H.status === 12 && H.trackedPostpones !== null) {
                  var Un = H.trackedPostpones, Xn = ca(Ye.componentStack);
                  Ye.abortSet.delete(Ye), Yr(
                    H,
                    Hn,
                    Xn,
                    Ye.debugTask
                  ), ua(
                    H,
                    Un,
                    Ye,
                    Fn
                  ), $l(
                    H,
                    Ye.blockedBoundary,
                    Ye.row,
                    Fn
                  );
                } else if (typeof Hn == "object" && Hn !== null && typeof Hn.then == "function") {
                  Fn.status = $i, Ye.thenableState = ct === Or ? Vl() : null;
                  var pt = Ye.ping;
                  Hn.then(pt, pt);
                } else {
                  var pn = ca(
                    Ye.componentStack
                  );
                  Ye.abortSet.delete(Ye), Fn.status = Nn;
                  var tn = Ye.blockedBoundary, Dr = Ye.row, Wn = Ye.debugTask;
                  if (Dr !== null && --Dr.pendingTasks === 0 && jn(H, Dr), H.allPendingTasks--, Ce = Yr(
                    H,
                    Hn,
                    pn,
                    Wn
                  ), tn === null)
                    Kt(
                      H,
                      Hn,
                      pn,
                      Wn
                    );
                  else if (tn.pendingTasks--, tn.status !== ar) {
                    tn.status = ar, ko(
                      tn,
                      Ce,
                      Hn,
                      pn,
                      !1
                    ), za(H, tn);
                    var br = tn.row;
                    br !== null && --br.pendingTasks === 0 && jn(H, br), tn.parentFlushed && H.clientRenderedBoundaries.push(tn), H.pendingRootTasks === 0 && H.trackedPostpones === null && tn.contentPreamble !== null && Po(H);
                  }
                  H.allPendingTasks === 0 && Gr(H);
                }
              } finally {
                Ll = ye;
              }
            }
          }
          D.splice(0, te), n.destination !== null && gc(
            n,
            n.destination
          );
        } catch (ct) {
          D = {}, Yr(n, ct, D, null), Kt(n, ct, D, null);
        } finally {
          hs = F, gt.H = u, gt.A = d, gt.getCurrentStack = E, u === uo && Yn(r), _t = b;
        }
      }
    }
    function Ou(n, r, u) {
      r.preambleChildren.length && u.push(r.preambleChildren);
      for (var d = !1, b = 0; b < r.children.length; b++)
        d = Mu(
          n,
          r.children[b],
          u
        ) || d;
      return d;
    }
    function Mu(n, r, u) {
      var d = r.boundary;
      if (d === null)
        return Ou(
          n,
          r,
          u
        );
      var b = d.contentPreamble, E = d.fallbackPreamble;
      if (b === null || E === null) return !1;
      switch (d.status) {
        case Ir:
          if (Gt(n.renderState, b), n.byteSize += d.byteSize, r = d.completedSegments[0], !r)
            throw Error(
              "A previously unvisited boundary must have exactly one root segment. This is a bug in React."
            );
          return Ou(
            n,
            r,
            u
          );
        case il:
          if (n.trackedPostpones !== null) return !0;
        case ar:
          if (r.status === Ir)
            return Gt(n.renderState, E), Ou(
              n,
              r,
              u
            );
        default:
          return !0;
      }
    }
    function Po(n) {
      if (n.completedRootSegment && n.completedPreambleSegments === null) {
        var r = [], u = n.byteSize, d = Mu(
          n,
          n.completedRootSegment,
          r
        ), b = n.renderState.preamble;
        d === !1 || b.headChunks && b.bodyChunks ? n.completedPreambleSegments = r : n.byteSize = u;
      }
    }
    function Fo(n, r, u, d) {
      switch (u.parentFlushed = !0, u.status) {
        case $i:
          u.id = n.nextSegmentId++;
        case il:
          return d = u.id, u.lastPushedText = !1, u.textEmbedded = !1, n = n.renderState, r.push(Ji), r.push(n.placeholderPrefix), n = d.toString(16), r.push(n), r.push(Rc);
        case Ir:
          u.status = Pa;
          var b = !0, E = u.chunks, F = 0;
          u = u.children;
          for (var D = 0; D < u.length; D++) {
            for (b = u[D]; F < b.index; F++)
              r.push(E[F]);
            b = Oo(n, r, b, d);
          }
          for (; F < E.length - 1; F++)
            r.push(E[F]);
          return F < E.length && (b = r.push(E[F])), b;
        case Bl:
          return !0;
        default:
          throw Error(
            "Aborted, errored or already flushed boundaries should not be flushed again. This is a bug in React."
          );
      }
    }
    function Oo(n, r, u, d) {
      var b = u.boundary;
      if (b === null)
        return Fo(n, r, u, d);
      if (b.parentFlushed = !0, b.status === ar) {
        var E = b.row;
        if (E !== null && --E.pendingTasks === 0 && jn(n, E), !n.renderState.generateStaticMarkup) {
          var F = b.errorDigest, D = b.errorMessage;
          E = b.errorStack, b = b.errorComponentStack, r.push(Cc), r.push(Lo), F && (r.push(Ot), F = Ie(F), r.push(F), r.push(
            ja
          )), D && (r.push(Cl), D = Ie(D), r.push(D), r.push(
            ja
          )), E && (r.push(un), E = Ie(E), r.push(E), r.push(
            ja
          )), b && (r.push(Ki), E = Ie(b), r.push(E), r.push(
            ja
          )), r.push(Bo);
        }
        return Fo(n, r, u, d), n = n.renderState.generateStaticMarkup ? !0 : r.push(Ta), n;
      }
      if (b.status !== Ir)
        return b.status === $i && (b.rootSegmentID = n.nextSegmentId++), 0 < b.completedSegments.length && n.partialBoundaries.push(b), Xt(
          r,
          n.renderState,
          b.rootSegmentID
        ), d && an(d, b.fallbackState), Fo(n, r, u, d), r.push(Ta);
      if (!Dc && cc(n, b) && ho + b.byteSize > n.progressiveChunkSize)
        return b.rootSegmentID = n.nextSegmentId++, n.completedBoundaries.push(b), Xt(
          r,
          n.renderState,
          b.rootSegmentID
        ), Fo(n, r, u, d), r.push(Ta);
      if (ho += b.byteSize, d && an(d, b.contentState), u = b.row, u !== null && cc(n, b) && --u.pendingTasks === 0 && jn(n, u), n.renderState.generateStaticMarkup || r.push(Vi), u = b.completedSegments, u.length !== 1)
        throw Error(
          "A previously unvisited boundary must have exactly one root segment. This is a bug in React."
        );
      return Oo(n, r, u[0], d), n = n.renderState.generateStaticMarkup ? !0 : r.push(Ta), n;
    }
    function jt(n, r, u, d) {
      return De(
        r,
        n.renderState,
        u.parentFormatContext,
        u.id
      ), Oo(n, r, u, d), xr(r, u.parentFormatContext);
    }
    function ls(n, r, u) {
      ho = u.byteSize;
      for (var d = u.completedSegments, b = 0; b < d.length; b++)
        fa(
          n,
          r,
          u,
          d[b]
        );
      d.length = 0, d = u.row, d !== null && cc(n, u) && --d.pendingTasks === 0 && jn(n, d), rr(
        r,
        u.contentState,
        n.renderState
      ), d = n.resumableState, n = n.renderState, b = u.rootSegmentID, u = u.contentState;
      var E = n.stylesToHoist;
      return n.stylesToHoist = !1, r.push(n.startInlineScript), r.push(sn), E ? ((d.instructions & p) === o && (d.instructions |= p, r.push(Ra)), (d.instructions & g) === o && (d.instructions |= g, r.push(Bt)), (d.instructions & m) === o ? (d.instructions |= m, r.push(Ac)) : r.push(Pc)) : ((d.instructions & g) === o && (d.instructions |= g, r.push(Bt)), r.push(iu)), d = b.toString(16), r.push(n.boundaryPrefix), r.push(d), r.push(au), r.push(n.segmentPrefix), r.push(d), E ? (r.push(Wu), aa(r, u)) : r.push(ou), u = r.push(cu), Xl(r, n) && u;
    }
    function fa(n, r, u, d) {
      if (d.status === Pa) return !0;
      var b = u.contentState, E = d.id;
      if (E === -1) {
        if ((d.id = u.rootSegmentID) === -1)
          throw Error(
            "A root segment ID must have been assigned by now. This is a bug in React."
          );
        return jt(
          n,
          r,
          d,
          b
        );
      }
      return E === u.rootSegmentID ? jt(
        n,
        r,
        d,
        b
      ) : (jt(n, r, d, b), u = n.resumableState, n = n.renderState, r.push(n.startInlineScript), r.push(sn), (u.instructions & f) === o ? (u.instructions |= f, r.push(zu)) : r.push(lu), r.push(n.segmentPrefix), E = E.toString(16), r.push(E), r.push(Hu), r.push(n.placeholderPrefix), r.push(E), r = r.push(Uu), r);
    }
    function gc(n, r) {
      try {
        if (!(0 < n.pendingRootTasks)) {
          var u, d = n.completedRootSegment;
          if (d !== null) {
            if (d.status === il) return;
            var b = n.completedPreambleSegments;
            if (b === null) return;
            ho = n.byteSize;
            var E = n.resumableState, F = n.renderState, D = F.preamble, te = D.htmlChunks, H = D.headChunks, j;
            if (te) {
              for (j = 0; j < te.length; j++)
                r.push(te[j]);
              if (H)
                for (j = 0; j < H.length; j++)
                  r.push(H[j]);
              else {
                var ge = mt("head");
                r.push(ge), r.push(sn);
              }
            } else if (H)
              for (j = 0; j < H.length; j++)
                r.push(H[j]);
            var Ce = F.charsetChunks;
            for (j = 0; j < Ce.length; j++)
              r.push(Ce[j]);
            Ce.length = 0, F.preconnects.forEach(Bn, r), F.preconnects.clear();
            var ye = F.viewportChunks;
            for (j = 0; j < ye.length; j++)
              r.push(ye[j]);
            ye.length = 0, F.fontPreloads.forEach(Bn, r), F.fontPreloads.clear(), F.highImagePreloads.forEach(Bn, r), F.highImagePreloads.clear(), re = F, F.styles.forEach(ht, r), re = null;
            var ae = F.importMapChunks;
            for (j = 0; j < ae.length; j++)
              r.push(ae[j]);
            ae.length = 0, F.bootstrapScripts.forEach(Bn, r), F.scripts.forEach(Bn, r), F.scripts.clear(), F.bulkPreloads.forEach(Bn, r), F.bulkPreloads.clear(), E.instructions |= A;
            var fn = F.hoistableChunks;
            for (j = 0; j < fn.length; j++)
              r.push(fn[j]);
            for (E = fn.length = 0; E < b.length; E++) {
              var Jn = b[E];
              for (F = 0; F < Jn.length; F++)
                Oo(n, r, Jn[F], null);
            }
            var Ye = n.renderState.preamble, Fn = Ye.headChunks;
            if (Ye.htmlChunks || Fn) {
              var vr = St("head");
              r.push(vr);
            }
            var yr = Ye.bodyChunks;
            if (yr)
              for (b = 0; b < yr.length; b++)
                r.push(yr[b]);
            Oo(n, r, d, null), n.completedRootSegment = null;
            var In = n.renderState;
            if (n.allPendingTasks !== 0 || n.clientRenderedBoundaries.length !== 0 || n.completedBoundaries.length !== 0 || n.trackedPostpones !== null && (n.trackedPostpones.rootNodes.length !== 0 || n.trackedPostpones.rootSlots !== null)) {
              var $t = n.resumableState;
              if (($t.instructions & Q) === o) {
                if ($t.instructions |= Q, r.push(In.startInlineScript), ($t.instructions & A) === o) {
                  $t.instructions |= A;
                  var ki = "_" + $t.idPrefix + "R_";
                  r.push(Uo);
                  var Vr = Ie(ki);
                  r.push(Vr), r.push(qe);
                }
                r.push(sn), r.push(Rl), r.push($);
              }
            }
            Xl(r, In);
          }
          var Me = n.renderState;
          d = 0;
          var Hn = Me.viewportChunks;
          for (d = 0; d < Hn.length; d++)
            r.push(Hn[d]);
          Hn.length = 0, Me.preconnects.forEach(Bn, r), Me.preconnects.clear(), Me.fontPreloads.forEach(Bn, r), Me.fontPreloads.clear(), Me.highImagePreloads.forEach(
            Bn,
            r
          ), Me.highImagePreloads.clear(), Me.styles.forEach(xo, r), Me.scripts.forEach(Bn, r), Me.scripts.clear(), Me.bulkPreloads.forEach(Bn, r), Me.bulkPreloads.clear();
          var Un = Me.hoistableChunks;
          for (d = 0; d < Un.length; d++)
            r.push(Un[d]);
          Un.length = 0;
          var Xn = n.clientRenderedBoundaries;
          for (u = 0; u < Xn.length; u++) {
            var pt = Xn[u];
            Me = r;
            var pn = n.resumableState, tn = n.renderState, Dr = pt.rootSegmentID, Wn = pt.errorDigest, br = pt.errorMessage, ct = pt.errorStack, al = pt.errorComponentStack;
            Me.push(tn.startInlineScript), Me.push(sn), (pn.instructions & p) === o ? (pn.instructions |= p, Me.push(Ml)) : Me.push(cs), Me.push(tn.boundaryPrefix);
            var Vo = Dr.toString(16);
            if (Me.push(Vo), Me.push(to), Wn || br || ct || al) {
              Me.push(Fc);
              var ol = At(
                Wn || ""
              );
              Me.push(ol);
            }
            if (br || ct || al) {
              Me.push(Fc);
              var Si = At(
                br || ""
              );
              Me.push(Si);
            }
            if (ct || al) {
              Me.push(Fc);
              var Ai = At(
                ct || ""
              );
              Me.push(Ai);
            }
            if (al) {
              Me.push(Fc);
              var Pi = At(al);
              Me.push(Pi);
            }
            var or = Me.push(
              ri
            );
            if (!or) {
              n.destination = null, u++, Xn.splice(0, u);
              return;
            }
          }
          Xn.splice(0, u);
          var e = n.completedBoundaries;
          for (u = 0; u < e.length; u++)
            if (!ls(
              n,
              r,
              e[u]
            )) {
              n.destination = null, u++, e.splice(0, u);
              return;
            }
          e.splice(0, u), Dc = !0;
          var t = n.partialBoundaries;
          for (u = 0; u < t.length; u++) {
            e: {
              Xn = n, pt = r;
              var c = t[u];
              ho = c.byteSize;
              var h = c.completedSegments;
              for (or = 0; or < h.length; or++)
                if (!fa(
                  Xn,
                  pt,
                  c,
                  h[or]
                )) {
                  or++, h.splice(0, or);
                  var y = !1;
                  break e;
                }
              h.splice(0, or);
              var x = c.row;
              x !== null && x.together && c.pendingTasks === 1 && (x.pendingTasks === 1 ? Au(
                Xn,
                x,
                x.hoistables
              ) : x.pendingTasks--), y = rr(
                pt,
                c.contentState,
                Xn.renderState
              );
            }
            if (!y) {
              n.destination = null, u++, t.splice(0, u);
              return;
            }
          }
          t.splice(0, u), Dc = !1;
          var S = n.completedBoundaries;
          for (u = 0; u < S.length; u++)
            if (!ls(n, r, S[u])) {
              n.destination = null, u++, S.splice(0, u);
              return;
            }
          S.splice(0, u);
        }
      } finally {
        Dc = !1, n.allPendingTasks === 0 && n.clientRenderedBoundaries.length === 0 && n.completedBoundaries.length === 0 && (n.flushScheduled = !1, u = n.resumableState, u.hasBody && (t = St("body"), r.push(t)), u.hasHtml && (u = St("html"), r.push(u)), n.abortableTasks.size !== 0 && console.error(
          "There was still abortable task at the root when we closed. This is a bug in React."
        ), n.status = ea, r.push(null), n.destination = null);
      }
    }
    function Qc(n) {
      n.flushScheduled = n.destination !== null, Fu(n), n.status === 10 && (n.status = 11), n.trackedPostpones === null && sa(n, n.pendingRootTasks === 0);
    }
    function Wi(n) {
      if (n.flushScheduled === !1 && n.pingedTasks.length === 0 && n.destination !== null) {
        n.flushScheduled = !0;
        var r = n.destination;
        r ? gc(n, r) : n.flushScheduled = !1;
      }
    }
    function ha(n, r) {
      if (n.status === 13)
        n.status = ea, r.destroy(n.fatalError);
      else if (n.status !== ea && n.destination === null) {
        n.destination = r;
        try {
          gc(n, r);
        } catch (u) {
          r = {}, Yr(n, u, r, null), Kt(n, u, r, null);
        }
      }
    }
    function Mo(n, r) {
      (n.status === 11 || n.status === 10) && (n.status = 12);
      try {
        var u = n.abortableTasks;
        if (0 < u.size) {
          var d = r === void 0 ? Error("The render was aborted by the server without a reason.") : typeof r == "object" && r !== null && typeof r.then == "function" ? Error("The render was aborted by the server with a promise.") : r;
          n.fatalError = d, u.forEach(function(b) {
            var E = Ll, F = gt.getCurrentStack;
            Ll = b, gt.getCurrentStack = Kl;
            try {
              Ha(b, n, d);
            } finally {
              Ll = E, gt.getCurrentStack = F;
            }
          }), u.clear();
        }
        n.destination !== null && gc(n, n.destination);
      } catch (b) {
        r = {}, Yr(n, b, r, null), Kt(n, b, r, null);
      }
    }
    function ei(n, r, u) {
      if (r === null) u.rootNodes.push(n);
      else {
        var d = u.workingMap, b = d.get(r);
        b === void 0 && (b = [r[1], r[2], [], null], d.set(r, b), ei(b, r[0], u)), b[2].push(n);
      }
    }
    function da() {
    }
    function ga(n, r, u, d) {
      var b = !1, E = null, F = "", D = !1;
      if (r = rn(
        r ? r.identifierPrefix : void 0
      ), n = mo(
        n,
        r,
        We(r, u),
        Kn(on, null, 0, null),
        1 / 0,
        da,
        void 0,
        function() {
          D = !0;
        },
        void 0,
        void 0,
        void 0
      ), Qc(n), Mo(n, d), ha(n, {
        push: function(te) {
          return te !== null && (F += te), !0;
        },
        destroy: function(te) {
          b = !0, E = te;
        }
      }), b && E !== d) throw E;
      if (!D)
        throw Error(
          "A component suspended while responding to synchronous input. This will cause the UI to be replaced with a loading indicator. To fix, updates that suspend should be wrapped with startTransition."
        );
      return F;
    }
    var Iu = Ms(), Es = yf(), Ya = /* @__PURE__ */ Symbol.for("react.transitional.element"), Nt = /* @__PURE__ */ Symbol.for("react.portal"), Ti = /* @__PURE__ */ Symbol.for("react.fragment"), vc = /* @__PURE__ */ Symbol.for("react.strict_mode"), yc = /* @__PURE__ */ Symbol.for("react.profiler"), Jc = /* @__PURE__ */ Symbol.for("react.consumer"), pl = /* @__PURE__ */ Symbol.for("react.context"), Tl = /* @__PURE__ */ Symbol.for("react.forward_ref"), rl = /* @__PURE__ */ Symbol.for("react.suspense"), xl = /* @__PURE__ */ Symbol.for("react.suspense_list"), Gn = /* @__PURE__ */ Symbol.for("react.memo"), El = /* @__PURE__ */ Symbol.for("react.lazy"), lt = /* @__PURE__ */ Symbol.for("react.scope"), ni = /* @__PURE__ */ Symbol.for("react.activity"), Vc = /* @__PURE__ */ Symbol.for("react.legacy_hidden"), Kc = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), jc = /* @__PURE__ */ Symbol.for("react.view_transition"), bc = Symbol.iterator, Yi = Array.isArray, wc = /* @__PURE__ */ new WeakMap(), pc = /* @__PURE__ */ new WeakMap(), Xr = /* @__PURE__ */ Symbol.for("react.client.reference"), it = Object.assign, kn = Object.prototype.hasOwnProperty, va = RegExp(
      "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    ), Ga = {}, Xa = {}, ya = new Set(
      "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
        " "
      )
    ), Du = /* @__PURE__ */ new Map([
      ["acceptCharset", "accept-charset"],
      ["htmlFor", "for"],
      ["httpEquiv", "http-equiv"],
      ["crossOrigin", "crossorigin"],
      ["accentHeight", "accent-height"],
      ["alignmentBaseline", "alignment-baseline"],
      ["arabicForm", "arabic-form"],
      ["baselineShift", "baseline-shift"],
      ["capHeight", "cap-height"],
      ["clipPath", "clip-path"],
      ["clipRule", "clip-rule"],
      ["colorInterpolation", "color-interpolation"],
      ["colorInterpolationFilters", "color-interpolation-filters"],
      ["colorProfile", "color-profile"],
      ["colorRendering", "color-rendering"],
      ["dominantBaseline", "dominant-baseline"],
      ["enableBackground", "enable-background"],
      ["fillOpacity", "fill-opacity"],
      ["fillRule", "fill-rule"],
      ["floodColor", "flood-color"],
      ["floodOpacity", "flood-opacity"],
      ["fontFamily", "font-family"],
      ["fontSize", "font-size"],
      ["fontSizeAdjust", "font-size-adjust"],
      ["fontStretch", "font-stretch"],
      ["fontStyle", "font-style"],
      ["fontVariant", "font-variant"],
      ["fontWeight", "font-weight"],
      ["glyphName", "glyph-name"],
      ["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
      ["glyphOrientationVertical", "glyph-orientation-vertical"],
      ["horizAdvX", "horiz-adv-x"],
      ["horizOriginX", "horiz-origin-x"],
      ["imageRendering", "image-rendering"],
      ["letterSpacing", "letter-spacing"],
      ["lightingColor", "lighting-color"],
      ["markerEnd", "marker-end"],
      ["markerMid", "marker-mid"],
      ["markerStart", "marker-start"],
      ["overlinePosition", "overline-position"],
      ["overlineThickness", "overline-thickness"],
      ["paintOrder", "paint-order"],
      ["panose-1", "panose-1"],
      ["pointerEvents", "pointer-events"],
      ["renderingIntent", "rendering-intent"],
      ["shapeRendering", "shape-rendering"],
      ["stopColor", "stop-color"],
      ["stopOpacity", "stop-opacity"],
      ["strikethroughPosition", "strikethrough-position"],
      ["strikethroughThickness", "strikethrough-thickness"],
      ["strokeDasharray", "stroke-dasharray"],
      ["strokeDashoffset", "stroke-dashoffset"],
      ["strokeLinecap", "stroke-linecap"],
      ["strokeLinejoin", "stroke-linejoin"],
      ["strokeMiterlimit", "stroke-miterlimit"],
      ["strokeOpacity", "stroke-opacity"],
      ["strokeWidth", "stroke-width"],
      ["textAnchor", "text-anchor"],
      ["textDecoration", "text-decoration"],
      ["textRendering", "text-rendering"],
      ["transformOrigin", "transform-origin"],
      ["underlinePosition", "underline-position"],
      ["underlineThickness", "underline-thickness"],
      ["unicodeBidi", "unicode-bidi"],
      ["unicodeRange", "unicode-range"],
      ["unitsPerEm", "units-per-em"],
      ["vAlphabetic", "v-alphabetic"],
      ["vHanging", "v-hanging"],
      ["vIdeographic", "v-ideographic"],
      ["vMathematical", "v-mathematical"],
      ["vectorEffect", "vector-effect"],
      ["vertAdvY", "vert-adv-y"],
      ["vertOriginX", "vert-origin-x"],
      ["vertOriginY", "vert-origin-y"],
      ["wordSpacing", "word-spacing"],
      ["writingMode", "writing-mode"],
      ["xmlnsXlink", "xmlns:xlink"],
      ["xHeight", "x-height"]
    ]), lr = {
      button: !0,
      checkbox: !0,
      image: !0,
      hidden: !0,
      radio: !0,
      reset: !0,
      submit: !0
    }, Rs = {
      "aria-current": 0,
      "aria-description": 0,
      "aria-details": 0,
      "aria-disabled": 0,
      "aria-hidden": 0,
      "aria-invalid": 0,
      "aria-keyshortcuts": 0,
      "aria-label": 0,
      "aria-roledescription": 0,
      "aria-autocomplete": 0,
      "aria-checked": 0,
      "aria-expanded": 0,
      "aria-haspopup": 0,
      "aria-level": 0,
      "aria-modal": 0,
      "aria-multiline": 0,
      "aria-multiselectable": 0,
      "aria-orientation": 0,
      "aria-placeholder": 0,
      "aria-pressed": 0,
      "aria-readonly": 0,
      "aria-required": 0,
      "aria-selected": 0,
      "aria-sort": 0,
      "aria-valuemax": 0,
      "aria-valuemin": 0,
      "aria-valuenow": 0,
      "aria-valuetext": 0,
      "aria-atomic": 0,
      "aria-busy": 0,
      "aria-live": 0,
      "aria-relevant": 0,
      "aria-dropeffect": 0,
      "aria-grabbed": 0,
      "aria-activedescendant": 0,
      "aria-colcount": 0,
      "aria-colindex": 0,
      "aria-colspan": 0,
      "aria-controls": 0,
      "aria-describedby": 0,
      "aria-errormessage": 0,
      "aria-flowto": 0,
      "aria-labelledby": 0,
      "aria-owns": 0,
      "aria-posinset": 0,
      "aria-rowcount": 0,
      "aria-rowindex": 0,
      "aria-rowspan": 0,
      "aria-setsize": 0,
      "aria-braillelabel": 0,
      "aria-brailleroledescription": 0,
      "aria-colindextext": 0,
      "aria-rowindextext": 0
    }, ti = {}, is = RegExp(
      "^(aria)-[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    ), Nu = RegExp(
      "^(aria)[A-Z][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    ), xi = !1, Tc = {
      accept: "accept",
      acceptcharset: "acceptCharset",
      "accept-charset": "acceptCharset",
      accesskey: "accessKey",
      action: "action",
      allowfullscreen: "allowFullScreen",
      alt: "alt",
      as: "as",
      async: "async",
      autocapitalize: "autoCapitalize",
      autocomplete: "autoComplete",
      autocorrect: "autoCorrect",
      autofocus: "autoFocus",
      autoplay: "autoPlay",
      autosave: "autoSave",
      capture: "capture",
      cellpadding: "cellPadding",
      cellspacing: "cellSpacing",
      challenge: "challenge",
      charset: "charSet",
      checked: "checked",
      children: "children",
      cite: "cite",
      class: "className",
      classid: "classID",
      classname: "className",
      cols: "cols",
      colspan: "colSpan",
      content: "content",
      contenteditable: "contentEditable",
      contextmenu: "contextMenu",
      controls: "controls",
      controlslist: "controlsList",
      coords: "coords",
      crossorigin: "crossOrigin",
      dangerouslysetinnerhtml: "dangerouslySetInnerHTML",
      data: "data",
      datetime: "dateTime",
      default: "default",
      defaultchecked: "defaultChecked",
      defaultvalue: "defaultValue",
      defer: "defer",
      dir: "dir",
      disabled: "disabled",
      disablepictureinpicture: "disablePictureInPicture",
      disableremoteplayback: "disableRemotePlayback",
      download: "download",
      draggable: "draggable",
      enctype: "encType",
      enterkeyhint: "enterKeyHint",
      fetchpriority: "fetchPriority",
      for: "htmlFor",
      form: "form",
      formmethod: "formMethod",
      formaction: "formAction",
      formenctype: "formEncType",
      formnovalidate: "formNoValidate",
      formtarget: "formTarget",
      frameborder: "frameBorder",
      headers: "headers",
      height: "height",
      hidden: "hidden",
      high: "high",
      href: "href",
      hreflang: "hrefLang",
      htmlfor: "htmlFor",
      httpequiv: "httpEquiv",
      "http-equiv": "httpEquiv",
      icon: "icon",
      id: "id",
      imagesizes: "imageSizes",
      imagesrcset: "imageSrcSet",
      inert: "inert",
      innerhtml: "innerHTML",
      inputmode: "inputMode",
      integrity: "integrity",
      is: "is",
      itemid: "itemID",
      itemprop: "itemProp",
      itemref: "itemRef",
      itemscope: "itemScope",
      itemtype: "itemType",
      keyparams: "keyParams",
      keytype: "keyType",
      kind: "kind",
      label: "label",
      lang: "lang",
      list: "list",
      loop: "loop",
      low: "low",
      manifest: "manifest",
      marginwidth: "marginWidth",
      marginheight: "marginHeight",
      max: "max",
      maxlength: "maxLength",
      media: "media",
      mediagroup: "mediaGroup",
      method: "method",
      min: "min",
      minlength: "minLength",
      multiple: "multiple",
      muted: "muted",
      name: "name",
      nomodule: "noModule",
      nonce: "nonce",
      novalidate: "noValidate",
      open: "open",
      optimum: "optimum",
      pattern: "pattern",
      placeholder: "placeholder",
      playsinline: "playsInline",
      poster: "poster",
      preload: "preload",
      profile: "profile",
      radiogroup: "radioGroup",
      readonly: "readOnly",
      referrerpolicy: "referrerPolicy",
      rel: "rel",
      required: "required",
      reversed: "reversed",
      role: "role",
      rows: "rows",
      rowspan: "rowSpan",
      sandbox: "sandbox",
      scope: "scope",
      scoped: "scoped",
      scrolling: "scrolling",
      seamless: "seamless",
      selected: "selected",
      shape: "shape",
      size: "size",
      sizes: "sizes",
      span: "span",
      spellcheck: "spellCheck",
      src: "src",
      srcdoc: "srcDoc",
      srclang: "srcLang",
      srcset: "srcSet",
      start: "start",
      step: "step",
      style: "style",
      summary: "summary",
      tabindex: "tabIndex",
      target: "target",
      title: "title",
      type: "type",
      usemap: "useMap",
      value: "value",
      width: "width",
      wmode: "wmode",
      wrap: "wrap",
      about: "about",
      accentheight: "accentHeight",
      "accent-height": "accentHeight",
      accumulate: "accumulate",
      additive: "additive",
      alignmentbaseline: "alignmentBaseline",
      "alignment-baseline": "alignmentBaseline",
      allowreorder: "allowReorder",
      alphabetic: "alphabetic",
      amplitude: "amplitude",
      arabicform: "arabicForm",
      "arabic-form": "arabicForm",
      ascent: "ascent",
      attributename: "attributeName",
      attributetype: "attributeType",
      autoreverse: "autoReverse",
      azimuth: "azimuth",
      basefrequency: "baseFrequency",
      baselineshift: "baselineShift",
      "baseline-shift": "baselineShift",
      baseprofile: "baseProfile",
      bbox: "bbox",
      begin: "begin",
      bias: "bias",
      by: "by",
      calcmode: "calcMode",
      capheight: "capHeight",
      "cap-height": "capHeight",
      clip: "clip",
      clippath: "clipPath",
      "clip-path": "clipPath",
      clippathunits: "clipPathUnits",
      cliprule: "clipRule",
      "clip-rule": "clipRule",
      color: "color",
      colorinterpolation: "colorInterpolation",
      "color-interpolation": "colorInterpolation",
      colorinterpolationfilters: "colorInterpolationFilters",
      "color-interpolation-filters": "colorInterpolationFilters",
      colorprofile: "colorProfile",
      "color-profile": "colorProfile",
      colorrendering: "colorRendering",
      "color-rendering": "colorRendering",
      contentscripttype: "contentScriptType",
      contentstyletype: "contentStyleType",
      cursor: "cursor",
      cx: "cx",
      cy: "cy",
      d: "d",
      datatype: "datatype",
      decelerate: "decelerate",
      descent: "descent",
      diffuseconstant: "diffuseConstant",
      direction: "direction",
      display: "display",
      divisor: "divisor",
      dominantbaseline: "dominantBaseline",
      "dominant-baseline": "dominantBaseline",
      dur: "dur",
      dx: "dx",
      dy: "dy",
      edgemode: "edgeMode",
      elevation: "elevation",
      enablebackground: "enableBackground",
      "enable-background": "enableBackground",
      end: "end",
      exponent: "exponent",
      externalresourcesrequired: "externalResourcesRequired",
      fill: "fill",
      fillopacity: "fillOpacity",
      "fill-opacity": "fillOpacity",
      fillrule: "fillRule",
      "fill-rule": "fillRule",
      filter: "filter",
      filterres: "filterRes",
      filterunits: "filterUnits",
      floodopacity: "floodOpacity",
      "flood-opacity": "floodOpacity",
      floodcolor: "floodColor",
      "flood-color": "floodColor",
      focusable: "focusable",
      fontfamily: "fontFamily",
      "font-family": "fontFamily",
      fontsize: "fontSize",
      "font-size": "fontSize",
      fontsizeadjust: "fontSizeAdjust",
      "font-size-adjust": "fontSizeAdjust",
      fontstretch: "fontStretch",
      "font-stretch": "fontStretch",
      fontstyle: "fontStyle",
      "font-style": "fontStyle",
      fontvariant: "fontVariant",
      "font-variant": "fontVariant",
      fontweight: "fontWeight",
      "font-weight": "fontWeight",
      format: "format",
      from: "from",
      fx: "fx",
      fy: "fy",
      g1: "g1",
      g2: "g2",
      glyphname: "glyphName",
      "glyph-name": "glyphName",
      glyphorientationhorizontal: "glyphOrientationHorizontal",
      "glyph-orientation-horizontal": "glyphOrientationHorizontal",
      glyphorientationvertical: "glyphOrientationVertical",
      "glyph-orientation-vertical": "glyphOrientationVertical",
      glyphref: "glyphRef",
      gradienttransform: "gradientTransform",
      gradientunits: "gradientUnits",
      hanging: "hanging",
      horizadvx: "horizAdvX",
      "horiz-adv-x": "horizAdvX",
      horizoriginx: "horizOriginX",
      "horiz-origin-x": "horizOriginX",
      ideographic: "ideographic",
      imagerendering: "imageRendering",
      "image-rendering": "imageRendering",
      in2: "in2",
      in: "in",
      inlist: "inlist",
      intercept: "intercept",
      k1: "k1",
      k2: "k2",
      k3: "k3",
      k4: "k4",
      k: "k",
      kernelmatrix: "kernelMatrix",
      kernelunitlength: "kernelUnitLength",
      kerning: "kerning",
      keypoints: "keyPoints",
      keysplines: "keySplines",
      keytimes: "keyTimes",
      lengthadjust: "lengthAdjust",
      letterspacing: "letterSpacing",
      "letter-spacing": "letterSpacing",
      lightingcolor: "lightingColor",
      "lighting-color": "lightingColor",
      limitingconeangle: "limitingConeAngle",
      local: "local",
      markerend: "markerEnd",
      "marker-end": "markerEnd",
      markerheight: "markerHeight",
      markermid: "markerMid",
      "marker-mid": "markerMid",
      markerstart: "markerStart",
      "marker-start": "markerStart",
      markerunits: "markerUnits",
      markerwidth: "markerWidth",
      mask: "mask",
      maskcontentunits: "maskContentUnits",
      maskunits: "maskUnits",
      mathematical: "mathematical",
      mode: "mode",
      numoctaves: "numOctaves",
      offset: "offset",
      opacity: "opacity",
      operator: "operator",
      order: "order",
      orient: "orient",
      orientation: "orientation",
      origin: "origin",
      overflow: "overflow",
      overlineposition: "overlinePosition",
      "overline-position": "overlinePosition",
      overlinethickness: "overlineThickness",
      "overline-thickness": "overlineThickness",
      paintorder: "paintOrder",
      "paint-order": "paintOrder",
      panose1: "panose1",
      "panose-1": "panose1",
      pathlength: "pathLength",
      patterncontentunits: "patternContentUnits",
      patterntransform: "patternTransform",
      patternunits: "patternUnits",
      pointerevents: "pointerEvents",
      "pointer-events": "pointerEvents",
      points: "points",
      pointsatx: "pointsAtX",
      pointsaty: "pointsAtY",
      pointsatz: "pointsAtZ",
      popover: "popover",
      popovertarget: "popoverTarget",
      popovertargetaction: "popoverTargetAction",
      prefix: "prefix",
      preservealpha: "preserveAlpha",
      preserveaspectratio: "preserveAspectRatio",
      primitiveunits: "primitiveUnits",
      property: "property",
      r: "r",
      radius: "radius",
      refx: "refX",
      refy: "refY",
      renderingintent: "renderingIntent",
      "rendering-intent": "renderingIntent",
      repeatcount: "repeatCount",
      repeatdur: "repeatDur",
      requiredextensions: "requiredExtensions",
      requiredfeatures: "requiredFeatures",
      resource: "resource",
      restart: "restart",
      result: "result",
      results: "results",
      rotate: "rotate",
      rx: "rx",
      ry: "ry",
      scale: "scale",
      security: "security",
      seed: "seed",
      shaperendering: "shapeRendering",
      "shape-rendering": "shapeRendering",
      slope: "slope",
      spacing: "spacing",
      specularconstant: "specularConstant",
      specularexponent: "specularExponent",
      speed: "speed",
      spreadmethod: "spreadMethod",
      startoffset: "startOffset",
      stddeviation: "stdDeviation",
      stemh: "stemh",
      stemv: "stemv",
      stitchtiles: "stitchTiles",
      stopcolor: "stopColor",
      "stop-color": "stopColor",
      stopopacity: "stopOpacity",
      "stop-opacity": "stopOpacity",
      strikethroughposition: "strikethroughPosition",
      "strikethrough-position": "strikethroughPosition",
      strikethroughthickness: "strikethroughThickness",
      "strikethrough-thickness": "strikethroughThickness",
      string: "string",
      stroke: "stroke",
      strokedasharray: "strokeDasharray",
      "stroke-dasharray": "strokeDasharray",
      strokedashoffset: "strokeDashoffset",
      "stroke-dashoffset": "strokeDashoffset",
      strokelinecap: "strokeLinecap",
      "stroke-linecap": "strokeLinecap",
      strokelinejoin: "strokeLinejoin",
      "stroke-linejoin": "strokeLinejoin",
      strokemiterlimit: "strokeMiterlimit",
      "stroke-miterlimit": "strokeMiterlimit",
      strokewidth: "strokeWidth",
      "stroke-width": "strokeWidth",
      strokeopacity: "strokeOpacity",
      "stroke-opacity": "strokeOpacity",
      suppresscontenteditablewarning: "suppressContentEditableWarning",
      suppresshydrationwarning: "suppressHydrationWarning",
      surfacescale: "surfaceScale",
      systemlanguage: "systemLanguage",
      tablevalues: "tableValues",
      targetx: "targetX",
      targety: "targetY",
      textanchor: "textAnchor",
      "text-anchor": "textAnchor",
      textdecoration: "textDecoration",
      "text-decoration": "textDecoration",
      textlength: "textLength",
      textrendering: "textRendering",
      "text-rendering": "textRendering",
      to: "to",
      transform: "transform",
      transformorigin: "transformOrigin",
      "transform-origin": "transformOrigin",
      typeof: "typeof",
      u1: "u1",
      u2: "u2",
      underlineposition: "underlinePosition",
      "underline-position": "underlinePosition",
      underlinethickness: "underlineThickness",
      "underline-thickness": "underlineThickness",
      unicode: "unicode",
      unicodebidi: "unicodeBidi",
      "unicode-bidi": "unicodeBidi",
      unicoderange: "unicodeRange",
      "unicode-range": "unicodeRange",
      unitsperem: "unitsPerEm",
      "units-per-em": "unitsPerEm",
      unselectable: "unselectable",
      valphabetic: "vAlphabetic",
      "v-alphabetic": "vAlphabetic",
      values: "values",
      vectoreffect: "vectorEffect",
      "vector-effect": "vectorEffect",
      version: "version",
      vertadvy: "vertAdvY",
      "vert-adv-y": "vertAdvY",
      vertoriginx: "vertOriginX",
      "vert-origin-x": "vertOriginX",
      vertoriginy: "vertOriginY",
      "vert-origin-y": "vertOriginY",
      vhanging: "vHanging",
      "v-hanging": "vHanging",
      videographic: "vIdeographic",
      "v-ideographic": "vIdeographic",
      viewbox: "viewBox",
      viewtarget: "viewTarget",
      visibility: "visibility",
      vmathematical: "vMathematical",
      "v-mathematical": "vMathematical",
      vocab: "vocab",
      widths: "widths",
      wordspacing: "wordSpacing",
      "word-spacing": "wordSpacing",
      writingmode: "writingMode",
      "writing-mode": "writingMode",
      x1: "x1",
      x2: "x2",
      x: "x",
      xchannelselector: "xChannelSelector",
      xheight: "xHeight",
      "x-height": "xHeight",
      xlinkactuate: "xlinkActuate",
      "xlink:actuate": "xlinkActuate",
      xlinkarcrole: "xlinkArcrole",
      "xlink:arcrole": "xlinkArcrole",
      xlinkhref: "xlinkHref",
      "xlink:href": "xlinkHref",
      xlinkrole: "xlinkRole",
      "xlink:role": "xlinkRole",
      xlinkshow: "xlinkShow",
      "xlink:show": "xlinkShow",
      xlinktitle: "xlinkTitle",
      "xlink:title": "xlinkTitle",
      xlinktype: "xlinkType",
      "xlink:type": "xlinkType",
      xmlbase: "xmlBase",
      "xml:base": "xmlBase",
      xmllang: "xmlLang",
      "xml:lang": "xmlLang",
      xmlns: "xmlns",
      "xml:space": "xmlSpace",
      xmlnsxlink: "xmlnsXlink",
      "xmlns:xlink": "xmlnsXlink",
      xmlspace: "xmlSpace",
      y1: "y1",
      y2: "y2",
      y: "y",
      ychannelselector: "yChannelSelector",
      z: "z",
      zoomandpan: "zoomAndPan"
    }, fr = {}, Gi = /^on./, as = /^on[^A-Z]/, Za = RegExp(
      "^(aria)-[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    ), qc = RegExp(
      "^(aria)[A-Z][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    ), Qa = /^(?:webkit|moz|o)[A-Z]/, hr = /^-ms-/, ir = /-(.)/g, ba = /;\s*$/, qn = {}, zn = {}, Ja = !1, Io = !1, $c = /["'&<>]/, Do = /([A-Z])/g, Lu = /^ms-/, Cs = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i, gt = Iu.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Xi = Es.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, os = Object.freeze({
      pending: !1,
      data: null,
      method: null,
      action: null
    }), i = Xi.d;
    Xi.d = {
      f: i.f,
      r: i.r,
      D: function(n) {
        var r = _t || null;
        if (r) {
          var u = r.resumableState, d = r.renderState;
          if (typeof n == "string" && n) {
            if (!u.dnsResources.hasOwnProperty(n)) {
              u.dnsResources[n] = I, u = d.headers;
              var b, E;
              (E = u && 0 < u.remainingCapacity) && (E = (b = "<" + L(n) + ">; rel=dns-prefetch", 0 <= (u.remainingCapacity -= b.length + 2))), E ? (d.resets.dns[n] = I, u.preconnects && (u.preconnects += ", "), u.preconnects += b) : (b = [], Se(b, { href: n, rel: "dns-prefetch" }), d.preconnects.add(b));
            }
            Wi(r);
          }
        } else i.D(n);
      },
      C: function(n, r) {
        var u = _t || null;
        if (u) {
          var d = u.resumableState, b = u.renderState;
          if (typeof n == "string" && n) {
            var E = r === "use-credentials" ? "credentials" : typeof r == "string" ? "anonymous" : "default";
            if (!d.connectResources[E].hasOwnProperty(n)) {
              d.connectResources[E][n] = I, d = b.headers;
              var F, D;
              if (D = d && 0 < d.remainingCapacity) {
                if (D = "<" + L(n) + ">; rel=preconnect", typeof r == "string") {
                  var te = Ee(
                    r,
                    "crossOrigin"
                  );
                  D += '; crossorigin="' + te + '"';
                }
                D = (F = D, 0 <= (d.remainingCapacity -= F.length + 2));
              }
              D ? (b.resets.connect[E][n] = I, d.preconnects && (d.preconnects += ", "), d.preconnects += F) : (E = [], Se(E, {
                rel: "preconnect",
                href: n,
                crossOrigin: r
              }), b.preconnects.add(E));
            }
            Wi(u);
          }
        } else i.C(n, r);
      },
      L: function(n, r, u) {
        var d = _t || null;
        if (d) {
          var b = d.resumableState, E = d.renderState;
          if (r && n) {
            switch (r) {
              case "image":
                if (u)
                  var F = u.imageSrcSet, D = u.imageSizes, te = u.fetchPriority;
                var H = F ? F + `
` + (D || "") : n;
                if (b.imageResources.hasOwnProperty(H)) return;
                b.imageResources[H] = G, b = E.headers;
                var j;
                b && 0 < b.remainingCapacity && typeof F != "string" && te === "high" && (j = R(n, r, u), 0 <= (b.remainingCapacity -= j.length + 2)) ? (E.resets.image[H] = G, b.highImagePreloads && (b.highImagePreloads += ", "), b.highImagePreloads += j) : (b = [], Se(
                  b,
                  it(
                    {
                      rel: "preload",
                      href: F ? void 0 : n,
                      as: r
                    },
                    u
                  )
                ), te === "high" ? E.highImagePreloads.add(b) : (E.bulkPreloads.add(b), E.preloads.images.set(H, b)));
                break;
              case "style":
                if (b.styleResources.hasOwnProperty(n)) return;
                F = [], Se(
                  F,
                  it({ rel: "preload", href: n, as: r }, u)
                ), b.styleResources[n] = !u || typeof u.crossOrigin != "string" && typeof u.integrity != "string" ? G : [u.crossOrigin, u.integrity], E.preloads.stylesheets.set(n, F), E.bulkPreloads.add(F);
                break;
              case "script":
                if (b.scriptResources.hasOwnProperty(n)) return;
                F = [], E.preloads.scripts.set(n, F), E.bulkPreloads.add(F), Se(
                  F,
                  it({ rel: "preload", href: n, as: r }, u)
                ), b.scriptResources[n] = !u || typeof u.crossOrigin != "string" && typeof u.integrity != "string" ? G : [u.crossOrigin, u.integrity];
                break;
              default:
                if (b.unknownResources.hasOwnProperty(r)) {
                  if (F = b.unknownResources[r], F.hasOwnProperty(n))
                    return;
                } else
                  F = {}, b.unknownResources[r] = F;
                F[n] = G, (b = E.headers) && 0 < b.remainingCapacity && r === "font" && (H = R(n, r, u), 0 <= (b.remainingCapacity -= H.length + 2)) ? (E.resets.font[n] = G, b.fontPreloads && (b.fontPreloads += ", "), b.fontPreloads += H) : (b = [], n = it(
                  { rel: "preload", href: n, as: r },
                  u
                ), Se(b, n), r) === "font" ? E.fontPreloads.add(b) : E.bulkPreloads.add(b);
            }
            Wi(d);
          }
        } else i.L(n, r, u);
      },
      m: function(n, r) {
        var u = _t || null;
        if (u) {
          var d = u.resumableState, b = u.renderState;
          if (n) {
            var E = r && typeof r.as == "string" ? r.as : "script";
            switch (E) {
              case "script":
                if (d.moduleScriptResources.hasOwnProperty(n))
                  return;
                E = [], d.moduleScriptResources[n] = !r || typeof r.crossOrigin != "string" && typeof r.integrity != "string" ? G : [r.crossOrigin, r.integrity], b.preloads.moduleScripts.set(n, E);
                break;
              default:
                if (d.moduleUnknownResources.hasOwnProperty(E)) {
                  var F = d.unknownResources[E];
                  if (F.hasOwnProperty(n)) return;
                } else
                  F = {}, d.moduleUnknownResources[E] = F;
                E = [], F[n] = G;
            }
            Se(
              E,
              it({ rel: "modulepreload", href: n }, r)
            ), b.bulkPreloads.add(E), Wi(u);
          }
        } else i.m(n, r);
      },
      X: function(n, r) {
        var u = _t || null;
        if (u) {
          var d = u.resumableState, b = u.renderState;
          if (n) {
            var E = d.scriptResources.hasOwnProperty(
              n
            ) ? d.scriptResources[n] : void 0;
            E !== I && (d.scriptResources[n] = I, r = it({ src: n, async: !0 }, r), E && (E.length === 2 && yl(r, E), n = b.preloads.scripts.get(n)) && (n.length = 0), n = [], b.scripts.add(n), Ct(n, r), Wi(u));
          }
        } else i.X(n, r);
      },
      S: function(n, r, u) {
        var d = _t || null;
        if (d) {
          var b = d.resumableState, E = d.renderState;
          if (n) {
            r = r || "default";
            var F = E.styles.get(r), D = b.styleResources.hasOwnProperty(n) ? b.styleResources[n] : void 0;
            D !== I && (b.styleResources[n] = I, F || (F = {
              precedence: Ie(r),
              rules: [],
              hrefs: [],
              sheets: /* @__PURE__ */ new Map()
            }, E.styles.set(r, F)), r = {
              state: w,
              props: it(
                {
                  rel: "stylesheet",
                  href: n,
                  "data-precedence": r
                },
                u
              )
            }, D && (D.length === 2 && yl(r.props, D), (E = E.preloads.stylesheets.get(n)) && 0 < E.length ? E.length = 0 : r.state = C), F.sheets.set(n, r), Wi(d));
          }
        } else i.S(n, r, u);
      },
      M: function(n, r) {
        var u = _t || null;
        if (u) {
          var d = u.resumableState, b = u.renderState;
          if (n) {
            var E = d.moduleScriptResources.hasOwnProperty(n) ? d.moduleScriptResources[n] : void 0;
            E !== I && (d.moduleScriptResources[n] = I, r = it(
              { src: n, type: "module", async: !0 },
              r
            ), E && (E.length === 2 && yl(r, E), n = b.preloads.moduleScripts.get(n)) && (n.length = 0), n = [], b.scripts.add(n), Ct(n, r), Wi(u));
          }
        } else i.M(n, r);
      }
    };
    var o = 0, f = 1, g = 2, p = 4, m = 8, A = 32, Q = 64, I = null, G = [];
    Object.freeze(G);
    var re = null, $ = "<\/script>", ve = /(<\/|<)(s)(cript)/gi, Ne = {}, on = 0, Ze = 1, ze = 2, je = 3, Xe = 4, at = 5, cn = 6, wn = 7, Mn = 8, en = 9, vt = /* @__PURE__ */ new Map(), Sn = ' style="', Rr = ":", Dn = ";", En = " ", An = '="', qe = '"', Pn = '=""', qt = Ie(
      "javascript:throw new Error('React form unexpectedly submitted.')"
    ), sn = ">", wa = "/>", Zi = !1, Cr = !1, Al = !1, Pl = !1, Fl = !1, Ei = !1, Qi = !1, Jt = !1, Va = !1, Ka = !1, xc = !1, eu = `addEventListener("submit",function(a){if(!a.defaultPrevented){var c=a.target,d=a.submitter,e=c.action,b=d;if(d){var f=d.getAttribute("formAction");null!=f&&(e=f,b=null)}"javascript:throw new Error('React form unexpectedly submitted.')"===e&&(a.preventDefault(),b?(a=document.createElement("input"),a.name=b.name,a.value=b.value,b.parentNode.insertBefore(a,b),b=new FormData(c),a.parentNode.removeChild(a)):b=new FormData(c),a=c.ownerDocument||c,(a.$$reactFormReplay=a.$$reactFormReplay||[]).push(c,d,b))}});`, No = /(<\/|<)(s)(tyle)/gi, pa = `
`, mr = /^[a-zA-Z][a-zA-Z:_\.\-\d]*$/, Ec = /* @__PURE__ */ new Map(), kr = /* @__PURE__ */ new Map(), Rl = "requestAnimationFrame(function(){$RT=performance.now()});", Ji = '<template id="', Rc = '"></template>', Vi = "<!--$-->", nu = '<!--$?--><template id="', Lt = '"></template>', Cc = "<!--$!-->", Ta = "<!--/$-->", Lo = "<template", ja = '"', Ot = ' data-dgst="', Cl = ' data-msg="', un = ' data-stck="', Ki = ' data-cstck="', Bo = "></template>", xa = '<div hidden id="', yt = '">', Zr = "</div>", Ea = '<svg aria-hidden="true" style="display:none" id="', qa = '">', Ol = "</svg>", dr = '<math aria-hidden="true" style="display:none" id="', _o = '">', Sr = "</math>", Bu = '<table hidden id="', $a = '">', mc = "</table>", tu = '<table hidden><tbody id="', ru = '">', Ri = "</tbody></table>", eo = '<table hidden><tr id="', no = '">', Ar = "</tr></table>", kc = '<table hidden><colgroup id="', Sc = '">', _u = "</colgroup></table>", zu = '$RS=function(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};$RS("', lu = '$RS("', Hu = '","', Uu = '")<\/script>', Bt = `$RB=[];$RV=function(a){$RT=performance.now();for(var b=0;b<a.length;b+=2){var c=a[b],e=a[b+1];null!==e.parentNode&&e.parentNode.removeChild(e);var f=c.parentNode;if(f){var g=c.previousSibling,h=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d||"/&"===d)if(0===h)break;else h--;else"$"!==d&&"$?"!==d&&"$~"!==d&&"$!"!==d&&"&"!==d||h++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;e.firstChild;)f.insertBefore(e.firstChild,c);g.data="$";g._reactRetry&&requestAnimationFrame(g._reactRetry)}}a.length=0};
$RC=function(a,b){if(b=document.getElementById(b))(a=document.getElementById(a))?(a.previousSibling.data="$~",$RB.push(a,b),2===$RB.length&&("number"!==typeof $RT?requestAnimationFrame($RV.bind(null,$RB)):(a=performance.now(),setTimeout($RV.bind(null,$RB),2300>a&&2E3<a?2300-a:$RT+300-a)))):b.parentNode.removeChild(b)};`, iu = '$RC("', Ac = `$RM=new Map;$RR=function(n,w,p){function u(q){this._p=null;q()}for(var r=new Map,t=document,h,b,e=t.querySelectorAll("link[data-precedence],style[data-precedence]"),v=[],k=0;b=e[k++];)"not all"===b.getAttribute("media")?v.push(b):("LINK"===b.tagName&&$RM.set(b.getAttribute("href"),b),r.set(b.dataset.precedence,h=b));e=0;b=[];var l,a;for(k=!0;;){if(k){var f=p[e++];if(!f){k=!1;e=0;continue}var c=!1,m=0;var d=f[m++];if(a=$RM.get(d)){var g=a._p;c=!0}else{a=t.createElement("link");a.href=d;a.rel=
"stylesheet";for(a.dataset.precedence=l=f[m++];g=f[m++];)a.setAttribute(g,f[m++]);g=a._p=new Promise(function(q,x){a.onload=u.bind(a,q);a.onerror=u.bind(a,x)});$RM.set(d,a)}d=a.getAttribute("media");!g||d&&!matchMedia(d).matches||b.push(g);if(c)continue}else{a=v[e++];if(!a)break;l=a.getAttribute("data-precedence");a.removeAttribute("media")}c=r.get(l)||h;c===h&&(h=a);r.set(l,a);c?c.parentNode.insertBefore(a,c.nextSibling):(c=t.head,c.insertBefore(a,c.firstChild))}if(p=document.getElementById(n))p.previousSibling.data=
"$~";Promise.all(b).then($RC.bind(null,n,w),$RX.bind(null,n,"CSS failed to load"))};$RR("`, Pc = '$RR("', au = '","', Wu = '",', ou = '"', cu = ")<\/script>", Ra = '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};', Ml = '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};;$RX("', cs = '$RX("', to = '"', Fc = ",", ri = ")<\/script>", zo = /[<\u2028\u2029]/g, Ca = /[&><\u2028\u2029]/g, Oc = ' media="not all" data-precedence="', ma = '" data-href="', us = '">', ss = "</style>", li = !1, Ho = !0, ml = [], ka = ' data-precedence="', ro = '" data-href="', Il = " ", Yu = '">', fs = "</style>", Uo = ' id="', l = "[", a = ",[", s = ",", v = "]", w = 0, C = 1, k = 2, _ = 3, O = /[<>\r\n]/g, z = /["';,\r\n]/g, Z = "", K = Function.prototype.bind, xe = /* @__PURE__ */ Symbol.for("react.client.reference"), pe = {};
    Object.freeze(pe);
    var yn = {}, Qe = null, bn = {}, bt = {}, $n = /* @__PURE__ */ new Set(), gr = /* @__PURE__ */ new Set(), ll = /* @__PURE__ */ new Set(), Dl = /* @__PURE__ */ new Set(), Je = /* @__PURE__ */ new Set(), Pr = /* @__PURE__ */ new Set(), Mt = /* @__PURE__ */ new Set(), Qr = /* @__PURE__ */ new Set(), ji = /* @__PURE__ */ new Set(), wt = {
      enqueueSetState: function(n, r, u) {
        var d = n._reactInternals;
        d.queue === null ? bl(n, "setState") : (d.queue.push(r), u != null && lc(u));
      },
      enqueueReplaceState: function(n, r, u) {
        n = n._reactInternals, n.replace = !0, n.queue = [r], u != null && lc(u);
      },
      enqueueForceUpdate: function(n, r) {
        n._reactInternals.queue === null ? bl(n, "forceUpdate") : r != null && lc(r);
      }
    }, lo = { id: 1, overflow: "" }, Nl = Math.clz32 ? Math.clz32 : es, Fr = Math.log, ii = Math.LN2, Or = Error(
      "Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`."
    ), io = null, Wo = typeof Object.is == "function" ? Object.is : oc, Jr = null, Yo = null, Mr = null, ao = null, Gu = null, ot = null, Go = !1, ai = !1, uu = 0, oo = 0, su = -1, fu = 0, Xo = null, Sa = null, hu = 0, Ci = !1, co, uo = {
      readContext: Ba,
      use: function(n) {
        if (n !== null && typeof n == "object") {
          if (typeof n.then == "function")
            return wl(n);
          if (n.$$typeof === pl)
            return Ba(n);
        }
        throw Error(
          "An unsupported type was passed to use(): " + String(n)
        );
      },
      useContext: function(n) {
        return co = "useContext", di(), n._currentValue2;
      },
      useMemo: ns,
      useReducer: Er,
      useRef: function(n) {
        Jr = di(), ot = mn();
        var r = ot.memoizedState;
        return r === null ? (n = { current: n }, Object.seal(n), ot.memoizedState = n) : r;
      },
      useState: function(n) {
        return co = "useState", Er(Wc, n);
      },
      useInsertionEffect: dn,
      useLayoutEffect: dn,
      useCallback: function(n, r) {
        return ns(function() {
          return n;
        }, r);
      },
      useImperativeHandle: dn,
      useEffect: dn,
      useDebugValue: dn,
      useDeferredValue: function(n, r) {
        return di(), r !== void 0 ? r : n;
      },
      useTransition: function() {
        return di(), [!1, rt];
      },
      useId: function() {
        var n = Yo.treeContext, r = n.overflow;
        n = n.id, n = (n & ~(1 << 32 - Nl(n) - 1)).toString(32) + r;
        var u = hs;
        if (u === null)
          throw Error(
            "Invalid hook call. Hooks can only be called inside of the body of a function component."
          );
        return r = uu++, n = "_" + u.idPrefix + "R_" + n, 0 < r && (n += "H" + r.toString(32)), n + "_";
      },
      useSyncExternalStore: function(n, r, u) {
        if (u === void 0)
          throw Error(
            "Missing getServerSnapshot, which is required for server-rendered content. Will revert to client rendering."
          );
        return u();
      },
      useOptimistic: function(n) {
        return di(), [n, Gc];
      },
      useActionState: Eo,
      useFormState: Eo,
      useHostTransitionStatus: function() {
        return di(), os;
      },
      useMemoCache: function(n) {
        for (var r = Array(n), u = 0; u < n; u++)
          r[u] = Kc;
        return r;
      },
      useCacheRefresh: function() {
        return _a;
      },
      useEffectEvent: function() {
        return Yc;
      }
    }, hs = null, Ll = null, ds = {
      getCacheForType: function() {
        throw Error("Not implemented.");
      },
      cacheSignal: function() {
        throw Error("Not implemented.");
      },
      getOwner: function() {
        return Ll === null ? null : Ll.componentStack;
      }
    }, kl = 0, Aa, qi, du, gu, vu, so, gs;
    ts.__reactDisabledLog = !0;
    var Xu, Zo, vs = !1, yu = new (typeof WeakMap == "function" ? WeakMap : Map)(), ms = {
      react_stack_bottom_frame: function(n, r, u) {
        return n(r, u);
      }
    }, Zu = ms.react_stack_bottom_frame.bind(ms), ks = {
      react_stack_bottom_frame: function(n) {
        return n.render();
      }
    }, bu = ks.react_stack_bottom_frame.bind(ks), Qo = {
      react_stack_bottom_frame: function(n) {
        var r = n._init;
        return r(n._payload);
      }
    }, Is = Qo.react_stack_bottom_frame.bind(Qo), Ds = 0;
    if (typeof performance == "object" && typeof performance.now == "function")
      var mi = performance, ys = function() {
        return mi.now();
      };
    else {
      var Ns = Date;
      ys = function() {
        return Ns.now();
      };
    }
    var ar = 4, $i = 0, Ir = 1, Pa = 2, Bl = 3, Nn = 4, il = 5, ea = 14, _t = null, Mc = {}, wu = {}, bs = {}, Jo = {}, fo = !1, Ic = !1, oi = !1, ho = 0, Dc = !1;
    lf.renderToStaticMarkup = function(n, r) {
      return ga(
        n,
        r,
        !0,
        'The server used "renderToStaticMarkup" which does not support Suspense. If you intended to have the server wait for the suspended component please switch to "renderToReadableStream" which supports Suspense on the server'
      );
    }, lf.renderToString = function(n, r) {
      return ga(
        n,
        r,
        !1,
        'The server used "renderToString" which does not support Suspense. If you intended for this Suspense boundary to render the fallback content on the server consider throwing an Error somewhere within the Suspense boundary. If you intended to have the server wait for the suspended component please switch to "renderToReadableStream" which supports Suspense on the server'
      );
    }, lf.version = "19.2.6";
  })()), lf;
}
var Gs = {};
var Zf;
function ch() {
  return Zf || (Zf = 1, process.env.NODE_ENV !== "production" && (function() {
    function de(e, t, c, h) {
      return "" + t + (c === "s" ? "\\73 " : "\\53 ") + h;
    }
    function ue(e, t, c, h) {
      return "" + t + (c === "s" ? "\\u0073" : "\\u0053") + h;
    }
    function W(e) {
      return e === null || typeof e != "object" ? null : (e = Nu && e[Nu] || e["@@iterator"], typeof e == "function" ? e : null);
    }
    function ke(e) {
      return e = Object.prototype.toString.call(e), e.slice(8, e.length - 1);
    }
    function nn(e) {
      var t = JSON.stringify(e);
      return '"' + e + '"' === t ? e : t;
    }
    function be(e) {
      switch (typeof e) {
        case "string":
          return JSON.stringify(
            10 >= e.length ? e : e.slice(0, 10) + "..."
          );
        case "object":
          return xi(e) ? "[...]" : e !== null && e.$$typeof === Gi ? "client" : (e = ke(e), e === "Object" ? "{...}" : e);
        case "function":
          return e.$$typeof === Gi ? "client" : (e = e.displayName || e.name) ? "function " + e : "function";
        default:
          return String(e);
      }
    }
    function Oe(e) {
      if (typeof e == "string") return e;
      switch (e) {
        case va:
          return "Suspense";
        case Ga:
          return "SuspenseList";
      }
      if (typeof e == "object")
        switch (e.$$typeof) {
          case kn:
            return Oe(e.render);
          case Xa:
            return Oe(e.type);
          case ya:
            var t = e._payload;
            e = e._init;
            try {
              return Oe(e(t));
            } catch {
            }
        }
      return "";
    }
    function Tn(e, t) {
      var c = ke(e);
      if (c !== "Object" && c !== "Array") return c;
      var h = -1, y = 0;
      if (xi(e))
        if (fr.has(e)) {
          var x = fr.get(e);
          c = "<" + Oe(x) + ">";
          for (var S = 0; S < e.length; S++) {
            var M = e[S];
            M = typeof M == "string" ? M : typeof M == "object" && M !== null ? "{" + Tn(M) + "}" : "{" + be(M) + "}", "" + S === t ? (h = c.length, y = M.length, c += M) : c = 15 > M.length && 40 > c.length + M.length ? c + M : c + "{...}";
          }
          c += "</" + Oe(x) + ">";
        } else {
          for (c = "[", x = 0; x < e.length; x++)
            0 < x && (c += ", "), S = e[x], S = typeof S == "object" && S !== null ? Tn(S) : be(S), "" + x === t ? (h = c.length, y = S.length, c += S) : c = 10 > S.length && 40 > c.length + S.length ? c + S : c + "...";
          c += "]";
        }
      else if (e.$$typeof === jc)
        c = "<" + Oe(e.type) + "/>";
      else {
        if (e.$$typeof === Gi) return "client";
        if (Tc.has(e)) {
          for (c = Tc.get(e), c = "<" + (Oe(c) || "..."), x = Object.keys(e), S = 0; S < x.length; S++) {
            c += " ", M = x[S], c += nn(M) + "=";
            var V = e[M], B = M === t && typeof V == "object" && V !== null ? Tn(V) : be(V);
            typeof V != "string" && (B = "{" + B + "}"), M === t ? (h = c.length, y = B.length, c += B) : c = 10 > B.length && 40 > c.length + B.length ? c + B : c + "...";
          }
          c += ">";
        } else {
          for (c = "{", x = Object.keys(e), S = 0; S < x.length; S++)
            0 < S && (c += ", "), M = x[S], c += nn(M) + ": ", V = e[M], V = typeof V == "object" && V !== null ? Tn(V) : be(V), M === t ? (h = c.length, y = V.length, c += V) : c = 10 > V.length && 40 > c.length + V.length ? c + V : c + "...";
          c += "}";
        }
      }
      return t === void 0 ? c : -1 < h && 0 < y ? (e = " ".repeat(h) + "^".repeat(y), `
  ` + c + `
  ` + e) : `
  ` + c;
    }
    function Re(e, t) {
      var c = e.length & 3, h = e.length - c, y = t;
      for (t = 0; t < h; ) {
        var x = e.charCodeAt(t) & 255 | (e.charCodeAt(++t) & 255) << 8 | (e.charCodeAt(++t) & 255) << 16 | (e.charCodeAt(++t) & 255) << 24;
        ++t, x = 3432918353 * (x & 65535) + ((3432918353 * (x >>> 16) & 65535) << 16) & 4294967295, x = x << 15 | x >>> 17, x = 461845907 * (x & 65535) + ((461845907 * (x >>> 16) & 65535) << 16) & 4294967295, y ^= x, y = y << 13 | y >>> 19, y = 5 * (y & 65535) + ((5 * (y >>> 16) & 65535) << 16) & 4294967295, y = (y & 65535) + 27492 + (((y >>> 16) + 58964 & 65535) << 16);
      }
      switch (x = 0, c) {
        case 3:
          x ^= (e.charCodeAt(t + 2) & 255) << 16;
        case 2:
          x ^= (e.charCodeAt(t + 1) & 255) << 8;
        case 1:
          x ^= e.charCodeAt(t) & 255, x = 3432918353 * (x & 65535) + ((3432918353 * (x >>> 16) & 65535) << 16) & 4294967295, x = x << 15 | x >>> 17, y ^= 461845907 * (x & 65535) + ((461845907 * (x >>> 16) & 65535) << 16) & 4294967295;
      }
      return y ^= e.length, y ^= y >>> 16, y = 2246822507 * (y & 65535) + ((2246822507 * (y >>> 16) & 65535) << 16) & 4294967295, y ^= y >>> 13, y = 3266489909 * (y & 65535) + ((3266489909 * (y >>> 16) & 65535) << 16) & 4294967295, (y ^ y >>> 16) >>> 0;
    }
    function ie(e) {
      Za.push(e), as.port2.postMessage(null);
    }
    function He(e) {
      setTimeout(function() {
        throw e;
      });
    }
    function P(e, t) {
      if (t.byteLength !== 0)
        if (2048 < t.byteLength)
          0 < ir && (e.enqueue(
            new Uint8Array(hr.buffer, 0, ir)
          ), hr = new Uint8Array(2048), ir = 0), e.enqueue(t);
        else {
          var c = hr.length - ir;
          c < t.byteLength && (c === 0 ? e.enqueue(hr) : (hr.set(
            t.subarray(0, c),
            ir
          ), e.enqueue(hr), t = t.subarray(c)), hr = new Uint8Array(2048), ir = 0), hr.set(t, ir), ir += t.byteLength;
        }
    }
    function N(e, t) {
      return P(e, t), !0;
    }
    function Pe(e) {
      hr && 0 < ir && (e.enqueue(
        new Uint8Array(hr.buffer, 0, ir)
      ), hr = null, ir = 0);
    }
    function ee(e) {
      return ba.encode(e);
    }
    function X(e) {
      return e = ba.encode(e), 2048 < e.byteLength && console.error(
        "precomputed chunks must be smaller than the view size configured for this host. This is a bug in React."
      ), e;
    }
    function ft(e) {
      return e.byteLength;
    }
    function tr(e, t) {
      typeof e.error == "function" ? e.error(t) : e.close();
    }
    function Yt(e) {
      return typeof Symbol == "function" && Symbol.toStringTag && e[Symbol.toStringTag] || e.constructor.name || "Object";
    }
    function Gl(e) {
      try {
        return Hr(e), !1;
      } catch {
        return !0;
      }
    }
    function Hr(e) {
      return "" + e;
    }
    function Vn(e, t) {
      if (Gl(e))
        return console.error(
          "The provided `%s` attribute is an unsupported type %s. This value must be coerced to a string before using it here.",
          t,
          Yt(e)
        ), Hr(e);
    }
    function Ie(e, t) {
      if (Gl(e))
        return console.error(
          "The provided `%s` CSS property is an unsupported type %s. This value must be coerced to a string before using it here.",
          t,
          Yt(e)
        ), Hr(e);
    }
    function Ve(e) {
      if (Gl(e))
        return console.error(
          "The provided HTML markup uses a value of unsupported type %s. This value must be coerced to a string before using it here.",
          Yt(e)
        ), Hr(e);
    }
    function Et(e) {
      return zn.call($c, e) ? !0 : zn.call(Io, e) ? !1 : Ja.test(e) ? $c[e] = !0 : (Io[e] = !0, console.error("Invalid attribute name: `%s`", e), !1);
    }
    function rn(e, t) {
      Cs[t.type] || t.onChange || t.onInput || t.readOnly || t.disabled || t.value == null || console.error(
        e === "select" ? "You provided a `value` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultValue`. Otherwise, set `onChange`." : "You provided a `value` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultValue`. Otherwise, set either `onChange` or `readOnly`."
      ), t.onChange || t.readOnly || t.disabled || t.checked == null || console.error(
        "You provided a `checked` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultChecked`. Otherwise, set either `onChange` or `readOnly`."
      );
    }
    function Kn(e, t) {
      if (zn.call(Xi, t) && Xi[t])
        return !0;
      if (i.test(t)) {
        if (e = "aria-" + t.slice(4).toLowerCase(), e = gt.hasOwnProperty(e) ? e : null, e == null)
          return console.error(
            "Invalid ARIA attribute `%s`. ARIA attributes follow the pattern aria-* and must be lowercase.",
            t
          ), Xi[t] = !0;
        if (t !== e)
          return console.error(
            "Invalid ARIA attribute `%s`. Did you mean `%s`?",
            t,
            e
          ), Xi[t] = !0;
      }
      if (os.test(t)) {
        if (e = t.toLowerCase(), e = gt.hasOwnProperty(e) ? e : null, e == null) return Xi[t] = !0, !1;
        t !== e && (console.error(
          "Unknown ARIA attribute `%s`. Did you mean `%s`?",
          t,
          e
        ), Xi[t] = !0);
      }
      return !0;
    }
    function si(e, t) {
      var c = [], h;
      for (h in t)
        Kn(e, h) || c.push(h);
      t = c.map(function(y) {
        return "`" + y + "`";
      }).join(", "), c.length === 1 ? console.error(
        "Invalid aria prop %s on <%s> tag. For details, see https://react.dev/link/invalid-aria-props",
        t,
        e
      ) : 1 < c.length && console.error(
        "Invalid aria props %s on <%s> tag. For details, see https://react.dev/link/invalid-aria-props",
        t,
        e
      );
    }
    function Ln(e, t, c, h) {
      if (zn.call(g, t) && g[t])
        return !0;
      var y = t.toLowerCase();
      if (y === "onfocusin" || y === "onfocusout")
        return console.error(
          "React uses onFocus and onBlur instead of onFocusIn and onFocusOut. All React events are normalized to bubble, so onFocusIn and onFocusOut are not needed/supported by React."
        ), g[t] = !0;
      if (typeof c == "function" && (e === "form" && t === "action" || e === "input" && t === "formAction" || e === "button" && t === "formAction"))
        return !0;
      if (p.test(t))
        return m.test(t) && console.error(
          "Invalid event handler property `%s`. React events use the camelCase naming convention, for example `onClick`.",
          t
        ), g[t] = !0;
      if (A.test(t) || Q.test(t)) return !0;
      if (y === "innerhtml")
        return console.error(
          "Directly setting property `innerHTML` is not permitted. For more information, lookup documentation on `dangerouslySetInnerHTML`."
        ), g[t] = !0;
      if (y === "aria")
        return console.error(
          "The `aria` attribute is reserved for future use in React. Pass individual `aria-` attributes instead."
        ), g[t] = !0;
      if (y === "is" && c !== null && c !== void 0 && typeof c != "string")
        return console.error(
          "Received a `%s` for a string attribute `is`. If this is expected, cast the value to a string.",
          typeof c
        ), g[t] = !0;
      if (typeof c == "number" && isNaN(c))
        return console.error(
          "Received NaN for the `%s` attribute. If this is expected, cast the value to a string.",
          t
        ), g[t] = !0;
      if (f.hasOwnProperty(y)) {
        if (y = f[y], y !== t)
          return console.error(
            "Invalid DOM property `%s`. Did you mean `%s`?",
            t,
            y
          ), g[t] = !0;
      } else if (t !== y)
        return console.error(
          "React does not recognize the `%s` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `%s` instead. If you accidentally passed it from a parent component, remove it from the DOM element.",
          t,
          y
        ), g[t] = !0;
      switch (t) {
        case "dangerouslySetInnerHTML":
        case "children":
        case "style":
        case "suppressContentEditableWarning":
        case "suppressHydrationWarning":
        case "defaultValue":
        case "defaultChecked":
        case "innerHTML":
        case "ref":
          return !0;
        case "innerText":
        case "textContent":
          return !0;
      }
      switch (typeof c) {
        case "boolean":
          switch (t) {
            case "autoFocus":
            case "checked":
            case "multiple":
            case "muted":
            case "selected":
            case "contentEditable":
            case "spellCheck":
            case "draggable":
            case "value":
            case "autoReverse":
            case "externalResourcesRequired":
            case "focusable":
            case "preserveAlpha":
            case "allowFullScreen":
            case "async":
            case "autoPlay":
            case "controls":
            case "default":
            case "defer":
            case "disabled":
            case "disablePictureInPicture":
            case "disableRemotePlayback":
            case "formNoValidate":
            case "hidden":
            case "loop":
            case "noModule":
            case "noValidate":
            case "open":
            case "playsInline":
            case "readOnly":
            case "required":
            case "reversed":
            case "scoped":
            case "seamless":
            case "itemScope":
            case "capture":
            case "download":
            case "inert":
              return !0;
            default:
              return y = t.toLowerCase().slice(0, 5), y === "data-" || y === "aria-" ? !0 : (c ? console.error(
                'Received `%s` for a non-boolean attribute `%s`.\n\nIf you want to write it to the DOM, pass a string instead: %s="%s" or %s={value.toString()}.',
                c,
                t,
                t,
                c,
                t
              ) : console.error(
                'Received `%s` for a non-boolean attribute `%s`.\n\nIf you want to write it to the DOM, pass a string instead: %s="%s" or %s={value.toString()}.\n\nIf you used to conditionally omit it with %s={condition && value}, pass %s={condition ? value : undefined} instead.',
                c,
                t,
                t,
                c,
                t,
                t,
                t
              ), g[t] = !0);
          }
        case "function":
        case "symbol":
          return g[t] = !0, !1;
        case "string":
          if (c === "false" || c === "true") {
            switch (t) {
              case "checked":
              case "selected":
              case "multiple":
              case "muted":
              case "allowFullScreen":
              case "async":
              case "autoPlay":
              case "controls":
              case "default":
              case "defer":
              case "disabled":
              case "disablePictureInPicture":
              case "disableRemotePlayback":
              case "formNoValidate":
              case "hidden":
              case "loop":
              case "noModule":
              case "noValidate":
              case "open":
              case "playsInline":
              case "readOnly":
              case "required":
              case "reversed":
              case "scoped":
              case "seamless":
              case "itemScope":
              case "inert":
                break;
              default:
                return !0;
            }
            console.error(
              "Received the string `%s` for the boolean attribute `%s`. %s Did you mean %s={%s}?",
              c,
              t,
              c === "false" ? "The browser will interpret it as a truthy value." : 'Although this works, it will not work as expected if you pass the string "false".',
              t,
              c
            ), g[t] = !0;
          }
      }
      return !0;
    }
    function qr(e, t, c) {
      var h = [], y;
      for (y in t)
        Ln(e, y, t[y]) || h.push(y);
      t = h.map(function(x) {
        return "`" + x + "`";
      }).join(", "), h.length === 1 ? console.error(
        "Invalid value for prop %s on <%s> tag. Either remove it from the element, or pass a string or number value to keep it in the DOM. For details, see https://react.dev/link/attribute-behavior ",
        t,
        e
      ) : 1 < h.length && console.error(
        "Invalid values for props %s on <%s> tag. Either remove them from the element, or pass a string or number value to keep them in the DOM. For details, see https://react.dev/link/attribute-behavior ",
        t,
        e
      );
    }
    function nt(e) {
      return e.replace(re, function(t, c) {
        return c.toUpperCase();
      });
    }
    function Ae(e) {
      if (typeof e == "boolean" || typeof e == "number" || typeof e == "bigint")
        return "" + e;
      Ve(e), e = "" + e;
      var t = ze.exec(e);
      if (t) {
        var c = "", h, y = 0;
        for (h = t.index; h < e.length; h++) {
          switch (e.charCodeAt(h)) {
            case 34:
              t = "&quot;";
              break;
            case 38:
              t = "&amp;";
              break;
            case 39:
              t = "&#x27;";
              break;
            case 60:
              t = "&lt;";
              break;
            case 62:
              t = "&gt;";
              break;
            default:
              continue;
          }
          y !== h && (c += e.slice(y, h)), y = h + 1, c += t;
        }
        e = y !== h ? c + e.slice(y, h) : c;
      }
      return e;
    }
    function J(e) {
      return at.test("" + e) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : e;
    }
    function he(e) {
      return Ve(e), ("" + e).replace(Va, ue);
    }
    function Tr(e, t, c, h, y, x) {
      c = typeof t == "string" ? t : t && t.script;
      var S = c === void 0 ? wa : X(
        '<script nonce="' + Ae(c) + '"'
      ), M = typeof t == "string" ? void 0 : t && t.style, V = M === void 0 ? Jt : X(
        '<style nonce="' + Ae(M) + '"'
      ), B = e.idPrefix, U = [], oe = e.bootstrapScriptContent, se = e.bootstrapScripts, ce = e.bootstrapModules;
      if (oe !== void 0 && (U.push(S), an(U, e), U.push(
        yt,
        ee(
          he(oe)
        ),
        Zi
      )), oe = [], h !== void 0 && (oe.push(Ka), oe.push(
        ee(
          he(JSON.stringify(h))
        )
      ), oe.push(xc)), y && typeof x == "number" && 0 >= x && console.error(
        "React expected a positive non-zero `maxHeadersLength` option but found %s instead. When using the `onHeaders` option you may supply an optional `maxHeadersLength` option as well however, when setting this value to zero or less no headers will be captured.",
        x === 0 ? "zero" : x
      ), h = y ? {
        preconnects: "",
        fontPreloads: "",
        highImagePreloads: "",
        remainingCapacity: 2 + (typeof x == "number" ? x : 2e3)
      } : null, y = {
        placeholderPrefix: X(B + "P:"),
        segmentPrefix: X(B + "S:"),
        boundaryPrefix: X(B + "B:"),
        startInlineScript: S,
        startInlineStyle: V,
        preamble: fe(),
        externalRuntimeScript: null,
        bootstrapChunks: U,
        importMapChunks: oe,
        onHeaders: y,
        headers: h,
        resets: {
          font: {},
          dns: {},
          connect: { default: {}, anonymous: {}, credentials: {} },
          image: {},
          style: {}
        },
        charsetChunks: [],
        viewportChunks: [],
        hoistableChunks: [],
        preconnects: /* @__PURE__ */ new Set(),
        fontPreloads: /* @__PURE__ */ new Set(),
        highImagePreloads: /* @__PURE__ */ new Set(),
        styles: /* @__PURE__ */ new Map(),
        bootstrapScripts: /* @__PURE__ */ new Set(),
        scripts: /* @__PURE__ */ new Set(),
        bulkPreloads: /* @__PURE__ */ new Set(),
        preloads: {
          images: /* @__PURE__ */ new Map(),
          stylesheets: /* @__PURE__ */ new Map(),
          scripts: /* @__PURE__ */ new Map(),
          moduleScripts: /* @__PURE__ */ new Map()
        },
        nonce: { script: c, style: M },
        hoistableState: null,
        stylesToHoist: !1
      }, se !== void 0)
        for (h = 0; h < se.length; h++)
          x = se[h], V = M = void 0, B = {
            rel: "preload",
            as: "script",
            fetchPriority: "low",
            nonce: t
          }, typeof x == "string" ? B.href = S = x : (B.href = S = x.src, B.integrity = V = typeof x.integrity == "string" ? x.integrity : void 0, B.crossOrigin = M = typeof x == "string" || x.crossOrigin == null ? void 0 : x.crossOrigin === "use-credentials" ? "use-credentials" : ""), dt(
            e,
            y,
            S,
            B
          ), U.push(
            Cr,
            ee(Ae(S)),
            un
          ), c && U.push(
            Pl,
            ee(Ae(c)),
            un
          ), typeof V == "string" && U.push(
            Fl,
            ee(Ae(V)),
            un
          ), typeof M == "string" && U.push(
            Ei,
            ee(Ae(M)),
            un
          ), an(U, e), U.push(Qi);
      if (ce !== void 0)
        for (t = 0; t < ce.length; t++)
          se = ce[t], S = x = void 0, M = {
            rel: "modulepreload",
            fetchPriority: "low",
            nonce: c
          }, typeof se == "string" ? M.href = h = se : (M.href = h = se.src, M.integrity = S = typeof se.integrity == "string" ? se.integrity : void 0, M.crossOrigin = x = typeof se == "string" || se.crossOrigin == null ? void 0 : se.crossOrigin === "use-credentials" ? "use-credentials" : ""), dt(
            e,
            y,
            h,
            M
          ), U.push(
            Al,
            ee(Ae(h)),
            un
          ), c && U.push(
            Pl,
            ee(Ae(c)),
            un
          ), typeof S == "string" && U.push(
            Fl,
            ee(Ae(S)),
            un
          ), typeof x == "string" && U.push(
            Ei,
            ee(Ae(x)),
            un
          ), an(U, e), U.push(Qi);
      return y;
    }
    function vl(e, t, c, h, y) {
      return {
        idPrefix: e === void 0 ? "" : e,
        nextFormID: 0,
        streamingFormat: 0,
        bootstrapScriptContent: c,
        bootstrapScripts: h,
        bootstrapModules: y,
        instructions: vt,
        hasBody: !1,
        hasHtml: !1,
        unknownResources: {},
        dnsResources: {},
        connectResources: { default: {}, anonymous: {}, credentials: {} },
        imageResources: {},
        styleResources: {},
        scriptResources: {},
        moduleUnknownResources: {},
        moduleScriptResources: {}
      };
    }
    function fe() {
      return { htmlChunks: null, headChunks: null, bodyChunks: null };
    }
    function T(e, t, c, h) {
      return {
        insertionMode: e,
        selectedValue: t,
        tagScope: c,
        viewTransition: h
      };
    }
    function Y(e) {
      return T(
        e === "http://www.w3.org/2000/svg" ? kr : e === "http://www.w3.org/1998/Math/MathML" ? Rl : No,
        null,
        0,
        null
      );
    }
    function we(e, t, c) {
      var h = e.tagScope & -25;
      switch (t) {
        case "noscript":
          return T(mr, null, h | 1, null);
        case "select":
          return T(
            mr,
            c.value != null ? c.value : c.defaultValue,
            h,
            null
          );
        case "svg":
          return T(kr, null, h, null);
        case "picture":
          return T(mr, null, h | 2, null);
        case "math":
          return T(Rl, null, h, null);
        case "foreignObject":
          return T(mr, null, h, null);
        case "table":
          return T(Ji, null, h, null);
        case "thead":
        case "tbody":
        case "tfoot":
          return T(
            Rc,
            null,
            h,
            null
          );
        case "colgroup":
          return T(
            nu,
            null,
            h,
            null
          );
        case "tr":
          return T(
            Vi,
            null,
            h,
            null
          );
        case "head":
          if (e.insertionMode < mr)
            return T(
              Ec,
              null,
              h,
              null
            );
          break;
        case "html":
          if (e.insertionMode === No)
            return T(
              pa,
              null,
              h,
              null
            );
      }
      return e.insertionMode >= Ji || e.insertionMode < mr ? T(mr, null, h, null) : e.tagScope !== h ? T(
        e.insertionMode,
        e.selectedValue,
        h,
        null
      ) : e;
    }
    function Te(e) {
      return e === null ? null : {
        update: e.update,
        enter: "none",
        exit: "none",
        share: e.update,
        name: e.autoName,
        autoName: e.autoName,
        nameIdx: 0
      };
    }
    function me(e, t) {
      return t.tagScope & 32 && (e.instructions |= 128), T(
        t.insertionMode,
        t.selectedValue,
        t.tagScope | 12,
        Te(t.viewTransition)
      );
    }
    function Be(e, t) {
      e = Te(t.viewTransition);
      var c = t.tagScope | 16;
      return e !== null && e.share !== "none" && (c |= 64), T(
        t.insertionMode,
        t.selectedValue,
        c,
        e
      );
    }
    function Se(e, t, c, h) {
      return t === "" ? h : (h && e.push(Lt), e.push(ee(Ae(t))), !0);
    }
    function Rt(e, t) {
      if (typeof t != "object")
        throw Error(
          "The `style` prop expects a mapping from style properties to values, not a string. For example, style={{marginRight: spacing + 'em'}} when using JSX."
        );
      var c = !0, h;
      for (h in t)
        if (zn.call(t, h)) {
          var y = t[h];
          if (y != null && typeof y != "boolean" && y !== "") {
            if (h.indexOf("--") === 0) {
              var x = ee(Ae(h));
              Ie(y, h), y = ee(
                Ae(("" + y).trim())
              );
            } else {
              x = h;
              var S = y;
              if (-1 < x.indexOf("-")) {
                var M = x;
                ve.hasOwnProperty(M) && ve[M] || (ve[M] = !0, console.error(
                  "Unsupported style property %s. Did you mean %s?",
                  M,
                  nt(M.replace(G, "ms-"))
                ));
              } else if (I.test(x))
                M = x, ve.hasOwnProperty(M) && ve[M] || (ve[M] = !0, console.error(
                  "Unsupported vendor-prefixed style property %s. Did you mean %s?",
                  M,
                  M.charAt(0).toUpperCase() + M.slice(1)
                ));
              else if ($.test(S)) {
                M = x;
                var V = S;
                Ne.hasOwnProperty(V) && Ne[V] || (Ne[V] = !0, console.error(
                  `Style property values shouldn't contain a semicolon. Try "%s: %s" instead.`,
                  M,
                  V.replace(
                    $,
                    ""
                  )
                ));
              }
              typeof S == "number" && (isNaN(S) ? on || (on = !0, console.error(
                "`NaN` is an invalid value for the `%s` css style property.",
                x
              )) : isFinite(S) || Ze || (Ze = !0, console.error(
                "`Infinity` is an invalid value for the `%s` css style property.",
                x
              ))), x = h, S = Cc.get(x), S !== void 0 || (S = X(
                Ae(
                  x.replace(je, "-$1").toLowerCase().replace(Xe, "-ms-")
                )
              ), Cc.set(x, S)), x = S, typeof y == "number" ? y = y === 0 || Do.has(h) ? ee("" + y) : ee(y + "px") : (Ie(y, h), y = ee(
                Ae(("" + y).trim())
              ));
            }
            c ? (c = !1, e.push(
              Ta,
              x,
              Lo,
              y
            )) : e.push(ja, x, Lo, y);
          }
        }
      c || e.push(un);
    }
    function Rn(e, t, c) {
      c && typeof c != "function" && typeof c != "symbol" && e.push(
        Ot,
        ee(t),
        Ki
      );
    }
    function tt(e, t, c) {
      typeof c != "function" && typeof c != "symbol" && typeof c != "boolean" && e.push(
        Ot,
        ee(t),
        Cl,
        ee(Ae(c)),
        un
      );
    }
    function Ct(e, t) {
      this.push(xa), Da(e), tt(this, "name", t), tt(this, "value", e), this.push(Zr);
    }
    function Da(e) {
      if (typeof e != "string")
        throw Error(
          "File/Blob fields are not yet supported in progressive forms. Will fallback to client hydration."
        );
    }
    function Ge(e, t) {
      if (typeof t.$$FORM_ACTION == "function") {
        var c = e.nextFormID++;
        e = e.idPrefix + c;
        try {
          var h = t.$$FORM_ACTION(e);
          if (h) {
            var y = h.data;
            y?.forEach(Da);
          }
          return h;
        } catch (x) {
          if (typeof x == "object" && x !== null && typeof x.then == "function")
            throw x;
          console.error(
            `Failed to serialize an action for progressive enhancement:
%s`,
            x
          );
        }
      }
      return null;
    }
    function mt(e, t, c, h, y, x, S, M) {
      var V = null;
      if (typeof h == "function") {
        M === null || mc || (mc = !0, console.error(
          'Cannot specify a "name" prop for a button that specifies a function as a formAction. React needs it to encode which action should be invoked. It will get overridden.'
        )), y === null && x === null || ru || (ru = !0, console.error(
          "Cannot specify a formEncType or formMethod for a button that specifies a function as a formAction. React provides those automatically. They will get overridden."
        )), S === null || tu || (tu = !0, console.error(
          "Cannot specify a formTarget for a button that specifies a function as a formAction. The function will always be executed in the same window."
        ));
        var B = Ge(t, h);
        B !== null ? (M = B.name, h = B.action || "", y = B.encType, x = B.method, S = B.target, V = B.data) : (e.push(
          Ot,
          ee("formAction"),
          Cl,
          Bo,
          un
        ), S = x = y = h = M = null, Xt(t, c));
      }
      return M != null && xn(e, "name", M), h != null && xn(e, "formAction", h), y != null && xn(e, "formEncType", y), x != null && xn(e, "formMethod", x), S != null && xn(e, "formTarget", S), V;
    }
    function xn(e, t, c) {
      switch (t) {
        case "className":
          tt(e, "class", c);
          break;
        case "tabIndex":
          tt(e, "tabindex", c);
          break;
        case "dir":
        case "role":
        case "viewBox":
        case "width":
        case "height":
          tt(e, t, c);
          break;
        case "style":
          Rt(e, c);
          break;
        case "src":
        case "href":
          if (c === "") {
            console.error(
              t === "src" ? 'An empty string ("") was passed to the %s attribute. This may cause the browser to download the whole page again over the network. To fix this, either do not render the element at all or pass null to %s instead of an empty string.' : 'An empty string ("") was passed to the %s attribute. To fix this, either do not render the element at all or pass null to %s instead of an empty string.',
              t,
              t
            );
            break;
          }
        case "action":
        case "formAction":
          if (c == null || typeof c == "function" || typeof c == "symbol" || typeof c == "boolean")
            break;
          Vn(c, t), c = J("" + c), e.push(
            Ot,
            ee(t),
            Cl,
            ee(Ae(c)),
            un
          );
          break;
        case "defaultValue":
        case "defaultChecked":
        case "innerHTML":
        case "suppressContentEditableWarning":
        case "suppressHydrationWarning":
        case "ref":
          break;
        case "autoFocus":
        case "multiple":
        case "muted":
          Rn(e, t.toLowerCase(), c);
          break;
        case "xlinkHref":
          if (typeof c == "function" || typeof c == "symbol" || typeof c == "boolean")
            break;
          Vn(c, t), c = J("" + c), e.push(
            Ot,
            ee("xlink:href"),
            Cl,
            ee(Ae(c)),
            un
          );
          break;
        case "contentEditable":
        case "spellCheck":
        case "draggable":
        case "value":
        case "autoReverse":
        case "externalResourcesRequired":
        case "focusable":
        case "preserveAlpha":
          typeof c != "function" && typeof c != "symbol" && e.push(
            Ot,
            ee(t),
            Cl,
            ee(Ae(c)),
            un
          );
          break;
        case "inert":
          c !== "" || eu[t] || (eu[t] = !0, console.error(
            "Received an empty string for a boolean attribute `%s`. This will treat the attribute as if it were false. Either pass `false` to silence this warning, or pass `true` if you used an empty string in earlier versions of React to indicate this attribute is true.",
            t
          ));
        case "allowFullScreen":
        case "async":
        case "autoPlay":
        case "controls":
        case "default":
        case "defer":
        case "disabled":
        case "disablePictureInPicture":
        case "disableRemotePlayback":
        case "formNoValidate":
        case "hidden":
        case "loop":
        case "noModule":
        case "noValidate":
        case "open":
        case "playsInline":
        case "readOnly":
        case "required":
        case "reversed":
        case "scoped":
        case "seamless":
        case "itemScope":
          c && typeof c != "function" && typeof c != "symbol" && e.push(
            Ot,
            ee(t),
            Ki
          );
          break;
        case "capture":
        case "download":
          c === !0 ? e.push(
            Ot,
            ee(t),
            Ki
          ) : c !== !1 && typeof c != "function" && typeof c != "symbol" && e.push(
            Ot,
            ee(t),
            Cl,
            ee(Ae(c)),
            un
          );
          break;
        case "cols":
        case "rows":
        case "size":
        case "span":
          typeof c != "function" && typeof c != "symbol" && !isNaN(c) && 1 <= c && e.push(
            Ot,
            ee(t),
            Cl,
            ee(Ae(c)),
            un
          );
          break;
        case "rowSpan":
        case "start":
          typeof c == "function" || typeof c == "symbol" || isNaN(c) || e.push(
            Ot,
            ee(t),
            Cl,
            ee(Ae(c)),
            un
          );
          break;
        case "xlinkActuate":
          tt(e, "xlink:actuate", c);
          break;
        case "xlinkArcrole":
          tt(e, "xlink:arcrole", c);
          break;
        case "xlinkRole":
          tt(e, "xlink:role", c);
          break;
        case "xlinkShow":
          tt(e, "xlink:show", c);
          break;
        case "xlinkTitle":
          tt(e, "xlink:title", c);
          break;
        case "xlinkType":
          tt(e, "xlink:type", c);
          break;
        case "xmlBase":
          tt(e, "xml:base", c);
          break;
        case "xmlLang":
          tt(e, "xml:lang", c);
          break;
        case "xmlSpace":
          tt(e, "xml:space", c);
          break;
        default:
          if ((!(2 < t.length) || t[0] !== "o" && t[0] !== "O" || t[1] !== "n" && t[1] !== "N") && (t = Lu.get(t) || t, Et(t))) {
            switch (typeof c) {
              case "function":
              case "symbol":
                return;
              case "boolean":
                var h = t.toLowerCase().slice(0, 5);
                if (h !== "data-" && h !== "aria-") return;
            }
            e.push(
              Ot,
              ee(t),
              Cl,
              ee(Ae(c)),
              un
            );
          }
      }
    }
    function St(e, t, c) {
      if (t != null) {
        if (c != null)
          throw Error(
            "Can only set one of `children` or `props.dangerouslySetInnerHTML`."
          );
        if (typeof t != "object" || !("__html" in t))
          throw Error(
            "`props.dangerouslySetInnerHTML` must be in the form `{__html: ...}`. Please visit https://react.dev/link/dangerously-set-inner-html for more information."
          );
        t = t.__html, t != null && (Ve(t), e.push(ee("" + t)));
      }
    }
    function Gt(e, t) {
      var c = e[t];
      c != null && (c = xi(c), e.multiple && !c ? console.error(
        "The `%s` prop supplied to <select> must be an array if `multiple` is true.",
        t
      ) : !e.multiple && c && console.error(
        "The `%s` prop supplied to <select> must be a scalar value if `multiple` is false.",
        t
      ));
    }
    function Xl(e) {
      var t = "";
      return Vc.Children.forEach(e, function(c) {
        c != null && (t += c, _o || typeof c == "string" || typeof c == "number" || typeof c == "bigint" || (_o = !0, console.error(
          "Cannot infer the option value of complex children. Pass a `value` prop or use a plain string as children to <option>."
        )));
      }), t;
    }
    function Xt(e, t) {
      if ((e.instructions & 16) === vt) {
        e.instructions |= 16;
        var c = t.preamble, h = t.bootstrapChunks;
        (c.htmlChunks || c.headChunks) && h.length === 0 ? (h.push(t.startInlineScript), an(h, e), h.push(
          yt,
          eo,
          Zi
        )) : h.unshift(
          t.startInlineScript,
          yt,
          eo,
          Zi
        );
      }
    }
    function De(e, t) {
      e.push(Bn("link"));
      for (var c in t)
        if (zn.call(t, c)) {
          var h = t[c];
          if (h != null)
            switch (c) {
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(
                  "link is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
                );
              default:
                xn(e, c, h);
            }
        }
      return e.push(Zr), null;
    }
    function xr(e) {
      return Ve(e), ("" + e).replace(kc, de);
    }
    function At(e, t, c) {
      e.push(Bn(c));
      for (var h in t)
        if (zn.call(t, h)) {
          var y = t[h];
          if (y != null)
            switch (h) {
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(
                  c + " is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
                );
              default:
                xn(e, h, y);
            }
        }
      return e.push(Zr), null;
    }
    function $r(e, t) {
      e.push(Bn("title"));
      var c = null, h = null, y;
      for (y in t)
        if (zn.call(t, y)) {
          var x = t[y];
          if (x != null)
            switch (y) {
              case "children":
                c = x;
                break;
              case "dangerouslySetInnerHTML":
                h = x;
                break;
              default:
                xn(e, y, x);
            }
        }
      return e.push(yt), t = Array.isArray(c) ? 2 > c.length ? c[0] : null : c, typeof t != "function" && typeof t != "symbol" && t !== null && t !== void 0 && e.push(ee(Ae("" + t))), St(e, h, c), e.push(ht("title")), null;
    }
    function Na(e, t) {
      e.push(Bn("script"));
      var c = null, h = null, y;
      for (y in t)
        if (zn.call(t, y)) {
          var x = t[y];
          if (x != null)
            switch (y) {
              case "children":
                c = x;
                break;
              case "dangerouslySetInnerHTML":
                h = x;
                break;
              default:
                xn(e, y, x);
            }
        }
      return e.push(yt), c != null && typeof c != "string" && (t = typeof c == "number" ? "a number for children" : Array.isArray(c) ? "an array for children" : "something unexpected for children", console.error(
        "A script element was rendered with %s. If script element has children it must be a single string. Consider using dangerouslySetInnerHTML or passing a plain string as children.",
        t
      )), St(e, h, c), typeof c == "string" && e.push(ee(he(c))), e.push(ht("script")), null;
    }
    function vn(e, t, c) {
      e.push(Bn(c));
      var h = c = null, y;
      for (y in t)
        if (zn.call(t, y)) {
          var x = t[y];
          if (x != null)
            switch (y) {
              case "children":
                c = x;
                break;
              case "dangerouslySetInnerHTML":
                h = x;
                break;
              default:
                xn(e, y, x);
            }
        }
      return e.push(yt), St(e, h, c), c;
    }
    function rr(e, t, c) {
      e.push(Bn(c));
      var h = c = null, y;
      for (y in t)
        if (zn.call(t, y)) {
          var x = t[y];
          if (x != null)
            switch (y) {
              case "children":
                c = x;
                break;
              case "dangerouslySetInnerHTML":
                h = x;
                break;
              default:
                xn(e, y, x);
            }
        }
      return e.push(yt), St(e, h, c), typeof c == "string" ? (e.push(ee(Ae(c))), null) : c;
    }
    function Bn(e) {
      var t = Uu.get(e);
      if (t === void 0) {
        if (!Hu.test(e)) throw Error("Invalid tag: " + e);
        t = X("<" + e), Uu.set(e, t);
      }
      return t;
    }
    function rc(e, t, c, h, y, x, S, M, V) {
      si(t, c), t !== "input" && t !== "textarea" && t !== "select" || c == null || c.value !== null || o || (o = !0, t === "select" && c.multiple ? console.error(
        "`value` prop on `%s` should not be null. Consider using an empty array when `multiple` is set to `true` to clear the component or `undefined` for uncontrolled components.",
        t
      ) : console.error(
        "`value` prop on `%s` should not be null. Consider using an empty string to clear the component or `undefined` for uncontrolled components.",
        t
      ));
      e: if (t.indexOf("-") === -1) var B = !1;
      else
        switch (t) {
          case "annotation-xml":
          case "color-profile":
          case "font-face":
          case "font-face-src":
          case "font-face-uri":
          case "font-face-format":
          case "font-face-name":
          case "missing-glyph":
            B = !1;
            break e;
          default:
            B = !0;
        }
      switch (B || typeof c.is == "string" || qr(t, c), !c.suppressContentEditableWarning && c.contentEditable && c.children != null && console.error(
        "A component is `contentEditable` and contains `children` managed by React. It is now your responsibility to guarantee that none of those nodes are unexpectedly modified or duplicated. This is probably not intentional."
      ), M.insertionMode !== kr && M.insertionMode !== Rl && t.indexOf("-") === -1 && t.toLowerCase() !== t && console.error(
        "<%s /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.",
        t
      ), t) {
        case "div":
        case "span":
        case "svg":
        case "path":
          break;
        case "a":
          e.push(Bn("a"));
          var U = null, oe = null, se;
          for (se in c)
            if (zn.call(c, se)) {
              var ce = c[se];
              if (ce != null)
                switch (se) {
                  case "children":
                    U = ce;
                    break;
                  case "dangerouslySetInnerHTML":
                    oe = ce;
                    break;
                  case "href":
                    ce === "" ? tt(e, "href", "") : xn(e, se, ce);
                    break;
                  default:
                    xn(e, se, ce);
                }
            }
          if (e.push(yt), St(e, oe, U), typeof U == "string") {
            e.push(ee(Ae(U)));
            var le = null;
          } else le = U;
          return le;
        case "g":
        case "p":
        case "li":
          break;
        case "select":
          rn("select", c), Gt(c, "value"), Gt(c, "defaultValue"), c.value === void 0 || c.defaultValue === void 0 || Ol || (console.error(
            "Select elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled select element and remove one of these props. More info: https://react.dev/link/controlled-components"
          ), Ol = !0), e.push(Bn("select"));
          var Ue = null, Zn = null, _e;
          for (_e in c)
            if (zn.call(c, _e)) {
              var hn = c[_e];
              if (hn != null)
                switch (_e) {
                  case "children":
                    Ue = hn;
                    break;
                  case "dangerouslySetInnerHTML":
                    Zn = hn;
                    break;
                  case "defaultValue":
                  case "value":
                    break;
                  default:
                    xn(
                      e,
                      _e,
                      hn
                    );
                }
            }
          return e.push(yt), St(e, Zn, Ue), Ue;
        case "option":
          var Pt = M.selectedValue;
          e.push(Bn("option"));
          var zt = null, On = null, Le = null, Ht = null, Nr;
          for (Nr in c)
            if (zn.call(c, Nr)) {
              var Qn = c[Nr];
              if (Qn != null)
                switch (Nr) {
                  case "children":
                    zt = Qn;
                    break;
                  case "selected":
                    Le = Qn, Bu || (console.error(
                      "Use the `defaultValue` or `value` props on <select> instead of setting `selected` on <option>."
                    ), Bu = !0);
                    break;
                  case "dangerouslySetInnerHTML":
                    Ht = Qn;
                    break;
                  case "value":
                    On = Qn;
                  default:
                    xn(
                      e,
                      Nr,
                      Qn
                    );
                }
            }
          if (Pt != null) {
            if (On !== null) {
              Vn(On, "value");
              var ut = "" + On;
            } else
              Ht === null || Sr || (Sr = !0, console.error(
                "Pass a `value` prop if you set dangerouslyInnerHTML so React knows which value should be selected."
              )), ut = Xl(zt);
            if (xi(Pt)) {
              for (var cl = 0; cl < Pt.length; cl++)
                if (Vn(Pt[cl], "value"), "" + Pt[cl] === ut) {
                  e.push(Ri);
                  break;
                }
            } else
              Vn(Pt, "select.value"), "" + Pt === ut && e.push(Ri);
          } else Le && e.push(Ri);
          return e.push(yt), St(e, Ht, zt), zt;
        case "textarea":
          rn("textarea", c), c.value === void 0 || c.defaultValue === void 0 || dr || (console.error(
            "Textarea elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled textarea and remove one of these props. More info: https://react.dev/link/controlled-components"
          ), dr = !0), e.push(Bn("textarea"));
          var wr = null, er = null, st = null, Vt;
          for (Vt in c)
            if (zn.call(c, Vt)) {
              var ul = c[Vt];
              if (ul != null)
                switch (Vt) {
                  case "children":
                    st = ul;
                    break;
                  case "value":
                    wr = ul;
                    break;
                  case "defaultValue":
                    er = ul;
                    break;
                  case "dangerouslySetInnerHTML":
                    throw Error(
                      "`dangerouslySetInnerHTML` does not make sense on <textarea>."
                    );
                  default:
                    xn(
                      e,
                      Vt,
                      ul
                    );
                }
            }
          if (wr === null && er !== null && (wr = er), e.push(yt), st != null) {
            if (console.error(
              "Use the `defaultValue` or `value` props instead of setting children on <textarea>."
            ), wr != null)
              throw Error(
                "If you supply `defaultValue` on a <textarea>, do not pass children."
              );
            if (xi(st)) {
              if (1 < st.length)
                throw Error("<textarea> can only have at most one child.");
              Ve(st[0]), wr = "" + st[0];
            }
            Ve(st), wr = "" + st;
          }
          return typeof wr == "string" && wr[0] === `
` && e.push(lu), wr !== null && (Vn(wr, "value"), e.push(
            ee(Ae("" + wr))
          )), null;
        case "input":
          rn("input", c), e.push(Bn("input"));
          var Sl = null, nr = null, Tt = null, Lr = null, sl = null, Br = null, na = null, fl = null, Ut = null, _l;
          for (_l in c)
            if (zn.call(c, _l)) {
              var cr = c[_l];
              if (cr != null)
                switch (_l) {
                  case "children":
                  case "dangerouslySetInnerHTML":
                    throw Error(
                      "input is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
                    );
                  case "name":
                    Sl = cr;
                    break;
                  case "formAction":
                    nr = cr;
                    break;
                  case "formEncType":
                    Tt = cr;
                    break;
                  case "formMethod":
                    Lr = cr;
                    break;
                  case "formTarget":
                    sl = cr;
                    break;
                  case "defaultChecked":
                    Ut = cr;
                    break;
                  case "defaultValue":
                    na = cr;
                    break;
                  case "checked":
                    fl = cr;
                    break;
                  case "value":
                    Br = cr;
                    break;
                  default:
                    xn(
                      e,
                      _l,
                      cr
                    );
                }
            }
          nr === null || c.type === "image" || c.type === "submit" || $a || ($a = !0, console.error(
            'An input can only specify a formAction along with type="submit" or type="image".'
          ));
          var Qu = mt(
            e,
            h,
            y,
            nr,
            Tt,
            Lr,
            sl,
            Sl
          );
          return fl === null || Ut === null || qa || (console.error(
            "%s contains an input of type %s with both checked and defaultChecked props. Input elements must be either controlled or uncontrolled (specify either the checked prop, or the defaultChecked prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://react.dev/link/controlled-components",
            "A component",
            c.type
          ), qa = !0), Br === null || na === null || Ea || (console.error(
            "%s contains an input of type %s with both value and defaultValue props. Input elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://react.dev/link/controlled-components",
            "A component",
            c.type
          ), Ea = !0), fl !== null ? Rn(e, "checked", fl) : Ut !== null && Rn(e, "checked", Ut), Br !== null ? xn(e, "value", Br) : na !== null && xn(e, "value", na), e.push(Zr), Qu?.forEach(Ct, e), null;
        case "button":
          e.push(Bn("button"));
          var Fi = null, Ft = null, zl = null, _r = null, Nc = null, Ko = null, ci = null, jo;
          for (jo in c)
            if (zn.call(c, jo)) {
              var hl = c[jo];
              if (hl != null)
                switch (jo) {
                  case "children":
                    Fi = hl;
                    break;
                  case "dangerouslySetInnerHTML":
                    Ft = hl;
                    break;
                  case "name":
                    zl = hl;
                    break;
                  case "formAction":
                    _r = hl;
                    break;
                  case "formEncType":
                    Nc = hl;
                    break;
                  case "formMethod":
                    Ko = hl;
                    break;
                  case "formTarget":
                    ci = hl;
                    break;
                  default:
                    xn(
                      e,
                      jo,
                      hl
                    );
                }
            }
          _r === null || c.type == null || c.type === "submit" || $a || ($a = !0, console.error(
            'A button can only specify a formAction along with type="submit" or no type.'
          ));
          var Lc = mt(
            e,
            h,
            y,
            _r,
            Nc,
            Ko,
            ci,
            zl
          );
          if (e.push(yt), Lc?.forEach(Ct, e), St(e, Ft, Fi), typeof Fi == "string") {
            e.push(
              ee(Ae(Fi))
            );
            var Ju = null;
          } else Ju = Fi;
          return Ju;
        case "form":
          e.push(Bn("form"));
          var Hl = null, Bc = null, zr = null, qo = null, go = null, Fa = null, Ul;
          for (Ul in c)
            if (zn.call(c, Ul)) {
              var Wl = c[Ul];
              if (Wl != null)
                switch (Ul) {
                  case "children":
                    Hl = Wl;
                    break;
                  case "dangerouslySetInnerHTML":
                    Bc = Wl;
                    break;
                  case "action":
                    zr = Wl;
                    break;
                  case "encType":
                    qo = Wl;
                    break;
                  case "method":
                    go = Wl;
                    break;
                  case "target":
                    Fa = Wl;
                    break;
                  default:
                    xn(
                      e,
                      Ul,
                      Wl
                    );
                }
            }
          var Oi = null, dl = null;
          if (typeof zr == "function") {
            qo === null && go === null || ru || (ru = !0, console.error(
              "Cannot specify a encType or method for a form that specifies a function as the action. React provides those automatically. They will get overridden."
            )), Fa === null || tu || (tu = !0, console.error(
              "Cannot specify a target for a form that specifies a function as the action. The function will always be executed in the same window."
            ));
            var pr = Ge(
              h,
              zr
            );
            pr !== null ? (zr = pr.action || "", qo = pr.encType, go = pr.method, Fa = pr.target, Oi = pr.data, dl = pr.name) : (e.push(
              Ot,
              ee("action"),
              Cl,
              Bo,
              un
            ), Fa = go = qo = zr = null, Xt(h, y));
          }
          if (zr != null && xn(e, "action", zr), qo != null && xn(e, "encType", qo), go != null && xn(e, "method", go), Fa != null && xn(e, "target", Fa), e.push(yt), dl !== null && (e.push(xa), tt(e, "name", dl), e.push(Zr), Oi?.forEach(
            Ct,
            e
          )), St(e, Bc, Hl), typeof Hl == "string") {
            e.push(
              ee(Ae(Hl))
            );
            var Oa = null;
          } else Oa = Hl;
          return Oa;
        case "menuitem":
          e.push(Bn("menuitem"));
          for (var Mi in c)
            if (zn.call(c, Mi)) {
              var vo = c[Mi];
              if (vo != null)
                switch (Mi) {
                  case "children":
                  case "dangerouslySetInnerHTML":
                    throw Error(
                      "menuitems cannot have `children` nor `dangerouslySetInnerHTML`."
                    );
                  default:
                    xn(
                      e,
                      Mi,
                      vo
                    );
                }
            }
          return e.push(yt), null;
        case "object":
          e.push(Bn("object"));
          var ta = null, ws = null, Kr;
          for (Kr in c)
            if (zn.call(c, Kr)) {
              var ui = c[Kr];
              if (ui != null)
                switch (Kr) {
                  case "children":
                    ta = ui;
                    break;
                  case "dangerouslySetInnerHTML":
                    ws = ui;
                    break;
                  case "data":
                    Vn(ui, "data");
                    var _c = J("" + ui);
                    if (_c === "") {
                      console.error(
                        'An empty string ("") was passed to the %s attribute. To fix this, either do not render the element at all or pass null to %s instead of an empty string.',
                        Kr,
                        Kr
                      );
                      break;
                    }
                    e.push(
                      Ot,
                      ee("data"),
                      Cl,
                      ee(Ae(_c)),
                      un
                    );
                    break;
                  default:
                    xn(
                      e,
                      Kr,
                      ui
                    );
                }
            }
          if (e.push(yt), St(e, ws, ta), typeof ta == "string") {
            e.push(
              ee(Ae(ta))
            );
            var pu = null;
          } else pu = ta;
          return pu;
        case "title":
          var Tu = M.tagScope & 1, Xs = M.tagScope & 4;
          if (zn.call(c, "children")) {
            var yo = c.children, $o = Array.isArray(yo) ? 2 > yo.length ? yo[0] : null : yo;
            Array.isArray(yo) && 1 < yo.length ? console.error(
              "React expects the `children` prop of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found an Array with length %s instead. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert `children` of <title> tags to a single string value which is why Arrays of length greater than 1 are not supported. When using JSX it can be common to combine text nodes and value nodes. For example: <title>hello {nameOfUser}</title>. While not immediately apparent, `children` in this case is an Array with length 2. If your `children` prop is using this form try rewriting it using a template string: <title>{`hello ${nameOfUser}`}</title>.",
              yo.length
            ) : typeof $o == "function" || typeof $o == "symbol" ? console.error(
              "React expect children of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found %s instead. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert children of <title> tags to a single string value.",
              typeof $o == "function" ? "a Function" : "a Sybmol"
            ) : $o && $o.toString === {}.toString && ($o.$$typeof != null ? console.error(
              "React expects the `children` prop of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found an object that appears to be a React element which never implements a suitable `toString` method. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert children of <title> tags to a single string value which is why rendering React elements is not supported. If the `children` of <title> is a React Component try moving the <title> tag into that component. If the `children` of <title> is some HTML markup change it to be Text only to be valid HTML."
            ) : console.error(
              "React expects the `children` prop of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found an object that does not implement a suitable `toString` method. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert children of <title> tags to a single string value. Using the default `toString` method available on every object is almost certainly an error. Consider whether the `children` of this <title> is an object in error and change it to a string or number value if so. Otherwise implement a `toString` method that React can use to produce a valid <title>."
            ));
          }
          if (M.insertionMode === kr || Tu || c.itemProp != null)
            var bo = $r(
              e,
              c
            );
          else
            Xs ? bo = null : ($r(y.hoistableChunks, c), bo = void 0);
          return bo;
        case "link":
          var xu = M.tagScope & 1, Ls = M.tagScope & 4, Ss = c.rel, jr = c.href, Ii = c.precedence;
          if (M.insertionMode === kr || xu || c.itemProp != null || typeof Ss != "string" || typeof jr != "string" || jr === "") {
            Ss === "stylesheet" && typeof c.precedence == "string" && (typeof jr == "string" && jr || console.error(
              'React encountered a `<link rel="stylesheet" .../>` with a `precedence` prop and expected the `href` prop to be a non-empty string but ecountered %s instead. If your intent was to have React hoist and deduplciate this stylesheet using the `precedence` prop ensure there is a non-empty string `href` prop as well, otherwise remove the `precedence` prop.',
              jr === null ? "`null`" : jr === void 0 ? "`undefined`" : jr === "" ? "an empty string" : 'something with type "' + typeof jr + '"'
            )), De(e, c);
            var wo = null;
          } else if (c.rel === "stylesheet")
            if (typeof Ii != "string" || c.disabled != null || c.onLoad || c.onError) {
              if (typeof Ii == "string") {
                if (c.disabled != null)
                  console.error(
                    'React encountered a `<link rel="stylesheet" .../>` with a `precedence` prop and a `disabled` prop. The presence of the `disabled` prop indicates an intent to manage the stylesheet active state from your from your Component code and React will not hoist or deduplicate this stylesheet. If your intent was to have React hoist and deduplciate this stylesheet using the `precedence` prop remove the `disabled` prop, otherwise remove the `precedence` prop.'
                  );
                else if (c.onLoad || c.onError) {
                  var Vu = c.onLoad && c.onError ? "`onLoad` and `onError` props" : c.onLoad ? "`onLoad` prop" : "`onError` prop";
                  console.error(
                    'React encountered a `<link rel="stylesheet" .../>` with a `precedence` prop and %s. The presence of loading and error handlers indicates an intent to manage the stylesheet loading state from your from your Component code and React will not hoist or deduplicate this stylesheet. If your intent was to have React hoist and deduplciate this stylesheet using the `precedence` prop remove the %s, otherwise remove the `precedence` prop.',
                    Vu,
                    Vu
                  );
                }
              }
              wo = De(
                e,
                c
              );
            } else {
              var Yl = y.styles.get(Ii), Wt = h.styleResources.hasOwnProperty(
                jr
              ) ? h.styleResources[jr] : void 0;
              if (Wt !== Pn) {
                h.styleResources[jr] = Pn, Yl || (Yl = {
                  precedence: ee(Ae(Ii)),
                  rules: [],
                  hrefs: [],
                  sheets: /* @__PURE__ */ new Map()
                }, y.styles.set(Ii, Yl));
                var xt = {
                  state: Sa,
                  props: qn({}, c, {
                    "data-precedence": c.precedence,
                    precedence: null
                  })
                };
                if (Wt) {
                  Wt.length === 2 && hi(xt.props, Wt);
                  var et = y.preloads.stylesheets.get(jr);
                  et && 0 < et.length ? et.length = 0 : xt.state = hu;
                }
                Yl.sheets.set(jr, xt), S && S.stylesheets.add(xt);
              } else if (Yl) {
                var As = Yl.sheets.get(jr);
                As && S && S.stylesheets.add(As);
              }
              V && e.push(Lt), wo = null;
            }
          else
            c.onLoad || c.onError ? wo = De(
              e,
              c
            ) : (V && e.push(Lt), wo = Ls ? null : De(y.hoistableChunks, c));
          return wo;
        case "script":
          var ec = M.tagScope & 1, Ku = c.async;
          if (typeof c.src != "string" || !c.src || !Ku || typeof Ku == "function" || typeof Ku == "symbol" || c.onLoad || c.onError || M.insertionMode === kr || ec || c.itemProp != null)
            var nc = Na(
              e,
              c
            );
          else {
            var zc = c.src;
            if (c.type === "module")
              var ju = h.moduleScriptResources, Hc = y.preloads.moduleScripts;
            else
              ju = h.scriptResources, Hc = y.preloads.scripts;
            var Eu = ju.hasOwnProperty(zc) ? ju[zc] : void 0;
            if (Eu !== Pn) {
              ju[zc] = Pn;
              var Ru = c;
              if (Eu) {
                Eu.length === 2 && (Ru = qn({}, c), hi(Ru, Eu));
                var ps = Hc.get(zc);
                ps && (ps.length = 0);
              }
              var Ps = [];
              y.scripts.add(Ps), Na(Ps, Ru);
            }
            V && e.push(Lt), nc = null;
          }
          return nc;
        case "style":
          var Bs = M.tagScope & 1;
          if (zn.call(c, "children")) {
            var qu = c.children, $u = Array.isArray(qu) ? 2 > qu.length ? qu[0] : null : qu;
            (typeof $u == "function" || typeof $u == "symbol" || Array.isArray($u)) && console.error(
              "React expect children of <style> tags to be a string, number, or object with a `toString` method but found %s instead. In browsers style Elements can only have `Text` Nodes as children.",
              typeof $u == "function" ? "a Function" : typeof $u == "symbol" ? "a Sybmol" : "an Array"
            );
          }
          var Uc = c.precedence, po = c.href, Ma = c.nonce;
          if (M.insertionMode === kr || Bs || c.itemProp != null || typeof Uc != "string" || typeof po != "string" || po === "") {
            e.push(Bn("style"));
            var gl = null, Cu = null, _s;
            for (_s in c)
              if (zn.call(c, _s)) {
                var Zs = c[_s];
                if (Zs != null)
                  switch (_s) {
                    case "children":
                      gl = Zs;
                      break;
                    case "dangerouslySetInnerHTML":
                      Cu = Zs;
                      break;
                    default:
                      xn(
                        e,
                        _s,
                        Zs
                      );
                  }
              }
            e.push(yt);
            var Fs = Array.isArray(gl) ? 2 > gl.length ? gl[0] : null : gl;
            typeof Fs != "function" && typeof Fs != "symbol" && Fs !== null && Fs !== void 0 && e.push(
              ee(xr(Fs))
            ), St(
              e,
              Cu,
              gl
            ), e.push(ht("style"));
            var cf = null;
          } else {
            po.includes(" ") && console.error(
              'React expected the `href` prop for a <style> tag opting into hoisting semantics using the `precedence` prop to not have any spaces but ecountered spaces instead. using spaces in this prop will cause hydration of this style to fail on the client. The href for the <style> where this ocurred is "%s".',
              po
            );
            var Ts = y.styles.get(Uc), uf = h.styleResources.hasOwnProperty(po) ? h.styleResources[po] : void 0;
            if (uf !== Pn) {
              h.styleResources[po] = Pn, uf && console.error(
                'React encountered a hoistable style tag for the same href as a preload: "%s". When using a style tag to inline styles you should not also preload it as a stylsheet.',
                po
              ), Ts || (Ts = {
                precedence: ee(
                  Ae(Uc)
                ),
                rules: [],
                hrefs: [],
                sheets: /* @__PURE__ */ new Map()
              }, y.styles.set(
                Uc,
                Ts
              ));
              var zs = y.nonce.style;
              if (zs && zs !== Ma)
                console.error(
                  'React encountered a style tag with `precedence` "%s" and `nonce` "%s". When React manages style rules using `precedence` it will only include rules if the nonce matches the style nonce "%s" that was included with this render.',
                  Uc,
                  Ma,
                  zs
                );
              else {
                !zs && Ma && console.error(
                  'React encountered a style tag with `precedence` "%s" and `nonce` "%s". When React manages style rules using `precedence` it will only include a nonce attributes if you also provide the same style nonce value as a render option.',
                  Uc,
                  Ma
                ), Ts.hrefs.push(
                  ee(Ae(po))
                );
                var Qs = Ts.rules, Js = null, mf = null, sf;
                for (sf in c)
                  if (zn.call(c, sf)) {
                    var bf = c[sf];
                    if (bf != null)
                      switch (sf) {
                        case "children":
                          Js = bf;
                          break;
                        case "dangerouslySetInnerHTML":
                          mf = bf;
                      }
                  }
                var js = Array.isArray(Js) ? 2 > Js.length ? Js[0] : null : Js;
                typeof js != "function" && typeof js != "symbol" && js !== null && js !== void 0 && Qs.push(
                  ee(xr(js))
                ), St(Qs, mf, Js);
              }
            }
            Ts && S && S.styles.add(Ts), V && e.push(Lt), cf = void 0;
          }
          return cf;
        case "meta":
          var Jf = M.tagScope & 1, Vf = M.tagScope & 4;
          if (M.insertionMode === kr || Jf || c.itemProp != null)
            var kf = At(
              e,
              c,
              "meta"
            );
          else
            V && e.push(Lt), kf = Vf ? null : typeof c.charSet == "string" ? At(y.charsetChunks, c, "meta") : c.name === "viewport" ? At(y.viewportChunks, c, "meta") : At(
              y.hoistableChunks,
              c,
              "meta"
            );
          return kf;
        case "listing":
        case "pre":
          e.push(Bn(t));
          var qs = null, $s = null, ef;
          for (ef in c)
            if (zn.call(c, ef)) {
              var ff = c[ef];
              if (ff != null)
                switch (ef) {
                  case "children":
                    qs = ff;
                    break;
                  case "dangerouslySetInnerHTML":
                    $s = ff;
                    break;
                  default:
                    xn(
                      e,
                      ef,
                      ff
                    );
                }
            }
          if (e.push(yt), $s != null) {
            if (qs != null)
              throw Error(
                "Can only set one of `children` or `props.dangerouslySetInnerHTML`."
              );
            if (typeof $s != "object" || !("__html" in $s))
              throw Error(
                "`props.dangerouslySetInnerHTML` must be in the form `{__html: ...}`. Please visit https://react.dev/link/dangerously-set-inner-html for more information."
              );
            var Os = $s.__html;
            Os != null && (typeof Os == "string" && 0 < Os.length && Os[0] === `
` ? e.push(lu, ee(Os)) : (Ve(Os), e.push(ee("" + Os))));
          }
          return typeof qs == "string" && qs[0] === `
` && e.push(lu), qs;
        case "img":
          var Kf = M.tagScope & 3, ra = c.src, Di = c.srcSet;
          if (!(c.loading === "lazy" || !ra && !Di || typeof ra != "string" && ra != null || typeof Di != "string" && Di != null || c.fetchPriority === "low" || Kf) && (typeof ra != "string" || ra[4] !== ":" || ra[0] !== "d" && ra[0] !== "D" || ra[1] !== "a" && ra[1] !== "A" || ra[2] !== "t" && ra[2] !== "T" || ra[3] !== "a" && ra[3] !== "A") && (typeof Di != "string" || Di[4] !== ":" || Di[0] !== "d" && Di[0] !== "D" || Di[1] !== "a" && Di[1] !== "A" || Di[2] !== "t" && Di[2] !== "T" || Di[3] !== "a" && Di[3] !== "A")) {
            S !== null && M.tagScope & 64 && (S.suspenseyImages = !0);
            var Sf = typeof c.sizes == "string" ? c.sizes : void 0, Vs = Di ? Di + `
` + (Sf || "") : ra, wf = y.preloads.images, Hs = wf.get(Vs);
            if (Hs)
              (c.fetchPriority === "high" || 10 > y.highImagePreloads.size) && (wf.delete(Vs), y.highImagePreloads.add(Hs));
            else if (!h.imageResources.hasOwnProperty(Vs)) {
              h.imageResources[Vs] = qt;
              var pf = c.crossOrigin, Af = typeof pf == "string" ? pf === "use-credentials" ? pf : "" : void 0, Us = y.headers, Tf;
              Us && 0 < Us.remainingCapacity && typeof c.srcSet != "string" && (c.fetchPriority === "high" || 500 > Us.highImagePreloads.length) && (Tf = oa(ra, "image", {
                imageSrcSet: c.srcSet,
                imageSizes: c.sizes,
                crossOrigin: Af,
                integrity: c.integrity,
                nonce: c.nonce,
                type: c.type,
                fetchPriority: c.fetchPriority,
                referrerPolicy: c.refererPolicy
              }), 0 <= (Us.remainingCapacity -= Tf.length + 2)) ? (y.resets.image[Vs] = qt, Us.highImagePreloads && (Us.highImagePreloads += ", "), Us.highImagePreloads += Tf) : (Hs = [], De(Hs, {
                rel: "preload",
                as: "image",
                href: Di ? void 0 : ra,
                imageSrcSet: Di,
                imageSizes: Sf,
                crossOrigin: Af,
                integrity: c.integrity,
                type: c.type,
                fetchPriority: c.fetchPriority,
                referrerPolicy: c.referrerPolicy
              }), c.fetchPriority === "high" || 10 > y.highImagePreloads.size ? y.highImagePreloads.add(Hs) : (y.bulkPreloads.add(Hs), wf.set(Vs, Hs)));
            }
          }
          return At(e, c, "img");
        case "base":
        case "area":
        case "br":
        case "col":
        case "embed":
        case "hr":
        case "keygen":
        case "param":
        case "source":
        case "track":
        case "wbr":
          return At(e, c, t);
        case "annotation-xml":
        case "color-profile":
        case "font-face":
        case "font-face-src":
        case "font-face-uri":
        case "font-face-format":
        case "font-face-name":
        case "missing-glyph":
          break;
        case "head":
          if (M.insertionMode < mr) {
            var xf = x || y.preamble;
            if (xf.headChunks)
              throw Error("The `<head>` tag may only be rendered once.");
            x !== null && e.push(Sc), xf.headChunks = [];
            var Pf = vn(
              xf.headChunks,
              c,
              "head"
            );
          } else
            Pf = rr(
              e,
              c,
              "head"
            );
          return Pf;
        case "body":
          if (M.insertionMode < mr) {
            var Ef = x || y.preamble;
            if (Ef.bodyChunks)
              throw Error("The `<body>` tag may only be rendered once.");
            x !== null && e.push(_u), Ef.bodyChunks = [];
            var Ff = vn(
              Ef.bodyChunks,
              c,
              "body"
            );
          } else
            Ff = rr(
              e,
              c,
              "body"
            );
          return Ff;
        case "html":
          if (M.insertionMode === No) {
            var Rf = x || y.preamble;
            if (Rf.htmlChunks)
              throw Error("The `<html>` tag may only be rendered once.");
            x !== null && e.push(zu), Rf.htmlChunks = [Bt];
            var Of = vn(
              Rf.htmlChunks,
              c,
              "html"
            );
          } else
            Of = rr(
              e,
              c,
              "html"
            );
          return Of;
        default:
          if (t.indexOf("-") !== -1) {
            e.push(Bn(t));
            var Cf = null, Mf = null, Ks;
            for (Ks in c)
              if (zn.call(c, Ks)) {
                var mu = c[Ks];
                if (mu != null) {
                  var If = Ks;
                  switch (Ks) {
                    case "children":
                      Cf = mu;
                      break;
                    case "dangerouslySetInnerHTML":
                      Mf = mu;
                      break;
                    case "style":
                      Rt(e, mu);
                      break;
                    case "suppressContentEditableWarning":
                    case "suppressHydrationWarning":
                    case "ref":
                      break;
                    case "className":
                      If = "class";
                    default:
                      if (Et(Ks) && typeof mu != "function" && typeof mu != "symbol" && mu !== !1) {
                        if (mu === !0)
                          mu = "";
                        else if (typeof mu == "object")
                          continue;
                        e.push(
                          Ot,
                          ee(If),
                          Cl,
                          ee(
                            Ae(mu)
                          ),
                          un
                        );
                      }
                  }
                }
              }
            return e.push(yt), St(
              e,
              Mf,
              Cf
            ), Cf;
          }
      }
      return rr(e, c, t);
    }
    function ht(e) {
      var t = iu.get(e);
      return t === void 0 && (t = X("</" + e + ">"), iu.set(e, t)), t;
    }
    function To(e, t) {
      e = e.preamble, e.htmlChunks === null && t.htmlChunks && (e.htmlChunks = t.htmlChunks), e.headChunks === null && t.headChunks && (e.headChunks = t.headChunks), e.bodyChunks === null && t.bodyChunks && (e.bodyChunks = t.bodyChunks);
    }
    function xo(e, t) {
      t = t.bootstrapChunks;
      for (var c = 0; c < t.length - 1; c++)
        P(e, t[c]);
      return c < t.length ? (c = t[c], t.length = 0, N(e, c)) : !0;
    }
    function el(e, t, c) {
      if (P(e, Ra), c === null)
        throw Error(
          "An ID must have been assigned before we can complete the boundary."
        );
      return P(e, t.boundaryPrefix), P(e, ee(c.toString(16))), N(e, Ml);
    }
    function aa(e, t, c, h) {
      switch (c.insertionMode) {
        case No:
        case pa:
        case Ec:
        case mr:
          return P(e, ss), P(e, t.segmentPrefix), P(e, ee(h.toString(16))), N(e, li);
        case kr:
          return P(e, ml), P(e, t.segmentPrefix), P(e, ee(h.toString(16))), N(e, ka);
        case Rl:
          return P(e, Il), P(e, t.segmentPrefix), P(e, ee(h.toString(16))), N(e, Yu);
        case Ji:
          return P(e, Uo), P(e, t.segmentPrefix), P(e, ee(h.toString(16))), N(e, l);
        case Rc:
          return P(e, s), P(e, t.segmentPrefix), P(e, ee(h.toString(16))), N(e, v);
        case Vi:
          return P(e, C), P(e, t.segmentPrefix), P(e, ee(h.toString(16))), N(e, k);
        case nu:
          return P(e, O), P(e, t.segmentPrefix), P(e, ee(h.toString(16))), N(e, z);
        default:
          throw Error("Unknown insertion mode. This is a bug in React.");
      }
    }
    function fi(e, t) {
      switch (t.insertionMode) {
        case No:
        case pa:
        case Ec:
        case mr:
          return N(e, Ho);
        case kr:
          return N(e, ro);
        case Rl:
          return N(e, fs);
        case Ji:
          return N(e, a);
        case Rc:
          return N(e, w);
        case Vi:
          return N(e, _);
        case nu:
          return N(e, Z);
        default:
          throw Error("Unknown insertion mode. This is a bug in React.");
      }
    }
    function Zl(e) {
      return JSON.stringify(e).replace(
        Nl,
        function(t) {
          switch (t) {
            case "<":
              return "\\u003c";
            case "\u2028":
              return "\\u2028";
            case "\u2029":
              return "\\u2029";
            default:
              throw Error(
                "escapeJSStringsForInstructionScripts encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
              );
          }
        }
      );
    }
    function Ql(e) {
      return JSON.stringify(e).replace(
        Fr,
        function(t) {
          switch (t) {
            case "&":
              return "\\u0026";
            case ">":
              return "\\u003e";
            case "<":
              return "\\u003c";
            case "\u2028":
              return "\\u2028";
            case "\u2029":
              return "\\u2029";
            default:
              throw Error(
                "escapeJSObjectForInstructionScripts encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
              );
          }
        }
      );
    }
    function yl(e) {
      var t = e.rules, c = e.hrefs;
      0 < t.length && c.length === 0 && console.error(
        "React expected to have at least one href for an a hoistable style but found none. This is a bug in React."
      );
      var h = 0;
      if (c.length) {
        for (P(this, sn.startInlineStyle), P(this, ii), P(this, e.precedence), P(this, Or); h < c.length - 1; h++)
          P(this, c[h]), P(this, ot);
        for (P(this, c[h]), P(this, io), h = 0; h < t.length; h++) P(this, t[h]);
        Yo = N(
          this,
          Wo
        ), Jr = !0, t.length = 0, c.length = 0;
      }
    }
    function R(e) {
      return e.state !== Ci ? Jr = !0 : !1;
    }
    function L(e, t, c) {
      return Jr = !1, Yo = !0, sn = c, t.styles.forEach(yl, e), sn = null, t.stylesheets.forEach(R), Jr && (c.stylesToHoist = !0), Yo;
    }
    function ne(e) {
      for (var t = 0; t < e.length; t++) P(this, e[t]);
      e.length = 0;
    }
    function Ee(e) {
      De(Mr, e.props);
      for (var t = 0; t < Mr.length; t++)
        P(this, Mr[t]);
      Mr.length = 0, e.state = Ci;
    }
    function Fe(e) {
      var t = 0 < e.sheets.size;
      e.sheets.forEach(Ee, this), e.sheets.clear();
      var c = e.rules, h = e.hrefs;
      if (!t || h.length) {
        if (P(this, sn.startInlineStyle), P(this, ao), P(this, e.precedence), e = 0, h.length) {
          for (P(this, Gu); e < h.length - 1; e++)
            P(this, h[e]), P(this, ot);
          P(this, h[e]);
        }
        for (P(this, Go), e = 0; e < c.length; e++)
          P(this, c[e]);
        P(this, ai), c.length = 0, h.length = 0;
      }
    }
    function ln(e) {
      if (e.state === Sa) {
        e.state = hu;
        var t = e.props;
        for (De(Mr, {
          rel: "preload",
          as: "style",
          href: e.props.href,
          crossOrigin: t.crossOrigin,
          fetchPriority: t.fetchPriority,
          integrity: t.integrity,
          media: t.media,
          hrefLang: t.hrefLang,
          referrerPolicy: t.referrerPolicy
        }), e = 0; e < Mr.length; e++)
          P(this, Mr[e]);
        Mr.length = 0;
      }
    }
    function Ke(e) {
      e.sheets.forEach(ln, this), e.sheets.clear();
    }
    function an(e, t) {
      (t.instructions & An) === vt && (t.instructions |= An, e.push(
        uu,
        ee(
          Ae("_" + t.idPrefix + "R_")
        ),
        un
      ));
    }
    function We(e, t) {
      P(e, oo);
      var c = oo;
      t.stylesheets.forEach(function(h) {
        if (h.state !== Ci)
          if (h.state === co)
            P(e, c), h = h.props.href, Vn(h, "href"), P(
              e,
              ee(
                Ql("" + h)
              )
            ), P(e, Xo), c = su;
          else {
            P(e, c);
            var y = h.props["data-precedence"], x = h.props, S = J("" + h.props.href);
            P(
              e,
              ee(Ql(S))
            ), Vn(y, "precedence"), y = "" + y, P(e, fu), P(
              e,
              ee(Ql(y))
            );
            for (var M in x)
              if (zn.call(x, M) && (y = x[M], y != null))
                switch (M) {
                  case "href":
                  case "rel":
                  case "precedence":
                  case "data-precedence":
                    break;
                  case "children":
                  case "dangerouslySetInnerHTML":
                    throw Error(
                      "link is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
                    );
                  default:
                    Jl(
                      e,
                      M,
                      y
                    );
                }
            P(e, Xo), c = su, h.state = co;
          }
      }), P(e, Xo);
    }
    function Jl(e, t, c) {
      var h = t.toLowerCase();
      switch (typeof c) {
        case "function":
        case "symbol":
          return;
      }
      switch (t) {
        case "innerHTML":
        case "dangerouslySetInnerHTML":
        case "suppressContentEditableWarning":
        case "suppressHydrationWarning":
        case "style":
        case "ref":
          return;
        case "className":
          h = "class", Vn(c, h), t = "" + c;
          break;
        case "hidden":
          if (c === !1) return;
          t = "";
          break;
        case "src":
        case "href":
          c = J(c), Vn(c, h), t = "" + c;
          break;
        default:
          if (2 < t.length && (t[0] === "o" || t[0] === "O") && (t[1] === "n" || t[1] === "N") || !Et(t))
            return;
          Vn(c, h), t = "" + c;
      }
      P(e, fu), P(
        e,
        ee(Ql(h))
      ), P(e, fu), P(
        e,
        ee(Ql(t))
      );
    }
    function nl() {
      return { styles: /* @__PURE__ */ new Set(), stylesheets: /* @__PURE__ */ new Set(), suspenseyImages: !1 };
    }
    function dt(e, t, c, h) {
      (e.scriptResources.hasOwnProperty(c) || e.moduleScriptResources.hasOwnProperty(c)) && console.error(
        'Internal React Error: React expected bootstrap script or module with src "%s" to not have been preloaded already. please file an issue',
        c
      ), e.scriptResources[c] = Pn, e.moduleScriptResources[c] = Pn, e = [], De(e, h), t.bootstrapScripts.add(e);
    }
    function hi(e, t) {
      e.crossOrigin == null && (e.crossOrigin = t[0]), e.integrity == null && (e.integrity = t[1]);
    }
    function oa(e, t, c) {
      e = La(e), t = tl(t, "as"), t = "<" + e + '>; rel=preload; as="' + t + '"';
      for (var h in c)
        zn.call(c, h) && (e = c[h], typeof e == "string" && (t += "; " + h.toLowerCase() + '="' + tl(
          e,
          h
        ) + '"'));
      return t;
    }
    function La(e) {
      return Vn(e, "href"), ("" + e).replace(
        uo,
        ur
      );
    }
    function ur(e) {
      switch (e) {
        case "<":
          return "%3C";
        case ">":
          return "%3E";
        case `
`:
          return "%0A";
        case "\r":
          return "%0D";
        default:
          throw Error(
            "escapeLinkHrefForHeaderContextReplacer encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
          );
      }
    }
    function tl(e, t) {
      return Gl(e) && (console.error(
        "The provided `%s` option is an unsupported type %s. This value must be coerced to a string before using it here.",
        t,
        Yt(e)
      ), Hr(e)), ("" + e).replace(
        hs,
        Yn
      );
    }
    function Yn(e) {
      switch (e) {
        case '"':
          return "%22";
        case "'":
          return "%27";
        case ";":
          return "%3B";
        case ",":
          return "%2C";
        case `
`:
          return "%0A";
        case "\r":
          return "%0D";
        default:
          throw Error(
            "escapeStringForLinkHeaderQuotedParamValueContextReplacer encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
          );
      }
    }
    function lc(e) {
      this.styles.add(e);
    }
    function bl(e) {
      this.stylesheets.add(e);
    }
    function Cn(e, t) {
      t.styles.forEach(lc, e), t.stylesheets.forEach(bl, e), t.suspenseyImages && (e.suspenseyImages = !0);
    }
    function es(e) {
      return 0 < e.stylesheets.size || e.suspenseyImages;
    }
    function dn(e) {
      if (e == null) return null;
      if (typeof e == "function")
        return e.$$typeof === ds ? null : e.displayName || e.name || null;
      if (typeof e == "string") return e;
      switch (e) {
        case Yi:
          return "Fragment";
        case pc:
          return "Profiler";
        case wc:
          return "StrictMode";
        case va:
          return "Suspense";
        case Ga:
          return "SuspenseList";
        case lr:
          return "Activity";
      }
      if (typeof e == "object")
        switch (typeof e.tag == "number" && console.error(
          "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
        ), e.$$typeof) {
          case bc:
            return "Portal";
          case it:
            return e.displayName || "Context";
          case Xr:
            return (e._context.displayName || "Context") + ".Consumer";
          case kn:
            var t = e.render;
            return e = e.displayName, e || (e = t.displayName || t.name || "", e = e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef"), e;
          case Xa:
            return t = e.displayName || null, t !== null ? t : dn(e.type) || "Memo";
          case ya:
            t = e._payload, e = e._init;
            try {
              return dn(e(t));
            } catch {
            }
        }
      return null;
    }
    function ic(e, t) {
      if (e !== t) {
        e.context._currentValue = e.parentValue, e = e.parent;
        var c = t.parent;
        if (e === null) {
          if (c !== null)
            throw Error(
              "The stacks must reach the root at the same time. This is a bug in React."
            );
        } else {
          if (c === null)
            throw Error(
              "The stacks must reach the root at the same time. This is a bug in React."
            );
          ic(e, c);
        }
        t.context._currentValue = t.value;
      }
    }
    function ac(e) {
      e.context._currentValue = e.parentValue, e = e.parent, e !== null && ac(e);
    }
    function oc(e) {
      var t = e.parent;
      t !== null && oc(t), e.context._currentValue = e.value;
    }
    function di(e, t) {
      if (e.context._currentValue = e.parentValue, e = e.parent, e === null)
        throw Error(
          "The depth must equal at least at zero before reaching the root. This is a bug in React."
        );
      e.depth === t.depth ? ic(e, t) : di(e, t);
    }
    function _n(e, t) {
      var c = t.parent;
      if (c === null)
        throw Error(
          "The depth must equal at least at zero before reaching the root. This is a bug in React."
        );
      e.depth === c.depth ? ic(e, c) : _n(e, c), t.context._currentValue = t.value;
    }
    function mn(e) {
      var t = qi;
      t !== e && (t === null ? oc(e) : e === null ? ac(t) : t.depth === e.depth ? ic(t, e) : t.depth > e.depth ? di(t, e) : _n(t, e), qi = e);
    }
    function Vl(e) {
      if (e !== null && typeof e != "function") {
        var t = String(e);
        Zu.has(t) || (Zu.add(t), console.error(
          "Expected the last optional `callback` argument to be a function. Instead received: %s.",
          e
        ));
      }
    }
    function sr(e, t) {
      e = (e = e.constructor) && dn(e) || "ReactClass";
      var c = e + "." + t;
      du[c] || (console.error(
        `Can only update a mounting component. This usually means you called %s() outside componentWillMount() on the server. This is a no-op.

Please check the code for the %s component.`,
        t,
        e
      ), du[c] = !0);
    }
    function Ba(e, t, c) {
      var h = e.id;
      e = e.overflow;
      var y = 32 - Qo(h) - 1;
      h &= ~(1 << y), c += 1;
      var x = 32 - Qo(t) + y;
      if (30 < x) {
        var S = y - y % 5;
        return x = (h & (1 << S) - 1).toString(32), h >>= S, y -= S, {
          id: 1 << 32 - Qo(t) + y | c << y | h,
          overflow: x + e
        };
      }
      return {
        id: 1 << x | c << y | h,
        overflow: e
      };
    }
    function Wc(e) {
      return e >>>= 0, e === 0 ? 32 : 31 - (Is(e) / Ds | 0) | 0;
    }
    function Er() {
    }
    function ns(e, t, c) {
      switch (c = e[c], c === void 0 ? e.push(t) : c !== t && (t.then(Er, Er), t = c), t.status) {
        case "fulfilled":
          return t.value;
        case "rejected":
          throw t.reason;
        default:
          switch (typeof t.status == "string" ? t.then(Er, Er) : (e = t, e.status = "pending", e.then(
            function(h) {
              if (t.status === "pending") {
                var y = t;
                y.status = "fulfilled", y.value = h;
              }
            },
            function(h) {
              if (t.status === "pending") {
                var y = t;
                y.status = "rejected", y.reason = h;
              }
            }
          )), t.status) {
            case "fulfilled":
              return t.value;
            case "rejected":
              throw t.reason;
          }
          throw ys = t, mi;
      }
    }
    function ku() {
      if (ys === null)
        throw Error(
          "Expected a suspended thenable. This is a bug in React. Please file an issue."
        );
      var e = ys;
      return ys = null, e;
    }
    function Yc(e, t) {
      return e === t && (e !== 0 || 1 / e === 1 / t) || e !== e && t !== t;
    }
    function rt() {
      if (ar === null)
        throw Error(
          `Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:
1. You might have mismatching versions of React and the renderer (such as React DOM)
2. You might be breaking the Rules of Hooks
3. You might have more than one copy of React in the same app
See https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.`
        );
      return oi && console.error(
        "Do not call Hooks inside useEffect(...), useMemo(...), or other built-in Hooks. You can only call Hooks at the top level of your React function. For more information, see https://react.dev/link/rules-of-hooks"
      ), ar;
    }
    function Gc() {
      if (0 < Ic)
        throw Error("Rendered more hooks than during the previous render");
      return { memoizedState: null, queue: null, next: null };
    }
    function Eo() {
      return Nn === null ? Bl === null ? (il = !1, Bl = Nn = Gc()) : (il = !0, Nn = Bl) : Nn.next === null ? (il = !1, Nn = Nn.next = Gc()) : (il = !0, Nn = Nn.next), Nn;
    }
    function wl() {
      var e = Jo;
      return Jo = null, e;
    }
    function _a() {
      oi = !1, Pa = Ir = $i = ar = null, ea = !1, Bl = null, Ic = 0, Nn = fo = null;
    }
    function ts(e) {
      return oi && console.error(
        "Context can only be read while React is rendering. In classes, you can read it in the render method or getDerivedStateFromProps. In function components, you can read it directly in the function body, but not inside Hooks like useReducer() or useMemo()."
      ), e._currentValue;
    }
    function rs(e, t) {
      return typeof t == "function" ? t(e) : t;
    }
    function Ro(e, t, c) {
      if (e !== rs && (ho = "useReducer"), ar = rt(), Nn = Eo(), il) {
        if (c = Nn.queue, t = c.dispatch, fo !== null) {
          var h = fo.get(c);
          if (h !== void 0) {
            fo.delete(c), c = Nn.memoizedState;
            do {
              var y = h.action;
              oi = !0, c = e(c, y), oi = !1, h = h.next;
            } while (h !== null);
            return Nn.memoizedState = c, [c, t];
          }
        }
        return [Nn.memoizedState, t];
      }
      return oi = !0, e = e === rs ? typeof t == "function" ? t() : t : c !== void 0 ? c(t) : t, oi = !1, Nn.memoizedState = e, e = Nn.queue = { last: null, dispatch: null }, e = e.dispatch = gi.bind(
        null,
        ar,
        e
      ), [Nn.memoizedState, e];
    }
    function Co(e, t) {
      if (ar = rt(), Nn = Eo(), t = t === void 0 ? null : t, Nn !== null) {
        var c = Nn.memoizedState;
        if (c !== null && t !== null) {
          e: {
            var h = c[1];
            if (h === null)
              console.error(
                "%s received a final argument during this render, but not during the previous render. Even though the final argument is optional, its type cannot change between renders.",
                ho
              ), h = !1;
            else {
              t.length !== h.length && console.error(
                `The final argument passed to %s changed size between renders. The order and size of this array must remain constant.

Previous: %s
Incoming: %s`,
                ho,
                "[" + t.join(", ") + "]",
                "[" + h.join(", ") + "]"
              );
              for (var y = 0; y < h.length && y < t.length; y++)
                if (!Ns(t[y], h[y])) {
                  h = !1;
                  break e;
                }
              h = !0;
            }
          }
          if (h) return c[0];
        }
      }
      return oi = !0, e = e(), oi = !1, Nn.memoizedState = [e, t], e;
    }
    function gi(e, t, c) {
      if (25 <= Ic)
        throw Error(
          "Too many re-renders. React limits the number of renders to prevent an infinite loop."
        );
      if (e === ar)
        if (ea = !0, e = { action: c, next: null }, fo === null && (fo = /* @__PURE__ */ new Map()), c = fo.get(t), c === void 0)
          fo.set(t, e);
        else {
          for (t = c; t.next !== null; ) t = t.next;
          t.next = e;
        }
    }
    function vi() {
      throw Error(
        "A function wrapped in useEffectEvent can't be called during rendering."
      );
    }
    function Xc() {
      throw Error("startTransition cannot be called during server rendering.");
    }
    function cc() {
      throw Error("Cannot update optimistic state while rendering.");
    }
    function uc(e, t, c) {
      rt();
      var h = Mc++, y = Ir;
      if (typeof e.$$FORM_ACTION == "function") {
        var x = null, S = Pa;
        y = y.formState;
        var M = e.$$IS_SIGNATURE_EQUAL;
        if (y !== null && typeof M == "function") {
          var V = y[1];
          M.call(e, y[2], y[3]) && (x = c !== void 0 ? "p" + c : "k" + Re(
            JSON.stringify([
              S,
              null,
              h
            ]),
            0
          ), V === x && (wu = h, t = y[0]));
        }
        var B = e.bind(null, t);
        return e = function(oe) {
          B(oe);
        }, typeof B.$$FORM_ACTION == "function" && (e.$$FORM_ACTION = function(oe) {
          oe = B.$$FORM_ACTION(oe), c !== void 0 && (Vn(c, "target"), c += "", oe.action = c);
          var se = oe.data;
          return se && (x === null && (x = c !== void 0 ? "p" + c : "k" + Re(
            JSON.stringify([
              S,
              null,
              h
            ]),
            0
          )), se.append("$ACTION_KEY", x)), oe;
        }), [t, e, !1];
      }
      var U = e.bind(null, t);
      return [
        t,
        function(oe) {
          U(oe);
        },
        !1
      ];
    }
    function Zt(e) {
      var t = bs;
      return bs += 1, Jo === null && (Jo = []), ns(Jo, e, t);
    }
    function mo() {
      throw Error("Cache cannot be refreshed during server rendering.");
    }
    function sc() {
    }
    function Zc() {
      if (d === 0) {
        b = console.log, E = console.info, F = console.warn, D = console.error, te = console.group, H = console.groupCollapsed, j = console.groupEnd;
        var e = {
          configurable: !0,
          enumerable: !0,
          value: sc,
          writable: !0
        };
        Object.defineProperties(console, {
          info: e,
          log: e,
          warn: e,
          error: e,
          group: e,
          groupCollapsed: e,
          groupEnd: e
        });
      }
      d++;
    }
    function yi() {
      if (d--, d === 0) {
        var e = { configurable: !0, enumerable: !0, writable: !0 };
        Object.defineProperties(console, {
          log: qn({}, e, { value: b }),
          info: qn({}, e, { value: E }),
          warn: qn({}, e, { value: F }),
          error: qn({}, e, { value: D }),
          group: qn({}, e, { value: te }),
          groupCollapsed: qn({}, e, { value: H }),
          groupEnd: qn({}, e, { value: j })
        });
      }
      0 > d && console.error(
        "disabledDepth fell below zero. This is a bug in React. Please file an issue."
      );
    }
    function fc(e) {
      var t = Error.prepareStackTrace;
      if (Error.prepareStackTrace = void 0, e = e.stack, Error.prepareStackTrace = t, e.startsWith(`Error: react-stack-top-frame
`) && (e = e.slice(29)), t = e.indexOf(`
`), t !== -1 && (e = e.slice(t + 1)), t = e.indexOf("react_stack_bottom_frame"), t !== -1 && (t = e.lastIndexOf(
        `
`,
        t
      )), t !== -1)
        e = e.slice(0, t);
      else return "";
      return e;
    }
    function Ur(e) {
      if (ge === void 0)
        try {
          throw Error();
        } catch (c) {
          var t = c.stack.trim().match(/\n( *(at )?)/);
          ge = t && t[1] || "", Ce = -1 < c.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < c.stack.indexOf("@") ? "@unknown:0:0" : "";
        }
      return `
` + ge + e + Ce;
    }
    function Kl(e, t) {
      if (!e || ye) return "";
      var c = ae.get(e);
      if (c !== void 0) return c;
      ye = !0, c = Error.prepareStackTrace, Error.prepareStackTrace = void 0;
      var h = null;
      h = cn.H, cn.H = null, Zc();
      try {
        var y = {
          DetermineComponentFrameRoot: function() {
            try {
              if (t) {
                var se = function() {
                  throw Error();
                };
                if (Object.defineProperty(se.prototype, "props", {
                  set: function() {
                    throw Error();
                  }
                }), typeof Reflect == "object" && Reflect.construct) {
                  try {
                    Reflect.construct(se, []);
                  } catch (le) {
                    var ce = le;
                  }
                  Reflect.construct(e, [], se);
                } else {
                  try {
                    se.call();
                  } catch (le) {
                    ce = le;
                  }
                  e.call(se.prototype);
                }
              } else {
                try {
                  throw Error();
                } catch (le) {
                  ce = le;
                }
                (se = e()) && typeof se.catch == "function" && se.catch(function() {
                });
              }
            } catch (le) {
              if (le && ce && typeof le.stack == "string")
                return [le.stack, ce.stack];
            }
            return [null, null];
          }
        };
        y.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
        var x = Object.getOwnPropertyDescriptor(
          y.DetermineComponentFrameRoot,
          "name"
        );
        x && x.configurable && Object.defineProperty(
          y.DetermineComponentFrameRoot,
          "name",
          { value: "DetermineComponentFrameRoot" }
        );
        var S = y.DetermineComponentFrameRoot(), M = S[0], V = S[1];
        if (M && V) {
          var B = M.split(`
`), U = V.split(`
`);
          for (S = x = 0; x < B.length && !B[x].includes(
            "DetermineComponentFrameRoot"
          ); )
            x++;
          for (; S < U.length && !U[S].includes(
            "DetermineComponentFrameRoot"
          ); )
            S++;
          if (x === B.length || S === U.length)
            for (x = B.length - 1, S = U.length - 1; 1 <= x && 0 <= S && B[x] !== U[S]; )
              S--;
          for (; 1 <= x && 0 <= S; x--, S--)
            if (B[x] !== U[S]) {
              if (x !== 1 || S !== 1)
                do
                  if (x--, S--, 0 > S || B[x] !== U[S]) {
                    var oe = `
` + B[x].replace(
                      " at new ",
                      " at "
                    );
                    return e.displayName && oe.includes("<anonymous>") && (oe = oe.replace("<anonymous>", e.displayName)), typeof e == "function" && ae.set(e, oe), oe;
                  }
                while (1 <= x && 0 <= S);
              break;
            }
        }
      } finally {
        ye = !1, cn.H = h, yi(), Error.prepareStackTrace = c;
      }
      return B = (B = e ? e.displayName || e.name : "") ? Ur(B) : "", typeof e == "function" && ae.set(e, B), B;
    }
    function Su(e) {
      if (typeof e == "string") return Ur(e);
      if (typeof e == "function")
        return e.prototype && e.prototype.isReactComponent ? Kl(e, !0) : Kl(e, !1);
      if (typeof e == "object" && e !== null) {
        switch (e.$$typeof) {
          case kn:
            return Kl(e.render, !1);
          case Xa:
            return Kl(e.type, !1);
          case ya:
            var t = e, c = t._payload;
            t = t._init;
            try {
              e = t(c);
            } catch {
              return Ur("Lazy");
            }
            return Su(e);
        }
        if (typeof e.name == "string") {
          e: {
            if (c = e.name, t = e.env, e = e.debugLocation, e != null) {
              e = fc(e);
              var h = e.lastIndexOf(`
`);
              if (e = h === -1 ? e : e.slice(h + 1), e.indexOf(c) !== -1) {
                c = `
` + e;
                break e;
              }
            }
            c = Ur(
              c + (t ? " [" + t + "]" : "")
            );
          }
          return c;
        }
      }
      switch (e) {
        case Ga:
          return Ur("SuspenseList");
        case va:
          return Ur("Suspense");
      }
      return "";
    }
    function hc() {
      var e = ki();
      1e3 < e - In && (cn.recentlyCreatedOwnerStacks = 0, In = e);
    }
    function Wr(e, t) {
      return (500 < t.byteSize || es(t.contentState)) && t.contentPreamble === null;
    }
    function dc(e) {
      if (typeof e == "object" && e !== null && typeof e.environmentName == "string") {
        var t = e.environmentName;
        e = [e].slice(0), typeof e[0] == "string" ? e.splice(
          0,
          1,
          "%c%s%c " + e[0],
          "background: #e6e6e6;background: light-dark(rgba(0,0,0,0.1), rgba(255,255,255,0.25));color: #000000;color: light-dark(#000000, #ffffff);border-radius: 2px",
          " " + t + " ",
          ""
        ) : e.splice(
          0,
          0,
          "%c%s%c",
          "background: #e6e6e6;background: light-dark(rgba(0,0,0,0.1), rgba(255,255,255,0.25));color: #000000;color: light-dark(#000000, #ffffff);border-radius: 2px",
          " " + t + " ",
          ""
        ), e.unshift(console), t = Ll.apply(console.error, e), t();
      } else console.error(e);
      return null;
    }
    function ca(e, t, c, h, y, x, S, M, V, B, U) {
      var oe = /* @__PURE__ */ new Set();
      this.destination = null, this.flushScheduled = !1, this.resumableState = e, this.renderState = t, this.rootFormatContext = c, this.progressiveChunkSize = h === void 0 ? 12800 : h, this.status = 10, this.fatalError = null, this.pendingRootTasks = this.allPendingTasks = this.nextSegmentId = 0, this.completedPreambleSegments = this.completedRootSegment = null, this.byteSize = 0, this.abortableTasks = oe, this.pingedTasks = [], this.clientRenderedBoundaries = [], this.completedBoundaries = [], this.partialBoundaries = [], this.trackedPostpones = null, this.onError = y === void 0 ? dc : y, this.onPostpone = B === void 0 ? Er : B, this.onAllReady = x === void 0 ? Er : x, this.onShellReady = S === void 0 ? Er : S, this.onShellError = M === void 0 ? Er : M, this.onFatalError = V === void 0 ? Er : V, this.formState = U === void 0 ? null : U, this.didWarnForKey = null;
    }
    function ko(e, t, c, h, y, x, S, M, V, B, U, oe) {
      return hc(), t = new ca(
        t,
        c,
        h,
        y,
        x,
        S,
        M,
        V,
        B,
        U,
        oe
      ), c = Li(
        t,
        0,
        null,
        h,
        !1,
        !1
      ), c.parentFlushed = !0, e = jl(
        t,
        null,
        e,
        -1,
        null,
        c,
        null,
        null,
        t.abortableTasks,
        null,
        h,
        null,
        bu,
        null,
        null,
        kl,
        null
      ), _i(e), t.pingedTasks.push(e), t;
    }
    function Yr(e, t, c, h, y, x, S, M, V, B, U) {
      return e = ko(
        e,
        t,
        c,
        h,
        y,
        x,
        S,
        M,
        V,
        B,
        U,
        void 0
      ), e.trackedPostpones = {
        workingMap: /* @__PURE__ */ new Map(),
        rootNodes: [],
        rootSlots: null
      }, e;
    }
    function Kt(e, t, c, h, y, x, S, M, V) {
      return hc(), c = new ca(
        t.resumableState,
        c,
        t.rootFormatContext,
        t.progressiveChunkSize,
        h,
        y,
        x,
        S,
        M,
        V,
        null
      ), c.nextSegmentId = t.nextSegmentId, typeof t.replaySlots == "number" ? (h = Li(
        c,
        0,
        null,
        t.rootFormatContext,
        !1,
        !1
      ), h.parentFlushed = !0, e = jl(
        c,
        null,
        e,
        -1,
        null,
        h,
        null,
        null,
        c.abortableTasks,
        null,
        t.rootFormatContext,
        null,
        bu,
        null,
        null,
        kl,
        null
      ), _i(e), c.pingedTasks.push(e), c) : (e = Pu(
        c,
        null,
        {
          nodes: t.replayNodes,
          slots: t.replaySlots,
          pendingTasks: 0
        },
        e,
        -1,
        null,
        null,
        c.abortableTasks,
        null,
        t.rootFormatContext,
        null,
        bu,
        null,
        null,
        kl,
        null
      ), _i(e), c.pingedTasks.push(e), c);
    }
    function jn(e, t, c, h, y, x, S, M, V) {
      return e = Kt(
        e,
        t,
        c,
        h,
        y,
        x,
        S,
        M,
        V
      ), e.trackedPostpones = {
        workingMap: /* @__PURE__ */ new Map(),
        rootNodes: [],
        rootSlots: null
      }, e;
    }
    function Au(e, t) {
      e.pingedTasks.push(t), e.pingedTasks.length === 1 && (e.flushScheduled = e.destination !== null, e.trackedPostpones !== null || e.status === 10 ? Qa(function() {
        return ga(e);
      }) : ie(function() {
        return ga(e);
      }));
    }
    function Ni(e, t, c, h, y) {
      return c = {
        status: Hn,
        rootSegmentID: -1,
        parentFlushed: !1,
        pendingTasks: 0,
        row: t,
        completedSegments: [],
        byteSize: 0,
        fallbackAbortableTasks: c,
        errorDigest: null,
        contentState: nl(),
        fallbackState: nl(),
        contentPreamble: h,
        fallbackPreamble: y,
        trackedContentKeyPath: null,
        trackedFallbackNode: null,
        errorMessage: null,
        errorStack: null,
        errorComponentStack: null
      }, t !== null && (t.pendingTasks++, h = t.boundaries, h !== null && (e.allPendingTasks++, c.pendingTasks++, h.push(c)), e = t.inheritedHoistables, e !== null && Cn(c.contentState, e)), c;
    }
    function jl(e, t, c, h, y, x, S, M, V, B, U, oe, se, ce, le, Ue, Zn) {
      e.allPendingTasks++, y === null ? e.pendingRootTasks++ : y.pendingTasks++, ce !== null && ce.pendingTasks++;
      var _e = {
        replay: null,
        node: c,
        childIndex: h,
        ping: function() {
          return Au(e, _e);
        },
        blockedBoundary: y,
        blockedSegment: x,
        blockedPreamble: S,
        hoistableState: M,
        abortSet: V,
        keyPath: B,
        formatContext: U,
        context: oe,
        treeContext: se,
        row: ce,
        componentStack: le,
        thenableState: t
      };
      return _e.debugTask = Zn, V.add(_e), _e;
    }
    function Pu(e, t, c, h, y, x, S, M, V, B, U, oe, se, ce, le, Ue) {
      e.allPendingTasks++, x === null ? e.pendingRootTasks++ : x.pendingTasks++, se !== null && se.pendingTasks++, c.pendingTasks++;
      var Zn = {
        replay: c,
        node: h,
        childIndex: y,
        ping: function() {
          return Au(e, Zn);
        },
        blockedBoundary: x,
        blockedSegment: null,
        blockedPreamble: null,
        hoistableState: S,
        abortSet: M,
        keyPath: V,
        formatContext: B,
        context: U,
        treeContext: oe,
        row: se,
        componentStack: ce,
        thenableState: t
      };
      return Zn.debugTask = Ue, M.add(Zn), Zn;
    }
    function Li(e, t, c, h, y, x) {
      return {
        status: Hn,
        parentFlushed: !1,
        id: -1,
        index: t,
        chunks: [],
        children: [],
        preambleChildren: [],
        parentFormatContext: h,
        boundary: c,
        lastPushedText: y,
        textEmbedded: x
      };
    }
    function bi() {
      if (r === null || r.componentStack === null)
        return "";
      var e = r.componentStack;
      try {
        var t = "";
        if (typeof e.type == "string")
          t += Ur(e.type);
        else if (typeof e.type == "function") {
          if (!e.owner) {
            var c = t, h = e.type, y = h ? h.displayName || h.name : "", x = y ? Ur(y) : "";
            t = c + x;
          }
        } else
          e.owner || (t += Su(e.type));
        for (; e; )
          c = null, e.debugStack != null ? c = fc(
            e.debugStack
          ) : (x = e, x.stack != null && (c = typeof x.stack != "string" ? x.stack = fc(
            x.stack
          ) : x.stack)), (e = e.owner) && c && (t += `
` + c);
        var S = t;
      } catch (M) {
        S = `
Error generating stack: ` + M.message + `
` + M.stack;
      }
      return S;
    }
    function So(e, t) {
      if (t != null)
        for (var c = t.length - 1; 0 <= c; c--) {
          var h = t[c];
          if (typeof h.name == "string" || typeof h.time == "number") break;
          if (h.awaited != null) {
            var y = h.debugStack == null ? h.awaited : h;
            if (y.debugStack !== void 0) {
              e.componentStack = {
                parent: e.componentStack,
                type: h,
                owner: y.owner,
                stack: y.debugStack
              }, e.debugTask = y.debugTask;
              break;
            }
          }
        }
    }
    function Bi(e, t) {
      if (t != null)
        for (var c = 0; c < t.length; c++) {
          var h = t[c];
          typeof h.name == "string" && h.debugStack !== void 0 && (e.componentStack = {
            parent: e.componentStack,
            type: h,
            owner: h.owner,
            stack: h.debugStack
          }, e.debugTask = h.debugTask);
        }
    }
    function _i(e) {
      var t = e.node;
      if (typeof t == "object" && t !== null)
        switch (t.$$typeof) {
          case jc:
            var c = t.type, h = t._owner, y = t._debugStack;
            Bi(e, t._debugInfo), e.debugTask = t._debugTask, e.componentStack = {
              parent: e.componentStack,
              type: c,
              owner: h,
              stack: y
            };
            break;
          case ya:
            Bi(e, t._debugInfo);
            break;
          default:
            typeof t.then == "function" && Bi(e, t._debugInfo);
        }
    }
    function Ao(e) {
      return e === null ? null : {
        parent: e.parent,
        type: "Suspense Fallback",
        owner: e.owner,
        stack: e.stack
      };
    }
    function $e(e) {
      var t = {};
      return e && Object.defineProperty(t, "componentStack", {
        configurable: !0,
        enumerable: !0,
        get: function() {
          try {
            var c = "", h = e;
            do
              c += Su(h.type), h = h.parent;
            while (h);
            var y = c;
          } catch (x) {
            y = `
Error generating stack: ` + x.message + `
` + x.stack;
          }
          return Object.defineProperty(t, "componentStack", {
            value: y
          }), y;
        }
      }), t;
    }
    function ql(e, t, c, h, y) {
      e.errorDigest = t, c instanceof Error ? (t = String(c.message), c = String(c.stack)) : (t = typeof c == "object" && c !== null ? Tn(c) : String(c), c = null), y = y ? `Switched to client rendering because the server rendering aborted due to:

` : `Switched to client rendering because the server rendering errored:

`, e.errorMessage = y + t, e.errorStack = c !== null ? y + c : null, e.errorComponentStack = h.componentStack;
    }
    function It(e, t, c, h) {
      if (e = e.onError, t = h ? h.run(e.bind(null, t, c)) : e(t, c), t != null && typeof t != "string")
        console.error(
          'onError returned something with a type other than "string". onError should return a string and may return null or undefined but must not return anything else. It received something of type "%s" instead',
          typeof t
        );
      else return t;
    }
    function wi(e, t, c, h) {
      c = e.onShellError;
      var y = e.onFatalError;
      h ? (h.run(c.bind(null, t)), h.run(y.bind(null, t))) : (c(t), y(t)), e.destination !== null ? (e.status = Dr, tr(e.destination, t)) : (e.status = 13, e.fatalError = t);
    }
    function Qt(e, t) {
      ua(e, t.next, t.hoistables);
    }
    function ua(e, t, c) {
      for (; t !== null; ) {
        c !== null && (Cn(t.hoistables, c), t.inheritedHoistables = c);
        var h = t.boundaries;
        if (h !== null) {
          t.boundaries = null;
          for (var y = 0; y < h.length; y++) {
            var x = h[y];
            c !== null && Cn(
              x.contentState,
              c
            ), da(e, x, null, null);
          }
        }
        if (t.pendingTasks--, 0 < t.pendingTasks) break;
        c = t.hoistables, t = t.next;
      }
    }
    function za(e, t) {
      var c = t.boundaries;
      if (c !== null && t.pendingTasks === c.length) {
        for (var h = !0, y = 0; y < c.length; y++) {
          var x = c[y];
          if (x.pendingTasks !== 1 || x.parentFlushed || Wr(e, x)) {
            h = !1;
            break;
          }
        }
        h && ua(e, t, t.hoistables);
      }
    }
    function pi(e) {
      var t = {
        pendingTasks: 1,
        boundaries: null,
        hoistables: nl(),
        inheritedHoistables: null,
        together: !1,
        next: null
      };
      return e !== null && 0 < e.pendingTasks && (t.pendingTasks++, t.boundaries = [], e.next = t), t;
    }
    function zi(e, t, c, h, y) {
      var x = t.keyPath, S = t.treeContext, M = t.row, V = t.componentStack, B = t.debugTask;
      Bi(t, t.node.props.children._debugInfo), t.keyPath = c, c = h.length;
      var U = null;
      if (t.replay !== null) {
        var oe = t.replay.slots;
        if (oe !== null && typeof oe == "object")
          for (var se = 0; se < c; se++) {
            var ce = y !== "backwards" && y !== "unstable_legacy-backwards" ? se : c - 1 - se, le = h[ce];
            t.row = U = pi(
              U
            ), t.treeContext = Ba(S, c, ce);
            var Ue = oe[ce];
            typeof Ue == "number" ? (Ha(e, t, Ue, le, ce), delete oe[ce]) : jt(e, t, le, ce), --U.pendingTasks === 0 && Qt(e, U);
          }
        else
          for (oe = 0; oe < c; oe++)
            se = y !== "backwards" && y !== "unstable_legacy-backwards" ? oe : c - 1 - oe, ce = h[se], $l(e, t, ce), t.row = U = pi(U), t.treeContext = Ba(S, c, se), jt(e, t, ce, se), --U.pendingTasks === 0 && Qt(e, U);
      } else if (y !== "backwards" && y !== "unstable_legacy-backwards")
        for (y = 0; y < c; y++)
          oe = h[y], $l(e, t, oe), t.row = U = pi(U), t.treeContext = Ba(
            S,
            c,
            y
          ), jt(e, t, oe, y), --U.pendingTasks === 0 && Qt(e, U);
      else {
        for (y = t.blockedSegment, oe = y.children.length, se = y.chunks.length, ce = c - 1; 0 <= ce; ce--) {
          le = h[ce], t.row = U = pi(
            U
          ), t.treeContext = Ba(S, c, ce), Ue = Li(
            e,
            se,
            null,
            t.formatContext,
            ce === 0 ? y.lastPushedText : !0,
            !0
          ), y.children.splice(oe, 0, Ue), t.blockedSegment = Ue, $l(e, t, le);
          try {
            jt(e, t, le, ce), Ue.lastPushedText && Ue.textEmbedded && Ue.chunks.push(Lt), Ue.status = Un, ei(e, t.blockedBoundary, Ue), --U.pendingTasks === 0 && Qt(e, U);
          } catch (Zn) {
            throw Ue.status = e.status === 12 ? pt : pn, Zn;
          }
        }
        t.blockedSegment = y, y.lastPushedText = !1;
      }
      M !== null && U !== null && 0 < U.pendingTasks && (M.pendingTasks++, U.next = M), t.treeContext = S, t.row = M, t.keyPath = x, t.componentStack = V, t.debugTask = B;
    }
    function Dt(e, t, c, h, y, x) {
      var S = t.thenableState;
      for (t.thenableState = null, ar = {}, $i = t, Ir = e, Pa = c, oi = !1, Mc = _t = 0, wu = -1, bs = 0, Jo = S, e = Jn(h, y, x); ea; )
        ea = !1, Mc = _t = 0, wu = -1, bs = 0, Ic += 1, Nn = null, e = h(y, x);
      return _a(), e;
    }
    function Hi(e, t, c, h, y, x, S) {
      var M = !1;
      if (x !== 0 && e.formState !== null) {
        var V = t.blockedSegment;
        if (V !== null) {
          M = !0, V = V.chunks;
          for (var B = 0; B < x; B++)
            B === S ? V.push(no) : V.push(Ar);
        }
      }
      x = t.keyPath, t.keyPath = c, y ? (c = t.treeContext, t.treeContext = Ba(c, 1, 0), jt(e, t, h, -1), t.treeContext = c) : M ? jt(e, t, h, -1) : Gr(e, t, h, -1), t.keyPath = x;
    }
    function Ui(e, t, c, h, y, x) {
      if (typeof h == "function")
        if (h.prototype && h.prototype.isReactComponent) {
          var S = y;
          if ("ref" in y) {
            S = {};
            for (var M in y)
              M !== "ref" && (S[M] = y[M]);
          }
          var V = h.defaultProps;
          if (V) {
            S === y && (S = qn({}, S, y));
            for (var B in V)
              S[B] === void 0 && (S[B] = V[B]);
          }
          var U = S, oe = kl, se = h.contextType;
          if ("contextType" in h && se !== null && (se === void 0 || se.$$typeof !== it) && !ms.has(h)) {
            ms.add(h);
            var ce = se === void 0 ? " However, it is set to undefined. This can be caused by a typo or by mixing up named and default imports. This can also happen due to a circular dependency, so try moving the createContext() call to a separate file." : typeof se != "object" ? " However, it is set to a " + typeof se + "." : se.$$typeof === Xr ? " Did you accidentally pass the Context.Consumer instead?" : " However, it is set to an object with keys {" + Object.keys(se).join(", ") + "}.";
            console.error(
              "%s defines an invalid contextType. contextType should point to the Context object returned by React.createContext().%s",
              dn(h) || "Component",
              ce
            );
          }
          typeof se == "object" && se !== null && (oe = se._currentValue);
          var le = new h(U, oe);
          if (typeof h.getDerivedStateFromProps == "function" && (le.state === null || le.state === void 0)) {
            var Ue = dn(h) || "Component";
            vu.has(Ue) || (vu.add(Ue), console.error(
              "`%s` uses `getDerivedStateFromProps` but its initial state is %s. This is not recommended. Instead, define the initial state by assigning an object to `this.state` in the constructor of `%s`. This ensures that `getDerivedStateFromProps` arguments have a consistent shape.",
              Ue,
              le.state === null ? "null" : "undefined",
              Ue
            ));
          }
          if (typeof h.getDerivedStateFromProps == "function" || typeof le.getSnapshotBeforeUpdate == "function") {
            var Zn = null, _e = null, hn = null;
            if (typeof le.componentWillMount == "function" && le.componentWillMount.__suppressDeprecationWarning !== !0 ? Zn = "componentWillMount" : typeof le.UNSAFE_componentWillMount == "function" && (Zn = "UNSAFE_componentWillMount"), typeof le.componentWillReceiveProps == "function" && le.componentWillReceiveProps.__suppressDeprecationWarning !== !0 ? _e = "componentWillReceiveProps" : typeof le.UNSAFE_componentWillReceiveProps == "function" && (_e = "UNSAFE_componentWillReceiveProps"), typeof le.componentWillUpdate == "function" && le.componentWillUpdate.__suppressDeprecationWarning !== !0 ? hn = "componentWillUpdate" : typeof le.UNSAFE_componentWillUpdate == "function" && (hn = "UNSAFE_componentWillUpdate"), Zn !== null || _e !== null || hn !== null) {
              var Pt = dn(h) || "Component", zt = typeof h.getDerivedStateFromProps == "function" ? "getDerivedStateFromProps()" : "getSnapshotBeforeUpdate()";
              gs.has(Pt) || (gs.add(
                Pt
              ), console.error(
                `Unsafe legacy lifecycles will not be called for components using new component APIs.

%s uses %s but also contains the following legacy lifecycles:%s%s%s

The above lifecycles should be removed. Learn more about this warning here:
https://react.dev/link/unsafe-component-lifecycles`,
                Pt,
                zt,
                Zn !== null ? `
  ` + Zn : "",
                _e !== null ? `
  ` + _e : "",
                hn !== null ? `
  ` + hn : ""
              ));
            }
          }
          var On = dn(h) || "Component";
          le.render || (h.prototype && typeof h.prototype.render == "function" ? console.error(
            "No `render` method found on the %s instance: did you accidentally return an object from the constructor?",
            On
          ) : console.error(
            "No `render` method found on the %s instance: you may have forgotten to define `render`.",
            On
          )), !le.getInitialState || le.getInitialState.isReactClassApproved || le.state || console.error(
            "getInitialState was defined on %s, a plain JavaScript class. This is only supported for classes created using React.createClass. Did you mean to define a state property instead?",
            On
          ), le.getDefaultProps && !le.getDefaultProps.isReactClassApproved && console.error(
            "getDefaultProps was defined on %s, a plain JavaScript class. This is only supported for classes created using React.createClass. Use a static property to define defaultProps instead.",
            On
          ), le.contextType && console.error(
            "contextType was defined as an instance property on %s. Use a static property to define contextType instead.",
            On
          ), h.childContextTypes && !yu.has(h) && (yu.add(h), console.error(
            "%s uses the legacy childContextTypes API which was removed in React 19. Use React.createContext() instead. (https://react.dev/link/legacy-context)",
            On
          )), h.contextTypes && !vs.has(h) && (vs.add(h), console.error(
            "%s uses the legacy contextTypes API which was removed in React 19. Use React.createContext() with static contextType instead. (https://react.dev/link/legacy-context)",
            On
          )), typeof le.componentShouldUpdate == "function" && console.error(
            "%s has a method called componentShouldUpdate(). Did you mean shouldComponentUpdate()? The name is phrased as a question because the function is expected to return a value.",
            On
          ), h.prototype && h.prototype.isPureReactComponent && typeof le.shouldComponentUpdate < "u" && console.error(
            "%s has a method called shouldComponentUpdate(). shouldComponentUpdate should not be used when extending React.PureComponent. Please extend React.Component if shouldComponentUpdate is used.",
            dn(h) || "A pure component"
          ), typeof le.componentDidUnmount == "function" && console.error(
            "%s has a method called componentDidUnmount(). But there is no such lifecycle method. Did you mean componentWillUnmount()?",
            On
          ), typeof le.componentDidReceiveProps == "function" && console.error(
            "%s has a method called componentDidReceiveProps(). But there is no such lifecycle method. If you meant to update the state in response to changing props, use componentWillReceiveProps(). If you meant to fetch data or run side-effects or mutations after React has updated the UI, use componentDidUpdate().",
            On
          ), typeof le.componentWillRecieveProps == "function" && console.error(
            "%s has a method called componentWillRecieveProps(). Did you mean componentWillReceiveProps()?",
            On
          ), typeof le.UNSAFE_componentWillRecieveProps == "function" && console.error(
            "%s has a method called UNSAFE_componentWillRecieveProps(). Did you mean UNSAFE_componentWillReceiveProps()?",
            On
          );
          var Le = le.props !== U;
          le.props !== void 0 && Le && console.error(
            "When calling super() in `%s`, make sure to pass up the same props that your component's constructor was passed.",
            On
          ), le.defaultProps && console.error(
            "Setting defaultProps as an instance property on %s is not supported and will be ignored. Instead, define defaultProps as a static property on %s.",
            On,
            On
          ), typeof le.getSnapshotBeforeUpdate != "function" || typeof le.componentDidUpdate == "function" || so.has(h) || (so.add(h), console.error(
            "%s: getSnapshotBeforeUpdate() should be used with componentDidUpdate(). This component defines getSnapshotBeforeUpdate() only.",
            dn(h)
          )), typeof le.getDerivedStateFromProps == "function" && console.error(
            "%s: getDerivedStateFromProps() is defined as an instance method and will be ignored. Instead, declare it as a static method.",
            On
          ), typeof le.getDerivedStateFromError == "function" && console.error(
            "%s: getDerivedStateFromError() is defined as an instance method and will be ignored. Instead, declare it as a static method.",
            On
          ), typeof h.getSnapshotBeforeUpdate == "function" && console.error(
            "%s: getSnapshotBeforeUpdate() is defined as a static method and will be ignored. Instead, declare it as an instance method.",
            On
          );
          var Ht = le.state;
          Ht && (typeof Ht != "object" || xi(Ht)) && console.error("%s.state: must be set to an object or null", On), typeof le.getChildContext == "function" && typeof h.childContextTypes != "object" && console.error(
            "%s.getChildContext(): childContextTypes must be defined in order to use getChildContext().",
            On
          );
          var Nr = le.state !== void 0 ? le.state : null;
          le.updater = ks, le.props = U, le.state = Nr;
          var Qn = { queue: [], replace: !1 };
          le._reactInternals = Qn;
          var ut = h.contextType;
          if (le.context = typeof ut == "object" && ut !== null ? ut._currentValue : kl, le.state === U) {
            var cl = dn(h) || "Component";
            Xu.has(
              cl
            ) || (Xu.add(
              cl
            ), console.error(
              "%s: It is not recommended to assign props directly to state because updates to props won't be reflected in state. In most cases, it is better to use props directly.",
              cl
            ));
          }
          var wr = h.getDerivedStateFromProps;
          if (typeof wr == "function") {
            var er = wr(
              U,
              Nr
            );
            if (er === void 0) {
              var st = dn(h) || "Component";
              Zo.has(st) || (Zo.add(st), console.error(
                "%s.getDerivedStateFromProps(): A valid state object (or null) must be returned. You have returned undefined.",
                st
              ));
            }
            var Vt = er == null ? Nr : qn({}, Nr, er);
            le.state = Vt;
          }
          if (typeof h.getDerivedStateFromProps != "function" && typeof le.getSnapshotBeforeUpdate != "function" && (typeof le.UNSAFE_componentWillMount == "function" || typeof le.componentWillMount == "function")) {
            var ul = le.state;
            if (typeof le.componentWillMount == "function") {
              if (le.componentWillMount.__suppressDeprecationWarning !== !0) {
                var Sl = dn(h) || "Unknown";
                gu[Sl] || (console.warn(
                  `componentWillMount has been renamed, and is not recommended for use. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move code from componentWillMount to componentDidMount (preferred in most cases) or the constructor.

Please update the following components: %s`,
                  Sl
                ), gu[Sl] = !0);
              }
              le.componentWillMount();
            }
            if (typeof le.UNSAFE_componentWillMount == "function" && le.UNSAFE_componentWillMount(), ul !== le.state && (console.error(
              "%s.componentWillMount(): Assigning directly to this.state is deprecated (except inside a component's constructor). Use setState instead.",
              dn(h) || "Component"
            ), ks.enqueueReplaceState(
              le,
              le.state,
              null
            )), Qn.queue !== null && 0 < Qn.queue.length) {
              var nr = Qn.queue, Tt = Qn.replace;
              if (Qn.queue = null, Qn.replace = !1, Tt && nr.length === 1)
                le.state = nr[0];
              else {
                for (var Lr = Tt ? nr[0] : le.state, sl = !0, Br = Tt ? 1 : 0; Br < nr.length; Br++) {
                  var na = nr[Br], fl = typeof na == "function" ? na.call(
                    le,
                    Lr,
                    U,
                    void 0
                  ) : na;
                  fl != null && (sl ? (sl = !1, Lr = qn(
                    {},
                    Lr,
                    fl
                  )) : qn(Lr, fl));
                }
                le.state = Lr;
              }
            } else Qn.queue = null;
          }
          var Ut = Fn(le);
          if (e.status === 12) throw null;
          le.props !== U && (ol || console.error(
            "It looks like %s is reassigning its own `this.props` while rendering. This is not supported and can lead to confusing bugs.",
            dn(h) || "a component"
          ), ol = !0);
          var _l = t.keyPath;
          t.keyPath = c, Gr(e, t, Ut, -1), t.keyPath = _l;
        } else {
          if (h.prototype && typeof h.prototype.render == "function") {
            var cr = dn(h) || "Unknown";
            br[cr] || (console.error(
              "The <%s /> component appears to have a render method, but doesn't extend React.Component. This is likely to cause errors. Change %s to extend React.Component instead.",
              cr,
              cr
            ), br[cr] = !0);
          }
          var Qu = Dt(
            e,
            t,
            c,
            h,
            y,
            void 0
          );
          if (e.status === 12) throw null;
          var Fi = _t !== 0, Ft = Mc, zl = wu;
          if (h.contextTypes) {
            var _r = dn(h) || "Unknown";
            ct[_r] || (ct[_r] = !0, console.error(
              "%s uses the legacy contextTypes API which was removed in React 19. Use React.createContext() with React.useContext() instead. (https://react.dev/link/legacy-context)",
              _r
            ));
          }
          if (h && h.childContextTypes && console.error(
            `childContextTypes cannot be defined on a function component.
  %s.childContextTypes = ...`,
            h.displayName || h.name || "Component"
          ), typeof h.getDerivedStateFromProps == "function") {
            var Nc = dn(h) || "Unknown";
            Vo[Nc] || (console.error(
              "%s: Function components do not support getDerivedStateFromProps.",
              Nc
            ), Vo[Nc] = !0);
          }
          if (typeof h.contextType == "object" && h.contextType !== null) {
            var Ko = dn(h) || "Unknown";
            al[Ko] || (console.error(
              "%s: Function components do not support contextType.",
              Ko
            ), al[Ko] = !0);
          }
          Hi(
            e,
            t,
            c,
            Qu,
            Fi,
            Ft,
            zl
          );
        }
      else if (typeof h == "string") {
        var ci = t.blockedSegment;
        if (ci === null) {
          var jo = y.children, hl = t.formatContext, Lc = t.keyPath;
          t.formatContext = we(hl, h, y), t.keyPath = c, jt(e, t, jo, -1), t.formatContext = hl, t.keyPath = Lc;
        } else {
          var Ju = rc(
            ci.chunks,
            h,
            y,
            e.resumableState,
            e.renderState,
            t.blockedPreamble,
            t.hoistableState,
            t.formatContext,
            ci.lastPushedText
          );
          ci.lastPushedText = !1;
          var Hl = t.formatContext, Bc = t.keyPath;
          if (t.keyPath = c, (t.formatContext = we(
            Hl,
            h,
            y
          )).insertionMode === Ec) {
            var zr = Li(
              e,
              0,
              null,
              t.formatContext,
              !1,
              !1
            );
            ci.preambleChildren.push(zr), t.blockedSegment = zr;
            try {
              zr.status = 6, jt(e, t, Ju, -1), zr.lastPushedText && zr.textEmbedded && zr.chunks.push(Lt), zr.status = Un, ei(e, t.blockedBoundary, zr);
            } finally {
              t.blockedSegment = ci;
            }
          } else jt(e, t, Ju, -1);
          t.formatContext = Hl, t.keyPath = Bc;
          e: {
            var qo = ci.chunks, go = e.resumableState;
            switch (h) {
              case "title":
              case "style":
              case "script":
              case "area":
              case "base":
              case "br":
              case "col":
              case "embed":
              case "hr":
              case "img":
              case "input":
              case "keygen":
              case "link":
              case "meta":
              case "param":
              case "source":
              case "track":
              case "wbr":
                break e;
              case "body":
                if (Hl.insertionMode <= pa) {
                  go.hasBody = !0;
                  break e;
                }
                break;
              case "html":
                if (Hl.insertionMode === No) {
                  go.hasHtml = !0;
                  break e;
                }
                break;
              case "head":
                if (Hl.insertionMode <= pa) break e;
            }
            qo.push(ht(h));
          }
          ci.lastPushedText = !1;
        }
      } else {
        switch (h) {
          case Rs:
          case wc:
          case pc:
          case Yi:
            var Fa = t.keyPath;
            t.keyPath = c, Gr(e, t, y.children, -1), t.keyPath = Fa;
            return;
          case lr:
            var Ul = t.blockedSegment;
            if (Ul === null) {
              if (y.mode !== "hidden") {
                var Wl = t.keyPath;
                t.keyPath = c, jt(e, t, y.children, -1), t.keyPath = Wl;
              }
            } else if (y.mode !== "hidden") {
              Ul.chunks.push(Wu), Ul.lastPushedText = !1;
              var Oi = t.keyPath;
              t.keyPath = c, jt(e, t, y.children, -1), t.keyPath = Oi, Ul.chunks.push(ou), Ul.lastPushedText = !1;
            }
            return;
          case Ga:
            e: {
              var dl = y.children, pr = y.revealOrder;
              if (pr === "forwards" || pr === "backwards" || pr === "unstable_legacy-backwards") {
                if (xi(dl)) {
                  zi(
                    e,
                    t,
                    c,
                    dl,
                    pr
                  );
                  break e;
                }
                var Oa = W(dl);
                if (Oa) {
                  var Mi = Oa.call(dl);
                  if (Mi) {
                    Ua(
                      t,
                      dl,
                      -1,
                      Mi,
                      Oa
                    );
                    var vo = Mi.next();
                    if (!vo.done) {
                      var ta = [];
                      do
                        ta.push(vo.value), vo = Mi.next();
                      while (!vo.done);
                      zi(
                        e,
                        t,
                        c,
                        dl,
                        pr
                      );
                    }
                    break e;
                  }
                }
              }
              if (pr === "together") {
                var ws = t.keyPath, Kr = t.row, ui = t.row = pi(null);
                ui.boundaries = [], ui.together = !0, t.keyPath = c, Gr(e, t, dl, -1), --ui.pendingTasks === 0 && Qt(e, ui), t.keyPath = ws, t.row = Kr, Kr !== null && 0 < ui.pendingTasks && (Kr.pendingTasks++, ui.next = Kr);
              } else {
                var _c = t.keyPath;
                t.keyPath = c, Gr(e, t, dl, -1), t.keyPath = _c;
              }
            }
            return;
          case is:
          case Du:
            throw Error(
              "ReactDOMServer does not yet support scope components."
            );
          case va:
            e: if (t.replay !== null) {
              var pu = t.keyPath, Tu = t.formatContext, Xs = t.row;
              t.keyPath = c, t.formatContext = Be(
                e.resumableState,
                Tu
              ), t.row = null;
              var yo = y.children;
              try {
                jt(e, t, yo, -1);
              } finally {
                t.keyPath = pu, t.formatContext = Tu, t.row = Xs;
              }
            } else {
              var $o = t.keyPath, bo = t.formatContext, xu = t.row, Ls = t.blockedBoundary, Ss = t.blockedPreamble, jr = t.hoistableState, Ii = t.blockedSegment, wo = y.fallback, Vu = y.children, Yl = /* @__PURE__ */ new Set(), Wt = t.formatContext.insertionMode < mr ? Ni(
                e,
                t.row,
                Yl,
                fe(),
                fe()
              ) : Ni(
                e,
                t.row,
                Yl,
                null,
                null
              );
              e.trackedPostpones !== null && (Wt.trackedContentKeyPath = c);
              var xt = Li(
                e,
                Ii.chunks.length,
                Wt,
                t.formatContext,
                !1,
                !1
              );
              Ii.children.push(xt), Ii.lastPushedText = !1;
              var et = Li(
                e,
                0,
                null,
                t.formatContext,
                !1,
                !1
              );
              if (et.parentFlushed = !0, e.trackedPostpones !== null) {
                var As = t.componentStack, ec = [
                  c[0],
                  "Suspense Fallback",
                  c[2]
                ], Ku = [
                  ec[1],
                  ec[2],
                  [],
                  null
                ];
                e.trackedPostpones.workingMap.set(
                  ec,
                  Ku
                ), Wt.trackedFallbackNode = Ku, t.blockedSegment = xt, t.blockedPreamble = Wt.fallbackPreamble, t.keyPath = ec, t.formatContext = me(
                  e.resumableState,
                  bo
                ), t.componentStack = Ao(
                  As
                ), xt.status = 6;
                try {
                  jt(e, t, wo, -1), xt.lastPushedText && xt.textEmbedded && xt.chunks.push(Lt), xt.status = Un, ei(e, Ls, xt);
                } catch (Qs) {
                  throw xt.status = e.status === 12 ? pt : pn, Qs;
                } finally {
                  t.blockedSegment = Ii, t.blockedPreamble = Ss, t.keyPath = $o, t.formatContext = bo;
                }
                var nc = jl(
                  e,
                  null,
                  Vu,
                  -1,
                  Wt,
                  et,
                  Wt.contentPreamble,
                  Wt.contentState,
                  t.abortSet,
                  c,
                  Be(
                    e.resumableState,
                    t.formatContext
                  ),
                  t.context,
                  t.treeContext,
                  null,
                  As,
                  kl,
                  t.debugTask
                );
                _i(nc), e.pingedTasks.push(nc);
              } else {
                t.blockedBoundary = Wt, t.blockedPreamble = Wt.contentPreamble, t.hoistableState = Wt.contentState, t.blockedSegment = et, t.keyPath = c, t.formatContext = Be(
                  e.resumableState,
                  bo
                ), t.row = null, et.status = 6;
                try {
                  if (jt(e, t, Vu, -1), et.lastPushedText && et.textEmbedded && et.chunks.push(Lt), et.status = Un, ei(e, Wt, et), Mo(Wt, et), Wt.pendingTasks === 0 && Wt.status === Hn) {
                    if (Wt.status = Un, !Wr(e, Wt)) {
                      xu !== null && --xu.pendingTasks === 0 && Qt(e, xu), e.pendingRootTasks === 0 && t.blockedPreamble && Ya(e);
                      break e;
                    }
                  } else
                    xu !== null && xu.together && za(e, xu);
                } catch (Qs) {
                  if (Wt.status = Me, e.status === 12) {
                    et.status = pt;
                    var zc = e.fatalError;
                  } else
                    et.status = pn, zc = Qs;
                  var ju = $e(t.componentStack), Hc = It(
                    e,
                    zc,
                    ju,
                    t.debugTask
                  );
                  ql(
                    Wt,
                    Hc,
                    zc,
                    ju,
                    !1
                  ), Po(e, Wt);
                } finally {
                  t.blockedBoundary = Ls, t.blockedPreamble = Ss, t.hoistableState = jr, t.blockedSegment = Ii, t.keyPath = $o, t.formatContext = bo, t.row = xu;
                }
                var Eu = jl(
                  e,
                  null,
                  wo,
                  -1,
                  Ls,
                  xt,
                  Wt.fallbackPreamble,
                  Wt.fallbackState,
                  Yl,
                  [c[0], "Suspense Fallback", c[2]],
                  me(
                    e.resumableState,
                    t.formatContext
                  ),
                  t.context,
                  t.treeContext,
                  t.row,
                  Ao(
                    t.componentStack
                  ),
                  kl,
                  t.debugTask
                );
                _i(Eu), e.pingedTasks.push(Eu);
              }
            }
            return;
        }
        if (typeof h == "object" && h !== null)
          switch (h.$$typeof) {
            case kn:
              if ("ref" in y) {
                var Ru = {};
                for (var ps in y)
                  ps !== "ref" && (Ru[ps] = y[ps]);
              } else Ru = y;
              var Ps = Dt(
                e,
                t,
                c,
                h.render,
                Ru,
                x
              );
              Hi(
                e,
                t,
                c,
                Ps,
                _t !== 0,
                Mc,
                wu
              );
              return;
            case Xa:
              Ui(e, t, c, h.type, y, x);
              return;
            case it:
              var Bs = y.value, qu = y.children, $u = t.context, Uc = t.keyPath, po = h._currentValue;
              h._currentValue = Bs, h._currentRenderer !== void 0 && h._currentRenderer !== null && h._currentRenderer !== Aa && console.error(
                "Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported."
              ), h._currentRenderer = Aa;
              var Ma = qi, gl = {
                parent: Ma,
                depth: Ma === null ? 0 : Ma.depth + 1,
                context: h,
                parentValue: po,
                value: Bs
              };
              qi = gl, t.context = gl, t.keyPath = c, Gr(e, t, qu, -1);
              var Cu = qi;
              if (Cu === null)
                throw Error(
                  "Tried to pop a Context at the root of the app. This is a bug in React."
                );
              Cu.context !== h && console.error(
                "The parent context is not the expected context. This is probably a bug in React."
              ), Cu.context._currentValue = Cu.parentValue, h._currentRenderer !== void 0 && h._currentRenderer !== null && h._currentRenderer !== Aa && console.error(
                "Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported."
              ), h._currentRenderer = Aa;
              var _s = qi = Cu.parent;
              t.context = _s, t.keyPath = Uc, $u !== t.context && console.error(
                "Popping the context provider did not return back to the original snapshot. This is a bug in React."
              );
              return;
            case Xr:
              var Zs = h._context, Fs = y.children;
              typeof Fs != "function" && console.error(
                "A context consumer was rendered with multiple children, or a child that isn't a function. A context consumer expects a single child that is a function. If you did pass a function, make sure there is no trailing or leading whitespace around it."
              );
              var cf = Fs(Zs._currentValue), Ts = t.keyPath;
              t.keyPath = c, Gr(e, t, cf, -1), t.keyPath = Ts;
              return;
            case ya:
              var uf = yr(h);
              if (e.status === 12) throw null;
              Ui(e, t, c, uf, y, x);
              return;
          }
        var zs = "";
        throw (h === void 0 || typeof h == "object" && h !== null && Object.keys(h).length === 0) && (zs += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports."), Error(
          "Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: " + ((h == null ? h : typeof h) + "." + zs)
        );
      }
    }
    function Ha(e, t, c, h, y) {
      var x = t.replay, S = t.blockedBoundary, M = Li(
        e,
        0,
        null,
        t.formatContext,
        !1,
        !1
      );
      M.id = c, M.parentFlushed = !0;
      try {
        t.replay = null, t.blockedSegment = M, jt(e, t, h, y), M.status = Un, ei(e, S, M), S === null ? e.completedRootSegment = M : (Mo(S, M), S.parentFlushed && e.partialBoundaries.push(S));
      } finally {
        t.replay = x, t.blockedSegment = null;
      }
    }
    function sa(e, t, c, h, y, x, S, M, V, B) {
      x = B.nodes;
      for (var U = 0; U < x.length; U++) {
        var oe = x[U];
        if (y === oe[1]) {
          if (oe.length === 4) {
            if (h !== null && h !== oe[0])
              throw Error(
                "Expected the resume to render <" + oe[0] + "> in this slot but instead it rendered <" + h + ">. The tree doesn't match so React will fallback to client rendering."
              );
            var se = oe[2];
            h = oe[3], y = t.node, t.replay = { nodes: se, slots: h, pendingTasks: 1 };
            try {
              if (Ui(e, t, c, S, M, V), t.replay.pendingTasks === 1 && 0 < t.replay.nodes.length)
                throw Error(
                  "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                );
              t.replay.pendingTasks--;
            } catch (Le) {
              if (typeof Le == "object" && Le !== null && (Le === mi || typeof Le.then == "function"))
                throw t.node === y ? t.replay = B : x.splice(U, 1), Le;
              t.replay.pendingTasks--, S = $e(t.componentStack), M = e, e = t.blockedBoundary, c = Le, V = h, h = It(M, c, S, t.debugTask), fa(
                M,
                e,
                se,
                V,
                c,
                h,
                S,
                !1
              );
            }
            t.replay = B;
          } else {
            if (S !== va)
              throw Error(
                "Expected the resume to render <Suspense> in this slot but instead it rendered <" + (dn(S) || "Unknown") + ">. The tree doesn't match so React will fallback to client rendering."
              );
            e: {
              B = void 0, h = oe[5], S = oe[2], V = oe[3], y = oe[4] === null ? [] : oe[4][2], oe = oe[4] === null ? null : oe[4][3];
              var ce = t.keyPath, le = t.formatContext, Ue = t.row, Zn = t.replay, _e = t.blockedBoundary, hn = t.hoistableState, Pt = M.children, zt = M.fallback, On = /* @__PURE__ */ new Set();
              M = t.formatContext.insertionMode < mr ? Ni(
                e,
                t.row,
                On,
                fe(),
                fe()
              ) : Ni(
                e,
                t.row,
                On,
                null,
                null
              ), M.parentFlushed = !0, M.rootSegmentID = h, t.blockedBoundary = M, t.hoistableState = M.contentState, t.keyPath = c, t.formatContext = Be(
                e.resumableState,
                le
              ), t.row = null, t.replay = { nodes: S, slots: V, pendingTasks: 1 };
              try {
                if (jt(e, t, Pt, -1), t.replay.pendingTasks === 1 && 0 < t.replay.nodes.length)
                  throw Error(
                    "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                  );
                if (t.replay.pendingTasks--, M.pendingTasks === 0 && M.status === Hn) {
                  M.status = Un, e.completedBoundaries.push(M);
                  break e;
                }
              } catch (Le) {
                M.status = Me, se = $e(t.componentStack), B = It(
                  e,
                  Le,
                  se,
                  t.debugTask
                ), ql(M, B, Le, se, !1), t.replay.pendingTasks--, e.clientRenderedBoundaries.push(M);
              } finally {
                t.blockedBoundary = _e, t.hoistableState = hn, t.replay = Zn, t.keyPath = ce, t.formatContext = le, t.row = Ue;
              }
              M = Pu(
                e,
                null,
                { nodes: y, slots: oe, pendingTasks: 0 },
                zt,
                -1,
                _e,
                M.fallbackState,
                On,
                [c[0], "Suspense Fallback", c[2]],
                me(
                  e.resumableState,
                  t.formatContext
                ),
                t.context,
                t.treeContext,
                t.row,
                Ao(
                  t.componentStack
                ),
                kl,
                t.debugTask
              ), _i(M), e.pingedTasks.push(M);
            }
          }
          x.splice(U, 1);
          break;
        }
      }
    }
    function Ua(e, t, c, h, y) {
      h === t ? (c !== -1 || e.componentStack === null || typeof e.componentStack.type != "function" || Object.prototype.toString.call(e.componentStack.type) !== "[object GeneratorFunction]" || Object.prototype.toString.call(h) !== "[object Generator]") && (Si || console.error(
        "Using Iterators as children is unsupported and will likely yield unexpected results because enumerating a generator mutates it. You may convert it to an array with `Array.from()` or the `[...spread]` operator before rendering. You can also use an Iterable that can iterate multiple times over the same items."
      ), Si = !0) : t.entries !== y || Ai || (console.error(
        "Using Maps as children is not supported. Use an array of keyed ReactElements instead."
      ), Ai = !0);
    }
    function Gr(e, t, c, h) {
      t.replay !== null && typeof t.replay.slots == "number" ? Ha(e, t, t.replay.slots, c, h) : (t.node = c, t.childIndex = h, c = t.componentStack, h = t.debugTask, _i(t), Wa(e, t), t.componentStack = c, t.debugTask = h);
    }
    function Wa(e, t) {
      var c = t.node, h = t.childIndex;
      if (c !== null) {
        if (typeof c == "object") {
          switch (c.$$typeof) {
            case jc:
              var y = c.type, x = c.key;
              c = c.props;
              var S = c.ref;
              S = S !== void 0 ? S : null;
              var M = t.debugTask, V = dn(y);
              x = x ?? (h === -1 ? 0 : h);
              var B = [t.keyPath, V, x];
              t.replay !== null ? M ? M.run(
                sa.bind(
                  null,
                  e,
                  t,
                  B,
                  V,
                  x,
                  h,
                  y,
                  c,
                  S,
                  t.replay
                )
              ) : sa(
                e,
                t,
                B,
                V,
                x,
                h,
                y,
                c,
                S,
                t.replay
              ) : M ? M.run(
                Ui.bind(
                  null,
                  e,
                  t,
                  B,
                  y,
                  c,
                  S
                )
              ) : Ui(e, t, B, y, c, S);
              return;
            case bc:
              throw Error(
                "Portals are not currently supported by the server renderer. Render them conditionally so that they only appear on the client render."
              );
            case ya:
              if (y = yr(c), e.status === 12) throw null;
              Gr(e, t, y, h);
              return;
          }
          if (xi(c)) {
            Fu(e, t, c, h);
            return;
          }
          if ((x = W(c)) && (y = x.call(c))) {
            if (Ua(t, c, h, y, x), c = y.next(), !c.done) {
              x = [];
              do
                x.push(c.value), c = y.next();
              while (!c.done);
              Fu(e, t, x, h);
            }
            return;
          }
          if (typeof c.then == "function")
            return t.thenableState = null, Gr(
              e,
              t,
              Zt(c),
              h
            );
          if (c.$$typeof === it)
            return Gr(
              e,
              t,
              c._currentValue,
              h
            );
          throw e = Object.prototype.toString.call(c), Error(
            "Objects are not valid as a React child (found: " + (e === "[object Object]" ? "object with keys {" + Object.keys(c).join(", ") + "}" : e) + "). If you meant to render a collection of children, use an array instead."
          );
        }
        typeof c == "string" ? (t = t.blockedSegment, t !== null && (t.lastPushedText = Se(
          t.chunks,
          c,
          e.renderState,
          t.lastPushedText
        ))) : typeof c == "number" || typeof c == "bigint" ? (t = t.blockedSegment, t !== null && (t.lastPushedText = Se(
          t.chunks,
          "" + c,
          e.renderState,
          t.lastPushedText
        ))) : (typeof c == "function" && (e = c.displayName || c.name || "Component", console.error(
          "Functions are not valid as a React child. This may happen if you return %s instead of <%s /> from render. Or maybe you meant to call this function rather than return it.",
          e,
          e
        )), typeof c == "symbol" && console.error(
          `Symbols are not valid as a React child.
  %s`,
          String(c)
        ));
      }
    }
    function $l(e, t, c) {
      if (c !== null && typeof c == "object" && (c.$$typeof === jc || c.$$typeof === bc) && c._store && (!c._store.validated && c.key == null || c._store.validated === 2)) {
        if (typeof c._store != "object")
          throw Error(
            "React Component in warnForMissingKey should have a _store. This error is likely caused by a bug in React. Please file an issue."
          );
        c._store.validated = 1;
        var h = e.didWarnForKey;
        if (h == null && (h = e.didWarnForKey = /* @__PURE__ */ new WeakSet()), e = t.componentStack, e !== null && !h.has(e)) {
          h.add(e);
          var y = dn(c.type);
          h = c._owner;
          var x = e.owner;
          if (e = "", x && typeof x.type < "u") {
            var S = dn(x.type);
            S && (e = `

Check the render method of \`` + S + "`.");
          }
          e || y && (e = `

Check the top-level render call using <` + y + ">."), y = "", h != null && x !== h && (x = null, typeof h.type < "u" ? x = dn(h.type) : typeof h.name == "string" && (x = h.name), x && (y = " It was passed a child from " + x + ".")), h = t.componentStack, t.componentStack = {
            parent: t.componentStack,
            type: c.type,
            owner: c._owner,
            stack: c._debugStack
          }, console.error(
            'Each child in a list should have a unique "key" prop.%s%s See https://react.dev/link/warning-keys for more information.',
            e,
            y
          ), t.componentStack = h;
        }
      }
    }
    function Fu(e, t, c, h) {
      var y = t.keyPath, x = t.componentStack, S = t.debugTask;
      if (Bi(t, t.node._debugInfo), h !== -1 && (t.keyPath = [t.keyPath, "Fragment", h], t.replay !== null)) {
        for (var M = t.replay, V = M.nodes, B = 0; B < V.length; B++) {
          var U = V[B];
          if (U[1] === h) {
            h = U[2], U = U[3], t.replay = { nodes: h, slots: U, pendingTasks: 1 };
            try {
              if (Fu(e, t, c, -1), t.replay.pendingTasks === 1 && 0 < t.replay.nodes.length)
                throw Error(
                  "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                );
              t.replay.pendingTasks--;
            } catch (le) {
              if (typeof le == "object" && le !== null && (le === mi || typeof le.then == "function"))
                throw le;
              t.replay.pendingTasks--;
              var oe = $e(t.componentStack);
              c = t.blockedBoundary;
              var se = le, ce = U;
              U = It(
                e,
                se,
                oe,
                t.debugTask
              ), fa(
                e,
                c,
                h,
                ce,
                se,
                U,
                oe,
                !1
              );
            }
            t.replay = M, V.splice(B, 1);
            break;
          }
        }
        t.keyPath = y, t.componentStack = x, t.debugTask = S;
        return;
      }
      if (M = t.treeContext, V = c.length, t.replay !== null && (B = t.replay.slots, B !== null && typeof B == "object")) {
        for (h = 0; h < V; h++)
          U = c[h], t.treeContext = Ba(
            M,
            V,
            h
          ), se = B[h], typeof se == "number" ? (Ha(e, t, se, U, h), delete B[h]) : jt(e, t, U, h);
        t.treeContext = M, t.keyPath = y, t.componentStack = x, t.debugTask = S;
        return;
      }
      for (B = 0; B < V; B++)
        h = c[B], $l(e, t, h), t.treeContext = Ba(M, V, B), jt(e, t, h, B);
      t.treeContext = M, t.keyPath = y, t.componentStack = x, t.debugTask = S;
    }
    function Ou(e, t, c) {
      if (c.status = tn, c.rootSegmentID = e.nextSegmentId++, e = c.trackedContentKeyPath, e === null)
        throw Error(
          "It should not be possible to postpone at the root. This is a bug in React."
        );
      var h = c.trackedFallbackNode, y = [], x = t.workingMap.get(e);
      return x === void 0 ? (c = [
        e[1],
        e[2],
        y,
        null,
        h,
        c.rootSegmentID
      ], t.workingMap.set(e, c), El(c, e[0], t), c) : (x[4] = h, x[5] = c.rootSegmentID, x);
    }
    function Mu(e, t, c, h) {
      h.status = tn;
      var y = c.keyPath, x = c.blockedBoundary;
      if (x === null)
        h.id = e.nextSegmentId++, t.rootSlots = h.id, e.completedRootSegment !== null && (e.completedRootSegment.status = tn);
      else {
        if (x !== null && x.status === Hn) {
          var S = Ou(
            e,
            t,
            x
          );
          if (x.trackedContentKeyPath === y && c.childIndex === -1) {
            h.id === -1 && (h.id = h.parentFlushed ? x.rootSegmentID : e.nextSegmentId++), S[3] = h.id;
            return;
          }
        }
        if (h.id === -1 && (h.id = h.parentFlushed && x !== null ? x.rootSegmentID : e.nextSegmentId++), c.childIndex === -1)
          y === null ? t.rootSlots = h.id : (c = t.workingMap.get(y), c === void 0 ? (c = [y[1], y[2], [], h.id], El(c, y[0], t)) : c[3] = h.id);
        else {
          if (y === null) {
            if (e = t.rootSlots, e === null)
              e = t.rootSlots = {};
            else if (typeof e == "number")
              throw Error(
                "It should not be possible to postpone both at the root of an element as well as a slot below. This is a bug in React."
              );
          } else if (x = t.workingMap, S = x.get(y), S === void 0)
            e = {}, S = [y[1], y[2], [], e], x.set(y, S), El(S, y[0], t);
          else if (e = S[3], e === null)
            e = S[3] = {};
          else if (typeof e == "number")
            throw Error(
              "It should not be possible to postpone both at the root of an element as well as a slot below. This is a bug in React."
            );
          e[c.childIndex] = h.id;
        }
      }
    }
    function Po(e, t) {
      e = e.trackedPostpones, e !== null && (t = t.trackedContentKeyPath, t !== null && (t = e.workingMap.get(t), t !== void 0 && (t.length = 4, t[2] = [], t[3] = null)));
    }
    function Fo(e, t, c) {
      return Pu(
        e,
        c,
        t.replay,
        t.node,
        t.childIndex,
        t.blockedBoundary,
        t.hoistableState,
        t.abortSet,
        t.keyPath,
        t.formatContext,
        t.context,
        t.treeContext,
        t.row,
        t.componentStack,
        kl,
        t.debugTask
      );
    }
    function Oo(e, t, c) {
      var h = t.blockedSegment, y = Li(
        e,
        h.chunks.length,
        null,
        t.formatContext,
        h.lastPushedText,
        !0
      );
      return h.children.push(y), h.lastPushedText = !1, jl(
        e,
        c,
        t.node,
        t.childIndex,
        t.blockedBoundary,
        y,
        t.blockedPreamble,
        t.hoistableState,
        t.abortSet,
        t.keyPath,
        t.formatContext,
        t.context,
        t.treeContext,
        t.row,
        t.componentStack,
        kl,
        t.debugTask
      );
    }
    function jt(e, t, c, h) {
      var y = t.formatContext, x = t.context, S = t.keyPath, M = t.treeContext, V = t.componentStack, B = t.debugTask, U = t.blockedSegment;
      if (U === null) {
        U = t.replay;
        try {
          return Gr(e, t, c, h);
        } catch (ce) {
          if (_a(), c = ce === mi ? ku() : ce, e.status !== 12 && typeof c == "object" && c !== null) {
            if (typeof c.then == "function") {
              h = ce === mi ? wl() : null, e = Fo(
                e,
                t,
                h
              ).ping, c.then(e, e), t.formatContext = y, t.context = x, t.keyPath = S, t.treeContext = M, t.componentStack = V, t.replay = U, t.debugTask = B, mn(x);
              return;
            }
            if (c.message === "Maximum call stack size exceeded") {
              c = ce === mi ? wl() : null, c = Fo(e, t, c), e.pingedTasks.push(c), t.formatContext = y, t.context = x, t.keyPath = S, t.treeContext = M, t.componentStack = V, t.replay = U, t.debugTask = B, mn(x);
              return;
            }
          }
        }
      } else {
        var oe = U.children.length, se = U.chunks.length;
        try {
          return Gr(e, t, c, h);
        } catch (ce) {
          if (_a(), U.children.length = oe, U.chunks.length = se, c = ce === mi ? ku() : ce, e.status !== 12 && typeof c == "object" && c !== null) {
            if (typeof c.then == "function") {
              U = c, c = ce === mi ? wl() : null, e = Oo(e, t, c).ping, U.then(e, e), t.formatContext = y, t.context = x, t.keyPath = S, t.treeContext = M, t.componentStack = V, t.debugTask = B, mn(x);
              return;
            }
            if (c.message === "Maximum call stack size exceeded") {
              U = ce === mi ? wl() : null, U = Oo(e, t, U), e.pingedTasks.push(U), t.formatContext = y, t.context = x, t.keyPath = S, t.treeContext = M, t.componentStack = V, t.debugTask = B, mn(x);
              return;
            }
          }
        }
      }
      throw t.formatContext = y, t.context = x, t.keyPath = S, t.treeContext = M, mn(x), c;
    }
    function ls(e) {
      var t = e.blockedBoundary, c = e.blockedSegment;
      c !== null && (c.status = pt, da(this, t, e.row, c));
    }
    function fa(e, t, c, h, y, x, S, M) {
      for (var V = 0; V < c.length; V++) {
        var B = c[V];
        if (B.length === 4)
          fa(
            e,
            t,
            B[2],
            B[3],
            y,
            x,
            S,
            M
          );
        else {
          var U = e;
          B = B[5];
          var oe = y, se = x, ce = S, le = M, Ue = Ni(
            U,
            null,
            /* @__PURE__ */ new Set(),
            null,
            null
          );
          Ue.parentFlushed = !0, Ue.rootSegmentID = B, Ue.status = Me, ql(
            Ue,
            se,
            oe,
            ce,
            le
          ), Ue.parentFlushed && U.clientRenderedBoundaries.push(Ue);
        }
      }
      if (c.length = 0, h !== null) {
        if (t === null)
          throw Error(
            "We should not have any resumable nodes in the shell. This is a bug in React."
          );
        if (t.status !== Me && (t.status = Me, ql(
          t,
          x,
          y,
          S,
          M
        ), t.parentFlushed && e.clientRenderedBoundaries.push(t)), typeof h == "object")
          for (var Zn in h) delete h[Zn];
      }
    }
    function gc(e, t, c) {
      var h = e.blockedBoundary, y = e.blockedSegment;
      if (y !== null) {
        if (y.status === 6) return;
        y.status = pt;
      }
      var x = $e(e.componentStack), S = e.node;
      if (S !== null && typeof S == "object" && So(e, S._debugInfo), h === null) {
        if (t.status !== 13 && t.status !== Dr) {
          if (h = e.replay, h === null) {
            t.trackedPostpones !== null && y !== null ? (h = t.trackedPostpones, It(t, c, x, e.debugTask), Mu(t, h, e, y), da(t, null, e.row, y)) : (It(t, c, x, e.debugTask), wi(t, c, x, e.debugTask));
            return;
          }
          h.pendingTasks--, h.pendingTasks === 0 && 0 < h.nodes.length && (y = It(t, c, x, null), fa(
            t,
            null,
            h.nodes,
            h.slots,
            c,
            y,
            x,
            !0
          )), t.pendingRootTasks--, t.pendingRootTasks === 0 && Wi(t);
        }
      } else {
        if (S = t.trackedPostpones, h.status !== Me) {
          if (S !== null && y !== null)
            return It(t, c, x, e.debugTask), Mu(t, S, e, y), h.fallbackAbortableTasks.forEach(function(M) {
              return gc(M, t, c);
            }), h.fallbackAbortableTasks.clear(), da(t, h, e.row, y);
          h.status = Me, y = It(
            t,
            c,
            x,
            e.debugTask
          ), h.status = Me, ql(h, y, c, x, !0), Po(t, h), h.parentFlushed && t.clientRenderedBoundaries.push(h);
        }
        h.pendingTasks--, x = h.row, x !== null && --x.pendingTasks === 0 && Qt(t, x), h.fallbackAbortableTasks.forEach(function(M) {
          return gc(M, t, c);
        }), h.fallbackAbortableTasks.clear();
      }
      e = e.row, e !== null && --e.pendingTasks === 0 && Qt(t, e), t.allPendingTasks--, t.allPendingTasks === 0 && ha(t);
    }
    function Qc(e, t) {
      try {
        var c = e.renderState, h = c.onHeaders;
        if (h) {
          var y = c.headers;
          if (y) {
            c.headers = null;
            var x = y.preconnects;
            if (y.fontPreloads && (x && (x += ", "), x += y.fontPreloads), y.highImagePreloads && (x && (x += ", "), x += y.highImagePreloads), !t) {
              var S = c.styles.values(), M = S.next();
              e: for (; 0 < y.remainingCapacity && !M.done; M = S.next())
                for (var V = M.value.sheets.values(), B = V.next(); 0 < y.remainingCapacity && !B.done; B = V.next()) {
                  var U = B.value, oe = U.props, se = oe.href, ce = U.props, le = oa(
                    ce.href,
                    "style",
                    {
                      crossOrigin: ce.crossOrigin,
                      integrity: ce.integrity,
                      nonce: ce.nonce,
                      type: ce.type,
                      fetchPriority: ce.fetchPriority,
                      referrerPolicy: ce.referrerPolicy,
                      media: ce.media
                    }
                  );
                  if (0 <= (y.remainingCapacity -= le.length + 2))
                    c.resets.style[se] = qt, x && (x += ", "), x += le, c.resets.style[se] = typeof oe.crossOrigin == "string" || typeof oe.integrity == "string" ? [oe.crossOrigin, oe.integrity] : qt;
                  else break e;
                }
            }
            h(x ? { Link: x } : {});
          }
        }
      } catch (Ue) {
        It(e, Ue, {}, null);
      }
    }
    function Wi(e) {
      e.trackedPostpones === null && Qc(e, !0), e.trackedPostpones === null && Ya(e), e.onShellError = Er, e = e.onShellReady, e();
    }
    function ha(e) {
      Qc(
        e,
        e.trackedPostpones === null ? !0 : e.completedRootSegment === null || e.completedRootSegment.status !== tn
      ), Ya(e), e = e.onAllReady, e();
    }
    function Mo(e, t) {
      if (t.chunks.length === 0 && t.children.length === 1 && t.children[0].boundary === null && t.children[0].id === -1) {
        var c = t.children[0];
        c.id = t.id, c.parentFlushed = !0, c.status !== Un && c.status !== pt && c.status !== pn || Mo(e, c);
      } else e.completedSegments.push(t);
    }
    function ei(e, t, c) {
      if (ft !== null) {
        c = c.chunks;
        for (var h = 0, y = 0; y < c.length; y++)
          h += c[y].byteLength;
        t === null ? e.byteSize += h : t.byteSize += h;
      }
    }
    function da(e, t, c, h) {
      if (c !== null && (--c.pendingTasks === 0 ? Qt(e, c) : c.together && za(e, c)), e.allPendingTasks--, t === null) {
        if (h !== null && h.parentFlushed) {
          if (e.completedRootSegment !== null)
            throw Error(
              "There can only be one root segment. This is a bug in React."
            );
          e.completedRootSegment = h;
        }
        e.pendingRootTasks--, e.pendingRootTasks === 0 && Wi(e);
      } else if (t.pendingTasks--, t.status !== Me)
        if (t.pendingTasks === 0) {
          if (t.status === Hn && (t.status = Un), h !== null && h.parentFlushed && (h.status === Un || h.status === pt) && Mo(t, h), t.parentFlushed && e.completedBoundaries.push(t), t.status === Un)
            c = t.row, c !== null && Cn(c.hoistables, t.contentState), Wr(e, t) || (t.fallbackAbortableTasks.forEach(
              ls,
              e
            ), t.fallbackAbortableTasks.clear(), c !== null && --c.pendingTasks === 0 && Qt(e, c)), e.pendingRootTasks === 0 && e.trackedPostpones === null && t.contentPreamble !== null && Ya(e);
          else if (t.status === tn && (t = t.row, t !== null)) {
            if (e.trackedPostpones !== null) {
              c = e.trackedPostpones;
              var y = t.next;
              if (y !== null && (h = y.boundaries, h !== null))
                for (y.boundaries = null, y = 0; y < h.length; y++) {
                  var x = h[y];
                  Ou(e, c, x), da(e, x, null, null);
                }
            }
            --t.pendingTasks === 0 && Qt(e, t);
          }
        } else
          h === null || !h.parentFlushed || h.status !== Un && h.status !== pt || (Mo(t, h), t.completedSegments.length === 1 && t.parentFlushed && e.partialBoundaries.push(t)), t = t.row, t !== null && t.together && za(e, t);
      e.allPendingTasks === 0 && ha(e);
    }
    function ga(e) {
      if (e.status !== Dr && e.status !== 13) {
        var t = qi, c = cn.H;
        cn.H = Dc;
        var h = cn.A;
        cn.A = u;
        var y = Wn;
        Wn = e;
        var x = cn.getCurrentStack;
        cn.getCurrentStack = bi;
        var S = n;
        n = e.resumableState;
        try {
          var M = e.pingedTasks, V;
          for (V = 0; V < M.length; V++) {
            var B = e, U = M[V], oe = U.blockedSegment;
            if (oe === null) {
              var se = void 0, ce = B;
              if (B = U, B.replay.pendingTasks !== 0) {
                mn(B.context), se = r, r = B;
                try {
                  if (typeof B.replay.slots == "number" ? Ha(
                    ce,
                    B,
                    B.replay.slots,
                    B.node,
                    B.childIndex
                  ) : Wa(ce, B), B.replay.pendingTasks === 1 && 0 < B.replay.nodes.length)
                    throw Error(
                      "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                    );
                  B.replay.pendingTasks--, B.abortSet.delete(B), da(
                    ce,
                    B.blockedBoundary,
                    B.row,
                    null
                  );
                } catch (Tt) {
                  _a();
                  var le = Tt === mi ? ku() : Tt;
                  if (typeof le == "object" && le !== null && typeof le.then == "function") {
                    var Ue = B.ping;
                    le.then(Ue, Ue), B.thenableState = Tt === mi ? wl() : null;
                  } else {
                    B.replay.pendingTasks--, B.abortSet.delete(B);
                    var Zn = $e(B.componentStack), _e = void 0, hn = ce, Pt = B.blockedBoundary, zt = ce.status === 12 ? ce.fatalError : le, On = Zn, Le = B.replay.nodes, Ht = B.replay.slots;
                    _e = It(
                      hn,
                      zt,
                      On,
                      B.debugTask
                    ), fa(
                      hn,
                      Pt,
                      Le,
                      Ht,
                      zt,
                      _e,
                      On,
                      !1
                    ), ce.pendingRootTasks--, ce.pendingRootTasks === 0 && Wi(ce), ce.allPendingTasks--, ce.allPendingTasks === 0 && ha(ce);
                  }
                } finally {
                  r = se;
                }
              }
            } else if (ce = se = void 0, _e = U, hn = oe, hn.status === Hn) {
              hn.status = 6, mn(_e.context), ce = r, r = _e;
              var Nr = hn.children.length, Qn = hn.chunks.length;
              try {
                Wa(B, _e), hn.lastPushedText && hn.textEmbedded && hn.chunks.push(Lt), _e.abortSet.delete(_e), hn.status = Un, ei(
                  B,
                  _e.blockedBoundary,
                  hn
                ), da(
                  B,
                  _e.blockedBoundary,
                  _e.row,
                  hn
                );
              } catch (Tt) {
                _a(), hn.children.length = Nr, hn.chunks.length = Qn;
                var ut = Tt === mi ? ku() : B.status === 12 ? B.fatalError : Tt;
                if (B.status === 12 && B.trackedPostpones !== null) {
                  var cl = B.trackedPostpones, wr = $e(_e.componentStack);
                  _e.abortSet.delete(_e), It(
                    B,
                    ut,
                    wr,
                    _e.debugTask
                  ), Mu(
                    B,
                    cl,
                    _e,
                    hn
                  ), da(
                    B,
                    _e.blockedBoundary,
                    _e.row,
                    hn
                  );
                } else if (typeof ut == "object" && ut !== null && typeof ut.then == "function") {
                  hn.status = Hn, _e.thenableState = Tt === mi ? wl() : null;
                  var er = _e.ping;
                  ut.then(er, er);
                } else {
                  var st = $e(
                    _e.componentStack
                  );
                  _e.abortSet.delete(_e), hn.status = pn;
                  var Vt = _e.blockedBoundary, ul = _e.row, Sl = _e.debugTask;
                  if (ul !== null && --ul.pendingTasks === 0 && Qt(B, ul), B.allPendingTasks--, se = It(
                    B,
                    ut,
                    st,
                    Sl
                  ), Vt === null)
                    wi(
                      B,
                      ut,
                      st,
                      Sl
                    );
                  else if (Vt.pendingTasks--, Vt.status !== Me) {
                    Vt.status = Me, ql(
                      Vt,
                      se,
                      ut,
                      st,
                      !1
                    ), Po(B, Vt);
                    var nr = Vt.row;
                    nr !== null && --nr.pendingTasks === 0 && Qt(B, nr), Vt.parentFlushed && B.clientRenderedBoundaries.push(Vt), B.pendingRootTasks === 0 && B.trackedPostpones === null && Vt.contentPreamble !== null && Ya(B);
                  }
                  B.allPendingTasks === 0 && ha(B);
                }
              } finally {
                r = ce;
              }
            }
          }
          M.splice(0, V), e.destination !== null && pl(
            e,
            e.destination
          );
        } catch (Tt) {
          M = {}, It(e, Tt, M, null), wi(e, Tt, M, null);
        } finally {
          n = S, cn.H = c, cn.A = h, cn.getCurrentStack = x, c === Dc && mn(t), Wn = y;
        }
      }
    }
    function Iu(e, t, c) {
      t.preambleChildren.length && c.push(t.preambleChildren);
      for (var h = !1, y = 0; y < t.children.length; y++)
        h = Es(
          e,
          t.children[y],
          c
        ) || h;
      return h;
    }
    function Es(e, t, c) {
      var h = t.boundary;
      if (h === null)
        return Iu(
          e,
          t,
          c
        );
      var y = h.contentPreamble, x = h.fallbackPreamble;
      if (y === null || x === null) return !1;
      switch (h.status) {
        case Un:
          if (To(e.renderState, y), e.byteSize += h.byteSize, t = h.completedSegments[0], !t)
            throw Error(
              "A previously unvisited boundary must have exactly one root segment. This is a bug in React."
            );
          return Iu(
            e,
            t,
            c
          );
        case tn:
          if (e.trackedPostpones !== null) return !0;
        case Me:
          if (t.status === Un)
            return To(e.renderState, x), Iu(
              e,
              t,
              c
            );
        default:
          return !0;
      }
    }
    function Ya(e) {
      if (e.completedRootSegment && e.completedPreambleSegments === null) {
        var t = [], c = e.byteSize, h = Es(
          e,
          e.completedRootSegment,
          t
        ), y = e.renderState.preamble;
        h === !1 || y.headChunks && y.bodyChunks ? e.completedPreambleSegments = t : e.byteSize = c;
      }
    }
    function Nt(e, t, c, h) {
      switch (c.parentFlushed = !0, c.status) {
        case Hn:
          c.id = e.nextSegmentId++;
        case tn:
          return h = c.id, c.lastPushedText = !1, c.textEmbedded = !1, e = e.renderState, P(t, Pc), P(t, e.placeholderPrefix), e = ee(h.toString(16)), P(t, e), N(t, au);
        case Un:
          c.status = Xn;
          var y = !0, x = c.chunks, S = 0;
          c = c.children;
          for (var M = 0; M < c.length; M++) {
            for (y = c[M]; S < y.index; S++)
              P(t, x[S]);
            y = Ti(e, t, y, h);
          }
          for (; S < x.length - 1; S++)
            P(t, x[S]);
          return S < x.length && (y = N(t, x[S])), y;
        case pt:
          return !0;
        default:
          throw Error(
            "Aborted, errored or already flushed boundaries should not be flushed again. This is a bug in React."
          );
      }
    }
    function Ti(e, t, c, h) {
      var y = c.boundary;
      if (y === null)
        return Nt(e, t, c, h);
      if (y.parentFlushed = !0, y.status === Me) {
        var x = y.row;
        x !== null && --x.pendingTasks === 0 && Qt(e, x), x = y.errorDigest;
        var S = y.errorMessage, M = y.errorStack;
        y = y.errorComponentStack, N(t, cs), P(t, Fc), x && (P(t, zo), P(t, ee(Ae(x))), P(
          t,
          ri
        )), S && (P(t, Ca), P(
          t,
          ee(Ae(S))
        ), P(
          t,
          ri
        )), M && (P(t, Oc), P(
          t,
          ee(Ae(M))
        ), P(
          t,
          ri
        )), y && (P(t, ma), P(
          t,
          ee(Ae(y))
        ), P(
          t,
          ri
        )), N(t, us), Nt(e, t, c, h);
      } else if (y.status !== Un)
        y.status === Hn && (y.rootSegmentID = e.nextSegmentId++), 0 < y.completedSegments.length && e.partialBoundaries.push(y), el(
          t,
          e.renderState,
          y.rootSegmentID
        ), h && Cn(h, y.fallbackState), Nt(e, t, c, h);
      else if (!or && Wr(e, y) && (Pi + y.byteSize > e.progressiveChunkSize || es(y.contentState)))
        y.rootSegmentID = e.nextSegmentId++, e.completedBoundaries.push(y), el(
          t,
          e.renderState,
          y.rootSegmentID
        ), Nt(e, t, c, h);
      else {
        if (Pi += y.byteSize, h && Cn(h, y.contentState), c = y.row, c !== null && Wr(e, y) && --c.pendingTasks === 0 && Qt(e, c), N(t, cu), c = y.completedSegments, c.length !== 1)
          throw Error(
            "A previously unvisited boundary must have exactly one root segment. This is a bug in React."
          );
        Ti(e, t, c[0], h);
      }
      return N(t, to);
    }
    function vc(e, t, c, h) {
      return aa(
        t,
        e.renderState,
        c.parentFormatContext,
        c.id
      ), Ti(e, t, c, h), fi(t, c.parentFormatContext);
    }
    function yc(e, t, c) {
      Pi = c.byteSize;
      for (var h = c.completedSegments, y = 0; y < h.length; y++)
        Jc(
          e,
          t,
          c,
          h[y]
        );
      h.length = 0, h = c.row, h !== null && Wr(e, c) && --h.pendingTasks === 0 && Qt(e, h), L(
        t,
        c.contentState,
        e.renderState
      ), h = e.resumableState, e = e.renderState, y = c.rootSegmentID, c = c.contentState;
      var x = e.stylesToHoist;
      return e.stylesToHoist = !1, P(t, e.startInlineScript), P(t, yt), x ? ((h.instructions & Dn) === vt && (h.instructions |= Dn, P(t, Pr)), (h.instructions & Rr) === vt && (h.instructions |= Rr, P(t, Qe)), (h.instructions & En) === vt ? (h.instructions |= En, P(
        t,
        bt
      )) : P(t, $n)) : ((h.instructions & Rr) === vt && (h.instructions |= Rr, P(t, Qe)), P(t, bn)), h = ee(y.toString(16)), P(t, e.boundaryPrefix), P(t, h), P(t, gr), P(t, e.segmentPrefix), P(t, h), x ? (P(t, ll), We(t, c)) : P(t, Dl), c = N(t, Je), xo(t, e) && c;
    }
    function Jc(e, t, c, h) {
      if (h.status === Xn) return !0;
      var y = c.contentState, x = h.id;
      if (x === -1) {
        if ((h.id = c.rootSegmentID) === -1)
          throw Error(
            "A root segment ID must have been assigned by now. This is a bug in React."
          );
        return vc(
          e,
          t,
          h,
          y
        );
      }
      return x === c.rootSegmentID ? vc(
        e,
        t,
        h,
        y
      ) : (vc(e, t, h, y), c = e.resumableState, e = e.renderState, P(t, e.startInlineScript), P(t, yt), (c.instructions & Sn) === vt ? (c.instructions |= Sn, P(t, K)) : P(t, xe), P(t, e.segmentPrefix), x = ee(x.toString(16)), P(t, x), P(t, pe), P(t, e.placeholderPrefix), P(t, x), t = N(t, yn), t);
    }
    function pl(e, t) {
      hr = new Uint8Array(2048), ir = 0;
      try {
        if (!(0 < e.pendingRootTasks)) {
          var c, h = e.completedRootSegment;
          if (h !== null) {
            if (h.status === tn) return;
            var y = e.completedPreambleSegments;
            if (y === null) return;
            Pi = e.byteSize;
            var x = e.resumableState, S = e.renderState, M = S.preamble, V = M.htmlChunks, B = M.headChunks, U;
            if (V) {
              for (U = 0; U < V.length; U++)
                P(t, V[U]);
              if (B)
                for (U = 0; U < B.length; U++)
                  P(t, B[U]);
              else
                P(t, Bn("head")), P(t, yt);
            } else if (B)
              for (U = 0; U < B.length; U++)
                P(t, B[U]);
            var oe = S.charsetChunks;
            for (U = 0; U < oe.length; U++)
              P(t, oe[U]);
            oe.length = 0, S.preconnects.forEach(ne, t), S.preconnects.clear();
            var se = S.viewportChunks;
            for (U = 0; U < se.length; U++)
              P(t, se[U]);
            se.length = 0, S.fontPreloads.forEach(ne, t), S.fontPreloads.clear(), S.highImagePreloads.forEach(ne, t), S.highImagePreloads.clear(), sn = S, S.styles.forEach(Fe, t), sn = null;
            var ce = S.importMapChunks;
            for (U = 0; U < ce.length; U++)
              P(t, ce[U]);
            ce.length = 0, S.bootstrapScripts.forEach(ne, t), S.scripts.forEach(ne, t), S.scripts.clear(), S.bulkPreloads.forEach(ne, t), S.bulkPreloads.clear(), V || B || (x.instructions |= An);
            var le = S.hoistableChunks;
            for (U = 0; U < le.length; U++)
              P(t, le[U]);
            for (x = le.length = 0; x < y.length; x++) {
              var Ue = y[x];
              for (S = 0; S < Ue.length; S++)
                Ti(e, t, Ue[S], null);
            }
            var Zn = e.renderState.preamble, _e = Zn.headChunks;
            (Zn.htmlChunks || _e) && P(t, ht("head"));
            var hn = Zn.bodyChunks;
            if (hn)
              for (y = 0; y < hn.length; y++)
                P(t, hn[y]);
            Ti(e, t, h, null), e.completedRootSegment = null;
            var Pt = e.renderState;
            if (e.allPendingTasks !== 0 || e.clientRenderedBoundaries.length !== 0 || e.completedBoundaries.length !== 0 || e.trackedPostpones !== null && (e.trackedPostpones.rootNodes.length !== 0 || e.trackedPostpones.rootSlots !== null)) {
              var zt = e.resumableState;
              if ((zt.instructions & qe) === vt) {
                if (zt.instructions |= qe, P(t, Pt.startInlineScript), (zt.instructions & An) === vt) {
                  zt.instructions |= An;
                  var On = "_" + zt.idPrefix + "R_";
                  P(t, uu), P(
                    t,
                    ee(Ae(On))
                  ), P(t, un);
                }
                P(t, yt), P(t, Ac), N(t, Zi);
              }
            }
            xo(t, Pt);
          }
          var Le = e.renderState;
          h = 0;
          var Ht = Le.viewportChunks;
          for (h = 0; h < Ht.length; h++)
            P(
              t,
              Ht[h]
            );
          Ht.length = 0, Le.preconnects.forEach(ne, t), Le.preconnects.clear(), Le.fontPreloads.forEach(ne, t), Le.fontPreloads.clear(), Le.highImagePreloads.forEach(
            ne,
            t
          ), Le.highImagePreloads.clear(), Le.styles.forEach(Ke, t), Le.scripts.forEach(ne, t), Le.scripts.clear(), Le.bulkPreloads.forEach(ne, t), Le.bulkPreloads.clear();
          var Nr = Le.hoistableChunks;
          for (h = 0; h < Nr.length; h++)
            P(
              t,
              Nr[h]
            );
          Nr.length = 0;
          var Qn = e.clientRenderedBoundaries;
          for (c = 0; c < Qn.length; c++) {
            var ut = Qn[c];
            Le = t;
            var cl = e.resumableState, wr = e.renderState, er = ut.rootSegmentID, st = ut.errorDigest, Vt = ut.errorMessage, ul = ut.errorStack, Sl = ut.errorComponentStack;
            P(
              Le,
              wr.startInlineScript
            ), P(Le, yt), (cl.instructions & Dn) === vt ? (cl.instructions |= Dn, P(Le, Mt)) : P(Le, Qr), P(
              Le,
              wr.boundaryPrefix
            ), P(Le, ee(er.toString(16))), P(Le, ji), (st || Vt || ul || Sl) && (P(
              Le,
              wt
            ), P(
              Le,
              ee(
                Zl(st || "")
              )
            )), (Vt || ul || Sl) && (P(
              Le,
              wt
            ), P(
              Le,
              ee(
                Zl(Vt || "")
              )
            )), (ul || Sl) && (P(
              Le,
              wt
            ), P(
              Le,
              ee(
                Zl(ul || "")
              )
            )), Sl && (P(
              Le,
              wt
            ), P(
              Le,
              ee(
                Zl(Sl)
              )
            ));
            var nr = N(
              Le,
              lo
            );
            if (!nr) {
              e.destination = null, c++, Qn.splice(0, c);
              return;
            }
          }
          Qn.splice(0, c);
          var Tt = e.completedBoundaries;
          for (c = 0; c < Tt.length; c++)
            if (!yc(
              e,
              t,
              Tt[c]
            )) {
              e.destination = null, c++, Tt.splice(0, c);
              return;
            }
          Tt.splice(0, c), Pe(t), hr = new Uint8Array(2048), ir = 0, or = !0;
          var Lr = e.partialBoundaries;
          for (c = 0; c < Lr.length; c++) {
            e: {
              Qn = e, ut = t;
              var sl = Lr[c];
              Pi = sl.byteSize;
              var Br = sl.completedSegments;
              for (nr = 0; nr < Br.length; nr++)
                if (!Jc(
                  Qn,
                  ut,
                  sl,
                  Br[nr]
                )) {
                  nr++, Br.splice(0, nr);
                  var na = !1;
                  break e;
                }
              Br.splice(0, nr);
              var fl = sl.row;
              fl !== null && fl.together && sl.pendingTasks === 1 && (fl.pendingTasks === 1 ? ua(
                Qn,
                fl,
                fl.hoistables
              ) : fl.pendingTasks--), na = L(
                ut,
                sl.contentState,
                Qn.renderState
              );
            }
            if (!na) {
              e.destination = null, c++, Lr.splice(0, c);
              return;
            }
          }
          Lr.splice(0, c), or = !1;
          var Ut = e.completedBoundaries;
          for (c = 0; c < Ut.length; c++)
            if (!yc(e, t, Ut[c])) {
              e.destination = null, c++, Ut.splice(0, c);
              return;
            }
          Ut.splice(0, c);
        }
      } finally {
        or = !1, e.allPendingTasks === 0 && e.clientRenderedBoundaries.length === 0 && e.completedBoundaries.length === 0 ? (e.flushScheduled = !1, c = e.resumableState, c.hasBody && P(t, ht("body")), c.hasHtml && P(t, ht("html")), Pe(t), e.abortableTasks.size !== 0 && console.error(
          "There was still abortable task at the root when we closed. This is a bug in React."
        ), e.status = Dr, t.close(), e.destination = null) : Pe(t);
      }
    }
    function Tl(e) {
      e.flushScheduled = e.destination !== null, Qa(function() {
        return ga(e);
      }), ie(function() {
        e.status === 10 && (e.status = 11), e.trackedPostpones === null && Qc(e, e.pendingRootTasks === 0);
      });
    }
    function rl(e) {
      e.flushScheduled === !1 && e.pingedTasks.length === 0 && e.destination !== null && (e.flushScheduled = !0, ie(function() {
        var t = e.destination;
        t ? pl(e, t) : e.flushScheduled = !1;
      }));
    }
    function xl(e, t) {
      if (e.status === 13)
        e.status = Dr, tr(t, e.fatalError);
      else if (e.status !== Dr && e.destination === null) {
        e.destination = t;
        try {
          pl(e, t);
        } catch (c) {
          t = {}, It(e, c, t, null), wi(e, c, t, null);
        }
      }
    }
    function Gn(e, t) {
      (e.status === 11 || e.status === 10) && (e.status = 12);
      try {
        var c = e.abortableTasks;
        if (0 < c.size) {
          var h = t === void 0 ? Error("The render was aborted by the server without a reason.") : typeof t == "object" && t !== null && typeof t.then == "function" ? Error("The render was aborted by the server with a promise.") : t;
          e.fatalError = h, c.forEach(function(y) {
            var x = r, S = cn.getCurrentStack;
            r = y, cn.getCurrentStack = bi;
            try {
              gc(y, e, h);
            } finally {
              r = x, cn.getCurrentStack = S;
            }
          }), c.clear();
        }
        e.destination !== null && pl(e, e.destination);
      } catch (y) {
        t = {}, It(e, y, t, null), wi(e, y, t, null);
      }
    }
    function El(e, t, c) {
      if (t === null) c.rootNodes.push(e);
      else {
        var h = c.workingMap, y = h.get(t);
        y === void 0 && (y = [t[1], t[2], [], null], h.set(t, y), El(y, t[0], c)), y[2].push(e);
      }
    }
    function lt(e) {
      var t = e.trackedPostpones;
      if (t === null || t.rootNodes.length === 0 && t.rootSlots === null)
        return e.trackedPostpones = null;
      if (e.completedRootSegment === null || e.completedRootSegment.status !== tn && e.completedPreambleSegments !== null) {
        var c = e.nextSegmentId, h = t.rootSlots, y = e.resumableState;
        y.bootstrapScriptContent = void 0, y.bootstrapScripts = void 0, y.bootstrapModules = void 0;
      } else {
        c = 0, h = -1, y = e.resumableState;
        var x = e.renderState;
        y.nextFormID = 0, y.hasBody = !1, y.hasHtml = !1, y.unknownResources = { font: x.resets.font }, y.dnsResources = x.resets.dns, y.connectResources = x.resets.connect, y.imageResources = x.resets.image, y.styleResources = x.resets.style, y.scriptResources = {}, y.moduleUnknownResources = {}, y.moduleScriptResources = {}, y.instructions = vt;
      }
      return {
        nextSegmentId: c,
        rootFormatContext: e.rootFormatContext,
        progressiveChunkSize: e.progressiveChunkSize,
        resumableState: e.resumableState,
        replayNodes: t.rootNodes,
        replaySlots: h
      };
    }
    function ni() {
      var e = Vc.version;
      if (e !== "19.2.6")
        throw Error(
          `Incompatible React versions: The "react" and "react-dom" packages must have the exact same version. Instead got:
  - react:      ` + (e + `
  - react-dom:  19.2.6
Learn more: https://react.dev/warnings/version-mismatch`)
        );
    }
    var Vc = Ms(), Kc = yf(), jc = /* @__PURE__ */ Symbol.for("react.transitional.element"), bc = /* @__PURE__ */ Symbol.for("react.portal"), Yi = /* @__PURE__ */ Symbol.for("react.fragment"), wc = /* @__PURE__ */ Symbol.for("react.strict_mode"), pc = /* @__PURE__ */ Symbol.for("react.profiler"), Xr = /* @__PURE__ */ Symbol.for("react.consumer"), it = /* @__PURE__ */ Symbol.for("react.context"), kn = /* @__PURE__ */ Symbol.for("react.forward_ref"), va = /* @__PURE__ */ Symbol.for("react.suspense"), Ga = /* @__PURE__ */ Symbol.for("react.suspense_list"), Xa = /* @__PURE__ */ Symbol.for("react.memo"), ya = /* @__PURE__ */ Symbol.for("react.lazy"), Du = /* @__PURE__ */ Symbol.for("react.scope"), lr = /* @__PURE__ */ Symbol.for("react.activity"), Rs = /* @__PURE__ */ Symbol.for("react.legacy_hidden"), ti = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), is = /* @__PURE__ */ Symbol.for("react.view_transition"), Nu = Symbol.iterator, xi = Array.isArray, Tc = /* @__PURE__ */ new WeakMap(), fr = /* @__PURE__ */ new WeakMap(), Gi = /* @__PURE__ */ Symbol.for("react.client.reference"), as = new MessageChannel(), Za = [];
    as.port1.onmessage = function() {
      var e = Za.shift();
      e && e();
    };
    var qc = Promise, Qa = typeof queueMicrotask == "function" ? queueMicrotask : function(e) {
      qc.resolve(null).then(e).catch(He);
    }, hr = null, ir = 0, ba = new TextEncoder(), qn = Object.assign, zn = Object.prototype.hasOwnProperty, Ja = RegExp(
      "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    ), Io = {}, $c = {}, Do = new Set(
      "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
        " "
      )
    ), Lu = /* @__PURE__ */ new Map([
      ["acceptCharset", "accept-charset"],
      ["htmlFor", "for"],
      ["httpEquiv", "http-equiv"],
      ["crossOrigin", "crossorigin"],
      ["accentHeight", "accent-height"],
      ["alignmentBaseline", "alignment-baseline"],
      ["arabicForm", "arabic-form"],
      ["baselineShift", "baseline-shift"],
      ["capHeight", "cap-height"],
      ["clipPath", "clip-path"],
      ["clipRule", "clip-rule"],
      ["colorInterpolation", "color-interpolation"],
      ["colorInterpolationFilters", "color-interpolation-filters"],
      ["colorProfile", "color-profile"],
      ["colorRendering", "color-rendering"],
      ["dominantBaseline", "dominant-baseline"],
      ["enableBackground", "enable-background"],
      ["fillOpacity", "fill-opacity"],
      ["fillRule", "fill-rule"],
      ["floodColor", "flood-color"],
      ["floodOpacity", "flood-opacity"],
      ["fontFamily", "font-family"],
      ["fontSize", "font-size"],
      ["fontSizeAdjust", "font-size-adjust"],
      ["fontStretch", "font-stretch"],
      ["fontStyle", "font-style"],
      ["fontVariant", "font-variant"],
      ["fontWeight", "font-weight"],
      ["glyphName", "glyph-name"],
      ["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
      ["glyphOrientationVertical", "glyph-orientation-vertical"],
      ["horizAdvX", "horiz-adv-x"],
      ["horizOriginX", "horiz-origin-x"],
      ["imageRendering", "image-rendering"],
      ["letterSpacing", "letter-spacing"],
      ["lightingColor", "lighting-color"],
      ["markerEnd", "marker-end"],
      ["markerMid", "marker-mid"],
      ["markerStart", "marker-start"],
      ["overlinePosition", "overline-position"],
      ["overlineThickness", "overline-thickness"],
      ["paintOrder", "paint-order"],
      ["panose-1", "panose-1"],
      ["pointerEvents", "pointer-events"],
      ["renderingIntent", "rendering-intent"],
      ["shapeRendering", "shape-rendering"],
      ["stopColor", "stop-color"],
      ["stopOpacity", "stop-opacity"],
      ["strikethroughPosition", "strikethrough-position"],
      ["strikethroughThickness", "strikethrough-thickness"],
      ["strokeDasharray", "stroke-dasharray"],
      ["strokeDashoffset", "stroke-dashoffset"],
      ["strokeLinecap", "stroke-linecap"],
      ["strokeLinejoin", "stroke-linejoin"],
      ["strokeMiterlimit", "stroke-miterlimit"],
      ["strokeOpacity", "stroke-opacity"],
      ["strokeWidth", "stroke-width"],
      ["textAnchor", "text-anchor"],
      ["textDecoration", "text-decoration"],
      ["textRendering", "text-rendering"],
      ["transformOrigin", "transform-origin"],
      ["underlinePosition", "underline-position"],
      ["underlineThickness", "underline-thickness"],
      ["unicodeBidi", "unicode-bidi"],
      ["unicodeRange", "unicode-range"],
      ["unitsPerEm", "units-per-em"],
      ["vAlphabetic", "v-alphabetic"],
      ["vHanging", "v-hanging"],
      ["vIdeographic", "v-ideographic"],
      ["vMathematical", "v-mathematical"],
      ["vectorEffect", "vector-effect"],
      ["vertAdvY", "vert-adv-y"],
      ["vertOriginX", "vert-origin-x"],
      ["vertOriginY", "vert-origin-y"],
      ["wordSpacing", "word-spacing"],
      ["writingMode", "writing-mode"],
      ["xmlnsXlink", "xmlns:xlink"],
      ["xHeight", "x-height"]
    ]), Cs = {
      button: !0,
      checkbox: !0,
      image: !0,
      hidden: !0,
      radio: !0,
      reset: !0,
      submit: !0
    }, gt = {
      "aria-current": 0,
      "aria-description": 0,
      "aria-details": 0,
      "aria-disabled": 0,
      "aria-hidden": 0,
      "aria-invalid": 0,
      "aria-keyshortcuts": 0,
      "aria-label": 0,
      "aria-roledescription": 0,
      "aria-autocomplete": 0,
      "aria-checked": 0,
      "aria-expanded": 0,
      "aria-haspopup": 0,
      "aria-level": 0,
      "aria-modal": 0,
      "aria-multiline": 0,
      "aria-multiselectable": 0,
      "aria-orientation": 0,
      "aria-placeholder": 0,
      "aria-pressed": 0,
      "aria-readonly": 0,
      "aria-required": 0,
      "aria-selected": 0,
      "aria-sort": 0,
      "aria-valuemax": 0,
      "aria-valuemin": 0,
      "aria-valuenow": 0,
      "aria-valuetext": 0,
      "aria-atomic": 0,
      "aria-busy": 0,
      "aria-live": 0,
      "aria-relevant": 0,
      "aria-dropeffect": 0,
      "aria-grabbed": 0,
      "aria-activedescendant": 0,
      "aria-colcount": 0,
      "aria-colindex": 0,
      "aria-colspan": 0,
      "aria-controls": 0,
      "aria-describedby": 0,
      "aria-errormessage": 0,
      "aria-flowto": 0,
      "aria-labelledby": 0,
      "aria-owns": 0,
      "aria-posinset": 0,
      "aria-rowcount": 0,
      "aria-rowindex": 0,
      "aria-rowspan": 0,
      "aria-setsize": 0,
      "aria-braillelabel": 0,
      "aria-brailleroledescription": 0,
      "aria-colindextext": 0,
      "aria-rowindextext": 0
    }, Xi = {}, os = RegExp(
      "^(aria)-[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    ), i = RegExp(
      "^(aria)[A-Z][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    ), o = !1, f = {
      accept: "accept",
      acceptcharset: "acceptCharset",
      "accept-charset": "acceptCharset",
      accesskey: "accessKey",
      action: "action",
      allowfullscreen: "allowFullScreen",
      alt: "alt",
      as: "as",
      async: "async",
      autocapitalize: "autoCapitalize",
      autocomplete: "autoComplete",
      autocorrect: "autoCorrect",
      autofocus: "autoFocus",
      autoplay: "autoPlay",
      autosave: "autoSave",
      capture: "capture",
      cellpadding: "cellPadding",
      cellspacing: "cellSpacing",
      challenge: "challenge",
      charset: "charSet",
      checked: "checked",
      children: "children",
      cite: "cite",
      class: "className",
      classid: "classID",
      classname: "className",
      cols: "cols",
      colspan: "colSpan",
      content: "content",
      contenteditable: "contentEditable",
      contextmenu: "contextMenu",
      controls: "controls",
      controlslist: "controlsList",
      coords: "coords",
      crossorigin: "crossOrigin",
      dangerouslysetinnerhtml: "dangerouslySetInnerHTML",
      data: "data",
      datetime: "dateTime",
      default: "default",
      defaultchecked: "defaultChecked",
      defaultvalue: "defaultValue",
      defer: "defer",
      dir: "dir",
      disabled: "disabled",
      disablepictureinpicture: "disablePictureInPicture",
      disableremoteplayback: "disableRemotePlayback",
      download: "download",
      draggable: "draggable",
      enctype: "encType",
      enterkeyhint: "enterKeyHint",
      fetchpriority: "fetchPriority",
      for: "htmlFor",
      form: "form",
      formmethod: "formMethod",
      formaction: "formAction",
      formenctype: "formEncType",
      formnovalidate: "formNoValidate",
      formtarget: "formTarget",
      frameborder: "frameBorder",
      headers: "headers",
      height: "height",
      hidden: "hidden",
      high: "high",
      href: "href",
      hreflang: "hrefLang",
      htmlfor: "htmlFor",
      httpequiv: "httpEquiv",
      "http-equiv": "httpEquiv",
      icon: "icon",
      id: "id",
      imagesizes: "imageSizes",
      imagesrcset: "imageSrcSet",
      inert: "inert",
      innerhtml: "innerHTML",
      inputmode: "inputMode",
      integrity: "integrity",
      is: "is",
      itemid: "itemID",
      itemprop: "itemProp",
      itemref: "itemRef",
      itemscope: "itemScope",
      itemtype: "itemType",
      keyparams: "keyParams",
      keytype: "keyType",
      kind: "kind",
      label: "label",
      lang: "lang",
      list: "list",
      loop: "loop",
      low: "low",
      manifest: "manifest",
      marginwidth: "marginWidth",
      marginheight: "marginHeight",
      max: "max",
      maxlength: "maxLength",
      media: "media",
      mediagroup: "mediaGroup",
      method: "method",
      min: "min",
      minlength: "minLength",
      multiple: "multiple",
      muted: "muted",
      name: "name",
      nomodule: "noModule",
      nonce: "nonce",
      novalidate: "noValidate",
      open: "open",
      optimum: "optimum",
      pattern: "pattern",
      placeholder: "placeholder",
      playsinline: "playsInline",
      poster: "poster",
      preload: "preload",
      profile: "profile",
      radiogroup: "radioGroup",
      readonly: "readOnly",
      referrerpolicy: "referrerPolicy",
      rel: "rel",
      required: "required",
      reversed: "reversed",
      role: "role",
      rows: "rows",
      rowspan: "rowSpan",
      sandbox: "sandbox",
      scope: "scope",
      scoped: "scoped",
      scrolling: "scrolling",
      seamless: "seamless",
      selected: "selected",
      shape: "shape",
      size: "size",
      sizes: "sizes",
      span: "span",
      spellcheck: "spellCheck",
      src: "src",
      srcdoc: "srcDoc",
      srclang: "srcLang",
      srcset: "srcSet",
      start: "start",
      step: "step",
      style: "style",
      summary: "summary",
      tabindex: "tabIndex",
      target: "target",
      title: "title",
      type: "type",
      usemap: "useMap",
      value: "value",
      width: "width",
      wmode: "wmode",
      wrap: "wrap",
      about: "about",
      accentheight: "accentHeight",
      "accent-height": "accentHeight",
      accumulate: "accumulate",
      additive: "additive",
      alignmentbaseline: "alignmentBaseline",
      "alignment-baseline": "alignmentBaseline",
      allowreorder: "allowReorder",
      alphabetic: "alphabetic",
      amplitude: "amplitude",
      arabicform: "arabicForm",
      "arabic-form": "arabicForm",
      ascent: "ascent",
      attributename: "attributeName",
      attributetype: "attributeType",
      autoreverse: "autoReverse",
      azimuth: "azimuth",
      basefrequency: "baseFrequency",
      baselineshift: "baselineShift",
      "baseline-shift": "baselineShift",
      baseprofile: "baseProfile",
      bbox: "bbox",
      begin: "begin",
      bias: "bias",
      by: "by",
      calcmode: "calcMode",
      capheight: "capHeight",
      "cap-height": "capHeight",
      clip: "clip",
      clippath: "clipPath",
      "clip-path": "clipPath",
      clippathunits: "clipPathUnits",
      cliprule: "clipRule",
      "clip-rule": "clipRule",
      color: "color",
      colorinterpolation: "colorInterpolation",
      "color-interpolation": "colorInterpolation",
      colorinterpolationfilters: "colorInterpolationFilters",
      "color-interpolation-filters": "colorInterpolationFilters",
      colorprofile: "colorProfile",
      "color-profile": "colorProfile",
      colorrendering: "colorRendering",
      "color-rendering": "colorRendering",
      contentscripttype: "contentScriptType",
      contentstyletype: "contentStyleType",
      cursor: "cursor",
      cx: "cx",
      cy: "cy",
      d: "d",
      datatype: "datatype",
      decelerate: "decelerate",
      descent: "descent",
      diffuseconstant: "diffuseConstant",
      direction: "direction",
      display: "display",
      divisor: "divisor",
      dominantbaseline: "dominantBaseline",
      "dominant-baseline": "dominantBaseline",
      dur: "dur",
      dx: "dx",
      dy: "dy",
      edgemode: "edgeMode",
      elevation: "elevation",
      enablebackground: "enableBackground",
      "enable-background": "enableBackground",
      end: "end",
      exponent: "exponent",
      externalresourcesrequired: "externalResourcesRequired",
      fill: "fill",
      fillopacity: "fillOpacity",
      "fill-opacity": "fillOpacity",
      fillrule: "fillRule",
      "fill-rule": "fillRule",
      filter: "filter",
      filterres: "filterRes",
      filterunits: "filterUnits",
      floodopacity: "floodOpacity",
      "flood-opacity": "floodOpacity",
      floodcolor: "floodColor",
      "flood-color": "floodColor",
      focusable: "focusable",
      fontfamily: "fontFamily",
      "font-family": "fontFamily",
      fontsize: "fontSize",
      "font-size": "fontSize",
      fontsizeadjust: "fontSizeAdjust",
      "font-size-adjust": "fontSizeAdjust",
      fontstretch: "fontStretch",
      "font-stretch": "fontStretch",
      fontstyle: "fontStyle",
      "font-style": "fontStyle",
      fontvariant: "fontVariant",
      "font-variant": "fontVariant",
      fontweight: "fontWeight",
      "font-weight": "fontWeight",
      format: "format",
      from: "from",
      fx: "fx",
      fy: "fy",
      g1: "g1",
      g2: "g2",
      glyphname: "glyphName",
      "glyph-name": "glyphName",
      glyphorientationhorizontal: "glyphOrientationHorizontal",
      "glyph-orientation-horizontal": "glyphOrientationHorizontal",
      glyphorientationvertical: "glyphOrientationVertical",
      "glyph-orientation-vertical": "glyphOrientationVertical",
      glyphref: "glyphRef",
      gradienttransform: "gradientTransform",
      gradientunits: "gradientUnits",
      hanging: "hanging",
      horizadvx: "horizAdvX",
      "horiz-adv-x": "horizAdvX",
      horizoriginx: "horizOriginX",
      "horiz-origin-x": "horizOriginX",
      ideographic: "ideographic",
      imagerendering: "imageRendering",
      "image-rendering": "imageRendering",
      in2: "in2",
      in: "in",
      inlist: "inlist",
      intercept: "intercept",
      k1: "k1",
      k2: "k2",
      k3: "k3",
      k4: "k4",
      k: "k",
      kernelmatrix: "kernelMatrix",
      kernelunitlength: "kernelUnitLength",
      kerning: "kerning",
      keypoints: "keyPoints",
      keysplines: "keySplines",
      keytimes: "keyTimes",
      lengthadjust: "lengthAdjust",
      letterspacing: "letterSpacing",
      "letter-spacing": "letterSpacing",
      lightingcolor: "lightingColor",
      "lighting-color": "lightingColor",
      limitingconeangle: "limitingConeAngle",
      local: "local",
      markerend: "markerEnd",
      "marker-end": "markerEnd",
      markerheight: "markerHeight",
      markermid: "markerMid",
      "marker-mid": "markerMid",
      markerstart: "markerStart",
      "marker-start": "markerStart",
      markerunits: "markerUnits",
      markerwidth: "markerWidth",
      mask: "mask",
      maskcontentunits: "maskContentUnits",
      maskunits: "maskUnits",
      mathematical: "mathematical",
      mode: "mode",
      numoctaves: "numOctaves",
      offset: "offset",
      opacity: "opacity",
      operator: "operator",
      order: "order",
      orient: "orient",
      orientation: "orientation",
      origin: "origin",
      overflow: "overflow",
      overlineposition: "overlinePosition",
      "overline-position": "overlinePosition",
      overlinethickness: "overlineThickness",
      "overline-thickness": "overlineThickness",
      paintorder: "paintOrder",
      "paint-order": "paintOrder",
      panose1: "panose1",
      "panose-1": "panose1",
      pathlength: "pathLength",
      patterncontentunits: "patternContentUnits",
      patterntransform: "patternTransform",
      patternunits: "patternUnits",
      pointerevents: "pointerEvents",
      "pointer-events": "pointerEvents",
      points: "points",
      pointsatx: "pointsAtX",
      pointsaty: "pointsAtY",
      pointsatz: "pointsAtZ",
      popover: "popover",
      popovertarget: "popoverTarget",
      popovertargetaction: "popoverTargetAction",
      prefix: "prefix",
      preservealpha: "preserveAlpha",
      preserveaspectratio: "preserveAspectRatio",
      primitiveunits: "primitiveUnits",
      property: "property",
      r: "r",
      radius: "radius",
      refx: "refX",
      refy: "refY",
      renderingintent: "renderingIntent",
      "rendering-intent": "renderingIntent",
      repeatcount: "repeatCount",
      repeatdur: "repeatDur",
      requiredextensions: "requiredExtensions",
      requiredfeatures: "requiredFeatures",
      resource: "resource",
      restart: "restart",
      result: "result",
      results: "results",
      rotate: "rotate",
      rx: "rx",
      ry: "ry",
      scale: "scale",
      security: "security",
      seed: "seed",
      shaperendering: "shapeRendering",
      "shape-rendering": "shapeRendering",
      slope: "slope",
      spacing: "spacing",
      specularconstant: "specularConstant",
      specularexponent: "specularExponent",
      speed: "speed",
      spreadmethod: "spreadMethod",
      startoffset: "startOffset",
      stddeviation: "stdDeviation",
      stemh: "stemh",
      stemv: "stemv",
      stitchtiles: "stitchTiles",
      stopcolor: "stopColor",
      "stop-color": "stopColor",
      stopopacity: "stopOpacity",
      "stop-opacity": "stopOpacity",
      strikethroughposition: "strikethroughPosition",
      "strikethrough-position": "strikethroughPosition",
      strikethroughthickness: "strikethroughThickness",
      "strikethrough-thickness": "strikethroughThickness",
      string: "string",
      stroke: "stroke",
      strokedasharray: "strokeDasharray",
      "stroke-dasharray": "strokeDasharray",
      strokedashoffset: "strokeDashoffset",
      "stroke-dashoffset": "strokeDashoffset",
      strokelinecap: "strokeLinecap",
      "stroke-linecap": "strokeLinecap",
      strokelinejoin: "strokeLinejoin",
      "stroke-linejoin": "strokeLinejoin",
      strokemiterlimit: "strokeMiterlimit",
      "stroke-miterlimit": "strokeMiterlimit",
      strokewidth: "strokeWidth",
      "stroke-width": "strokeWidth",
      strokeopacity: "strokeOpacity",
      "stroke-opacity": "strokeOpacity",
      suppresscontenteditablewarning: "suppressContentEditableWarning",
      suppresshydrationwarning: "suppressHydrationWarning",
      surfacescale: "surfaceScale",
      systemlanguage: "systemLanguage",
      tablevalues: "tableValues",
      targetx: "targetX",
      targety: "targetY",
      textanchor: "textAnchor",
      "text-anchor": "textAnchor",
      textdecoration: "textDecoration",
      "text-decoration": "textDecoration",
      textlength: "textLength",
      textrendering: "textRendering",
      "text-rendering": "textRendering",
      to: "to",
      transform: "transform",
      transformorigin: "transformOrigin",
      "transform-origin": "transformOrigin",
      typeof: "typeof",
      u1: "u1",
      u2: "u2",
      underlineposition: "underlinePosition",
      "underline-position": "underlinePosition",
      underlinethickness: "underlineThickness",
      "underline-thickness": "underlineThickness",
      unicode: "unicode",
      unicodebidi: "unicodeBidi",
      "unicode-bidi": "unicodeBidi",
      unicoderange: "unicodeRange",
      "unicode-range": "unicodeRange",
      unitsperem: "unitsPerEm",
      "units-per-em": "unitsPerEm",
      unselectable: "unselectable",
      valphabetic: "vAlphabetic",
      "v-alphabetic": "vAlphabetic",
      values: "values",
      vectoreffect: "vectorEffect",
      "vector-effect": "vectorEffect",
      version: "version",
      vertadvy: "vertAdvY",
      "vert-adv-y": "vertAdvY",
      vertoriginx: "vertOriginX",
      "vert-origin-x": "vertOriginX",
      vertoriginy: "vertOriginY",
      "vert-origin-y": "vertOriginY",
      vhanging: "vHanging",
      "v-hanging": "vHanging",
      videographic: "vIdeographic",
      "v-ideographic": "vIdeographic",
      viewbox: "viewBox",
      viewtarget: "viewTarget",
      visibility: "visibility",
      vmathematical: "vMathematical",
      "v-mathematical": "vMathematical",
      vocab: "vocab",
      widths: "widths",
      wordspacing: "wordSpacing",
      "word-spacing": "wordSpacing",
      writingmode: "writingMode",
      "writing-mode": "writingMode",
      x1: "x1",
      x2: "x2",
      x: "x",
      xchannelselector: "xChannelSelector",
      xheight: "xHeight",
      "x-height": "xHeight",
      xlinkactuate: "xlinkActuate",
      "xlink:actuate": "xlinkActuate",
      xlinkarcrole: "xlinkArcrole",
      "xlink:arcrole": "xlinkArcrole",
      xlinkhref: "xlinkHref",
      "xlink:href": "xlinkHref",
      xlinkrole: "xlinkRole",
      "xlink:role": "xlinkRole",
      xlinkshow: "xlinkShow",
      "xlink:show": "xlinkShow",
      xlinktitle: "xlinkTitle",
      "xlink:title": "xlinkTitle",
      xlinktype: "xlinkType",
      "xlink:type": "xlinkType",
      xmlbase: "xmlBase",
      "xml:base": "xmlBase",
      xmllang: "xmlLang",
      "xml:lang": "xmlLang",
      xmlns: "xmlns",
      "xml:space": "xmlSpace",
      xmlnsxlink: "xmlnsXlink",
      "xmlns:xlink": "xmlnsXlink",
      xmlspace: "xmlSpace",
      y1: "y1",
      y2: "y2",
      y: "y",
      ychannelselector: "yChannelSelector",
      z: "z",
      zoomandpan: "zoomAndPan"
    }, g = {}, p = /^on./, m = /^on[^A-Z]/, A = RegExp(
      "^(aria)-[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    ), Q = RegExp(
      "^(aria)[A-Z][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    ), I = /^(?:webkit|moz|o)[A-Z]/, G = /^-ms-/, re = /-(.)/g, $ = /;\s*$/, ve = {}, Ne = {}, on = !1, Ze = !1, ze = /["'&<>]/, je = /([A-Z])/g, Xe = /^ms-/, at = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i, cn = Vc.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, wn = Kc.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Mn = Object.freeze({
      pending: !1,
      data: null,
      method: null,
      action: null
    }), en = wn.d;
    wn.d = {
      f: en.f,
      r: en.r,
      D: function(e) {
        var t = Wn || null;
        if (t) {
          var c = t.resumableState, h = t.renderState;
          if (typeof e == "string" && e) {
            if (!c.dnsResources.hasOwnProperty(e)) {
              c.dnsResources[e] = Pn, c = h.headers;
              var y, x;
              (x = c && 0 < c.remainingCapacity) && (x = (y = "<" + La(e) + ">; rel=dns-prefetch", 0 <= (c.remainingCapacity -= y.length + 2))), x ? (h.resets.dns[e] = Pn, c.preconnects && (c.preconnects += ", "), c.preconnects += y) : (y = [], De(y, { href: e, rel: "dns-prefetch" }), h.preconnects.add(y));
            }
            rl(t);
          }
        } else en.D(e);
      },
      C: function(e, t) {
        var c = Wn || null;
        if (c) {
          var h = c.resumableState, y = c.renderState;
          if (typeof e == "string" && e) {
            var x = t === "use-credentials" ? "credentials" : typeof t == "string" ? "anonymous" : "default";
            if (!h.connectResources[x].hasOwnProperty(e)) {
              h.connectResources[x][e] = Pn, h = y.headers;
              var S, M;
              if (M = h && 0 < h.remainingCapacity) {
                if (M = "<" + La(e) + ">; rel=preconnect", typeof t == "string") {
                  var V = tl(
                    t,
                    "crossOrigin"
                  );
                  M += '; crossorigin="' + V + '"';
                }
                M = (S = M, 0 <= (h.remainingCapacity -= S.length + 2));
              }
              M ? (y.resets.connect[x][e] = Pn, h.preconnects && (h.preconnects += ", "), h.preconnects += S) : (x = [], De(x, {
                rel: "preconnect",
                href: e,
                crossOrigin: t
              }), y.preconnects.add(x));
            }
            rl(c);
          }
        } else en.C(e, t);
      },
      L: function(e, t, c) {
        var h = Wn || null;
        if (h) {
          var y = h.resumableState, x = h.renderState;
          if (t && e) {
            switch (t) {
              case "image":
                if (c)
                  var S = c.imageSrcSet, M = c.imageSizes, V = c.fetchPriority;
                var B = S ? S + `
` + (M || "") : e;
                if (y.imageResources.hasOwnProperty(B)) return;
                y.imageResources[B] = qt, y = x.headers;
                var U;
                y && 0 < y.remainingCapacity && typeof S != "string" && V === "high" && (U = oa(e, t, c), 0 <= (y.remainingCapacity -= U.length + 2)) ? (x.resets.image[B] = qt, y.highImagePreloads && (y.highImagePreloads += ", "), y.highImagePreloads += U) : (y = [], De(
                  y,
                  qn(
                    {
                      rel: "preload",
                      href: S ? void 0 : e,
                      as: t
                    },
                    c
                  )
                ), V === "high" ? x.highImagePreloads.add(y) : (x.bulkPreloads.add(y), x.preloads.images.set(B, y)));
                break;
              case "style":
                if (y.styleResources.hasOwnProperty(e)) return;
                S = [], De(
                  S,
                  qn({ rel: "preload", href: e, as: t }, c)
                ), y.styleResources[e] = !c || typeof c.crossOrigin != "string" && typeof c.integrity != "string" ? qt : [c.crossOrigin, c.integrity], x.preloads.stylesheets.set(e, S), x.bulkPreloads.add(S);
                break;
              case "script":
                if (y.scriptResources.hasOwnProperty(e)) return;
                S = [], x.preloads.scripts.set(e, S), x.bulkPreloads.add(S), De(
                  S,
                  qn({ rel: "preload", href: e, as: t }, c)
                ), y.scriptResources[e] = !c || typeof c.crossOrigin != "string" && typeof c.integrity != "string" ? qt : [c.crossOrigin, c.integrity];
                break;
              default:
                if (y.unknownResources.hasOwnProperty(t)) {
                  if (S = y.unknownResources[t], S.hasOwnProperty(e))
                    return;
                } else
                  S = {}, y.unknownResources[t] = S;
                S[e] = qt, (y = x.headers) && 0 < y.remainingCapacity && t === "font" && (B = oa(e, t, c), 0 <= (y.remainingCapacity -= B.length + 2)) ? (x.resets.font[e] = qt, y.fontPreloads && (y.fontPreloads += ", "), y.fontPreloads += B) : (y = [], e = qn(
                  { rel: "preload", href: e, as: t },
                  c
                ), De(y, e), t) === "font" ? x.fontPreloads.add(y) : x.bulkPreloads.add(y);
            }
            rl(h);
          }
        } else en.L(e, t, c);
      },
      m: function(e, t) {
        var c = Wn || null;
        if (c) {
          var h = c.resumableState, y = c.renderState;
          if (e) {
            var x = t && typeof t.as == "string" ? t.as : "script";
            switch (x) {
              case "script":
                if (h.moduleScriptResources.hasOwnProperty(e))
                  return;
                x = [], h.moduleScriptResources[e] = !t || typeof t.crossOrigin != "string" && typeof t.integrity != "string" ? qt : [t.crossOrigin, t.integrity], y.preloads.moduleScripts.set(e, x);
                break;
              default:
                if (h.moduleUnknownResources.hasOwnProperty(x)) {
                  var S = h.unknownResources[x];
                  if (S.hasOwnProperty(e)) return;
                } else
                  S = {}, h.moduleUnknownResources[x] = S;
                x = [], S[e] = qt;
            }
            De(
              x,
              qn({ rel: "modulepreload", href: e }, t)
            ), y.bulkPreloads.add(x), rl(c);
          }
        } else en.m(e, t);
      },
      X: function(e, t) {
        var c = Wn || null;
        if (c) {
          var h = c.resumableState, y = c.renderState;
          if (e) {
            var x = h.scriptResources.hasOwnProperty(
              e
            ) ? h.scriptResources[e] : void 0;
            x !== Pn && (h.scriptResources[e] = Pn, t = qn({ src: e, async: !0 }, t), x && (x.length === 2 && hi(t, x), e = y.preloads.scripts.get(e)) && (e.length = 0), e = [], y.scripts.add(e), Na(e, t), rl(c));
          }
        } else en.X(e, t);
      },
      S: function(e, t, c) {
        var h = Wn || null;
        if (h) {
          var y = h.resumableState, x = h.renderState;
          if (e) {
            t = t || "default";
            var S = x.styles.get(t), M = y.styleResources.hasOwnProperty(e) ? y.styleResources[e] : void 0;
            M !== Pn && (y.styleResources[e] = Pn, S || (S = {
              precedence: ee(Ae(t)),
              rules: [],
              hrefs: [],
              sheets: /* @__PURE__ */ new Map()
            }, x.styles.set(t, S)), t = {
              state: Sa,
              props: qn(
                {
                  rel: "stylesheet",
                  href: e,
                  "data-precedence": t
                },
                c
              )
            }, M && (M.length === 2 && hi(t.props, M), (x = x.preloads.stylesheets.get(e)) && 0 < x.length ? x.length = 0 : t.state = hu), S.sheets.set(e, t), rl(h));
          }
        } else en.S(e, t, c);
      },
      M: function(e, t) {
        var c = Wn || null;
        if (c) {
          var h = c.resumableState, y = c.renderState;
          if (e) {
            var x = h.moduleScriptResources.hasOwnProperty(e) ? h.moduleScriptResources[e] : void 0;
            x !== Pn && (h.moduleScriptResources[e] = Pn, t = qn(
              { src: e, type: "module", async: !0 },
              t
            ), x && (x.length === 2 && hi(t, x), e = y.preloads.moduleScripts.get(e)) && (e.length = 0), e = [], y.scripts.add(e), Na(e, t), rl(c));
          }
        } else en.M(e, t);
      }
    };
    var vt = 0, Sn = 1, Rr = 2, Dn = 4, En = 8, An = 32, qe = 64, Pn = null, qt = [];
    Object.freeze(qt);
    var sn = null;
    X('"></template>');
    var wa = X("<script"), Zi = X("<\/script>"), Cr = X('<script src="'), Al = X('<script type="module" src="'), Pl = X(' nonce="'), Fl = X(' integrity="'), Ei = X(' crossorigin="'), Qi = X(' async=""><\/script>'), Jt = X("<style"), Va = /(<\/|<)(s)(cript)/gi, Ka = X(
      '<script type="importmap">'
    ), xc = X("<\/script>"), eu = {}, No = 0, pa = 1, mr = 2, Ec = 3, kr = 4, Rl = 5, Ji = 6, Rc = 7, Vi = 8, nu = 9, Lt = X("<!-- -->"), Cc = /* @__PURE__ */ new Map(), Ta = X(' style="'), Lo = X(":"), ja = X(";"), Ot = X(" "), Cl = X('="'), un = X('"'), Ki = X('=""'), Bo = X(
      Ae(
        "javascript:throw new Error('React form unexpectedly submitted.')"
      )
    ), xa = X('<input type="hidden"'), yt = X(">"), Zr = X("/>"), Ea = !1, qa = !1, Ol = !1, dr = !1, _o = !1, Sr = !1, Bu = !1, $a = !1, mc = !1, tu = !1, ru = !1, Ri = X(' selected=""'), eo = X(
      `addEventListener("submit",function(a){if(!a.defaultPrevented){var c=a.target,d=a.submitter,e=c.action,b=d;if(d){var f=d.getAttribute("formAction");null!=f&&(e=f,b=null)}"javascript:throw new Error('React form unexpectedly submitted.')"===e&&(a.preventDefault(),b?(a=document.createElement("input"),a.name=b.name,a.value=b.value,b.parentNode.insertBefore(a,b),b=new FormData(c),a.parentNode.removeChild(a)):b=new FormData(c),a=c.ownerDocument||c,(a.$$reactFormReplay=a.$$reactFormReplay||[]).push(c,d,b))}});`
    ), no = X("<!--F!-->"), Ar = X("<!--F-->"), kc = /(<\/|<)(s)(tyle)/gi, Sc = X("<!--head-->"), _u = X("<!--body-->"), zu = X("<!--html-->"), lu = X(`
`), Hu = /^[a-zA-Z][a-zA-Z:_\.\-\d]*$/, Uu = /* @__PURE__ */ new Map(), Bt = X("<!DOCTYPE html>"), iu = /* @__PURE__ */ new Map(), Ac = X(
      "requestAnimationFrame(function(){$RT=performance.now()});"
    ), Pc = X('<template id="'), au = X('"></template>'), Wu = X("<!--&-->"), ou = X("<!--/&-->"), cu = X("<!--$-->"), Ra = X(
      '<!--$?--><template id="'
    ), Ml = X('"></template>'), cs = X("<!--$!-->"), to = X("<!--/$-->"), Fc = X("<template"), ri = X('"'), zo = X(' data-dgst="'), Ca = X(' data-msg="'), Oc = X(' data-stck="'), ma = X(' data-cstck="'), us = X("></template>"), ss = X('<div hidden id="'), li = X('">'), Ho = X("</div>"), ml = X(
      '<svg aria-hidden="true" style="display:none" id="'
    ), ka = X('">'), ro = X("</svg>"), Il = X(
      '<math aria-hidden="true" style="display:none" id="'
    ), Yu = X('">'), fs = X("</math>"), Uo = X('<table hidden id="'), l = X('">'), a = X("</table>"), s = X(
      '<table hidden><tbody id="'
    ), v = X('">'), w = X("</tbody></table>"), C = X('<table hidden><tr id="'), k = X('">'), _ = X("</tr></table>"), O = X(
      '<table hidden><colgroup id="'
    ), z = X('">'), Z = X("</colgroup></table>"), K = X(
      '$RS=function(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};$RS("'
    ), xe = X('$RS("'), pe = X('","'), yn = X('")<\/script>');
    X('<template data-rsi="" data-sid="'), X('" data-pid="');
    var Qe = X(
      `$RB=[];$RV=function(a){$RT=performance.now();for(var b=0;b<a.length;b+=2){var c=a[b],e=a[b+1];null!==e.parentNode&&e.parentNode.removeChild(e);var f=c.parentNode;if(f){var g=c.previousSibling,h=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d||"/&"===d)if(0===h)break;else h--;else"$"!==d&&"$?"!==d&&"$~"!==d&&"$!"!==d&&"&"!==d||h++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;e.firstChild;)f.insertBefore(e.firstChild,c);g.data="$";g._reactRetry&&requestAnimationFrame(g._reactRetry)}}a.length=0};
$RC=function(a,b){if(b=document.getElementById(b))(a=document.getElementById(a))?(a.previousSibling.data="$~",$RB.push(a,b),2===$RB.length&&("number"!==typeof $RT?requestAnimationFrame($RV.bind(null,$RB)):(a=performance.now(),setTimeout($RV.bind(null,$RB),2300>a&&2E3<a?2300-a:$RT+300-a)))):b.parentNode.removeChild(b)};`
    );
    ee(
      `$RV=function(A,g){function k(a,b){var e=a.getAttribute(b);e&&(b=a.style,l.push(a,b.viewTransitionName,b.viewTransitionClass),"auto"!==e&&(b.viewTransitionClass=e),(a=a.getAttribute("vt-name"))||(a="_T_"+K++ +"_"),b.viewTransitionName=a,B=!0)}var B=!1,K=0,l=[];try{var f=document.__reactViewTransition;if(f){f.finished.finally($RV.bind(null,g));return}var m=new Map;for(f=1;f<g.length;f+=2)for(var h=g[f].querySelectorAll("[vt-share]"),d=0;d<h.length;d++){var c=h[d];m.set(c.getAttribute("vt-name"),c)}var u=[];for(h=0;h<g.length;h+=2){var C=g[h],x=C.parentNode;if(x){var v=x.getBoundingClientRect();if(v.left||v.top||v.width||v.height){c=C;for(f=0;c;){if(8===c.nodeType){var r=c.data;if("/$"===r)if(0===f)break;else f--;else"$"!==r&&"$?"!==r&&"$~"!==r&&"$!"!==r||f++}else if(1===c.nodeType){d=c;var D=d.getAttribute("vt-name"),y=m.get(D);k(d,y?"vt-share":"vt-exit");y&&(k(y,"vt-share"),m.set(D,null));var E=d.querySelectorAll("[vt-share]");for(d=0;d<E.length;d++){var F=E[d],G=F.getAttribute("vt-name"),
H=m.get(G);H&&(k(F,"vt-share"),k(H,"vt-share"),m.set(G,null))}}c=c.nextSibling}for(var I=g[h+1],t=I.firstElementChild;t;)null!==m.get(t.getAttribute("vt-name"))&&k(t,"vt-enter"),t=t.nextElementSibling;c=x;do for(var n=c.firstElementChild;n;){var J=n.getAttribute("vt-update");J&&"none"!==J&&!l.includes(n)&&k(n,"vt-update");n=n.nextElementSibling}while((c=c.parentNode)&&1===c.nodeType&&"none"!==c.getAttribute("vt-update"));u.push.apply(u,I.querySelectorAll('img[src]:not([loading="lazy"])'))}}}if(B){var z=
document.__reactViewTransition=document.startViewTransition({update:function(){A(g);for(var a=[document.documentElement.clientHeight,document.fonts.ready],b={},e=0;e<u.length;b={g:b.g},e++)if(b.g=u[e],!b.g.complete){var p=b.g.getBoundingClientRect();0<p.bottom&&0<p.right&&p.top<window.innerHeight&&p.left<window.innerWidth&&(p=new Promise(function(w){return function(q){w.g.addEventListener("load",q);w.g.addEventListener("error",q)}}(b)),a.push(p))}return Promise.race([Promise.all(a),new Promise(function(w){var q=
performance.now();setTimeout(w,2300>q&&2E3<q?2300-q:500)})])},types:[]});z.ready.finally(function(){for(var a=l.length-3;0<=a;a-=3){var b=l[a],e=b.style;e.viewTransitionName=l[a+1];e.viewTransitionClass=l[a+1];""===b.getAttribute("style")&&b.removeAttribute("style")}});z.finished.finally(function(){document.__reactViewTransition===z&&(document.__reactViewTransition=null)});$RB=[];return}}catch(a){}A(g)}.bind(null,$RV);`
    );
    var bn = X('$RC("'), bt = X(
      `$RM=new Map;$RR=function(n,w,p){function u(q){this._p=null;q()}for(var r=new Map,t=document,h,b,e=t.querySelectorAll("link[data-precedence],style[data-precedence]"),v=[],k=0;b=e[k++];)"not all"===b.getAttribute("media")?v.push(b):("LINK"===b.tagName&&$RM.set(b.getAttribute("href"),b),r.set(b.dataset.precedence,h=b));e=0;b=[];var l,a;for(k=!0;;){if(k){var f=p[e++];if(!f){k=!1;e=0;continue}var c=!1,m=0;var d=f[m++];if(a=$RM.get(d)){var g=a._p;c=!0}else{a=t.createElement("link");a.href=d;a.rel=
"stylesheet";for(a.dataset.precedence=l=f[m++];g=f[m++];)a.setAttribute(g,f[m++]);g=a._p=new Promise(function(q,x){a.onload=u.bind(a,q);a.onerror=u.bind(a,x)});$RM.set(d,a)}d=a.getAttribute("media");!g||d&&!matchMedia(d).matches||b.push(g);if(c)continue}else{a=v[e++];if(!a)break;l=a.getAttribute("data-precedence");a.removeAttribute("media")}c=r.get(l)||h;c===h&&(h=a);r.set(l,a);c?c.parentNode.insertBefore(a,c.nextSibling):(c=t.head,c.insertBefore(a,c.firstChild))}if(p=document.getElementById(n))p.previousSibling.data=
"$~";Promise.all(b).then($RC.bind(null,n,w),$RX.bind(null,n,"CSS failed to load"))};$RR("`
    ), $n = X('$RR("'), gr = X('","'), ll = X('",'), Dl = X('"'), Je = X(")<\/script>");
    X('<template data-rci="" data-bid="'), X('<template data-rri="" data-bid="'), X('" data-sid="'), X('" data-sty="');
    var Pr = X(
      '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};'
    ), Mt = X(
      '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};;$RX("'
    ), Qr = X('$RX("'), ji = X('"'), wt = X(","), lo = X(")<\/script>");
    X('<template data-rxi="" data-bid="'), X('" data-dgst="'), X('" data-msg="'), X('" data-stck="'), X('" data-cstck="');
    var Nl = /[<\u2028\u2029]/g, Fr = /[&><\u2028\u2029]/g, ii = X(
      ' media="not all" data-precedence="'
    ), Or = X('" data-href="'), io = X('">'), Wo = X("</style>"), Jr = !1, Yo = !0, Mr = [], ao = X(' data-precedence="'), Gu = X('" data-href="'), ot = X(" "), Go = X('">'), ai = X("</style>");
    X('<link rel="expect" href="#'), X('" blocking="render"/>');
    var uu = X(' id="'), oo = X("["), su = X(",["), fu = X(","), Xo = X("]"), Sa = 0, hu = 1, Ci = 2, co = 3, uo = /[<>\r\n]/g, hs = /["';,\r\n]/g, Ll = Function.prototype.bind, ds = /* @__PURE__ */ Symbol.for("react.client.reference"), kl = {};
    Object.freeze(kl);
    var Aa = {}, qi = null, du = {}, gu = {}, vu = /* @__PURE__ */ new Set(), so = /* @__PURE__ */ new Set(), gs = /* @__PURE__ */ new Set(), Xu = /* @__PURE__ */ new Set(), Zo = /* @__PURE__ */ new Set(), vs = /* @__PURE__ */ new Set(), yu = /* @__PURE__ */ new Set(), ms = /* @__PURE__ */ new Set(), Zu = /* @__PURE__ */ new Set(), ks = {
      enqueueSetState: function(e, t, c) {
        var h = e._reactInternals;
        h.queue === null ? sr(e, "setState") : (h.queue.push(t), c != null && Vl(c));
      },
      enqueueReplaceState: function(e, t, c) {
        e = e._reactInternals, e.replace = !0, e.queue = [t], c != null && Vl(c);
      },
      enqueueForceUpdate: function(e, t) {
        e._reactInternals.queue === null ? sr(e, "forceUpdate") : t != null && Vl(t);
      }
    }, bu = { id: 1, overflow: "" }, Qo = Math.clz32 ? Math.clz32 : Wc, Is = Math.log, Ds = Math.LN2, mi = Error(
      "Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`."
    ), ys = null, Ns = typeof Object.is == "function" ? Object.is : Yc, ar = null, $i = null, Ir = null, Pa = null, Bl = null, Nn = null, il = !1, ea = !1, _t = 0, Mc = 0, wu = -1, bs = 0, Jo = null, fo = null, Ic = 0, oi = !1, ho, Dc = {
      readContext: ts,
      use: function(e) {
        if (e !== null && typeof e == "object") {
          if (typeof e.then == "function")
            return Zt(e);
          if (e.$$typeof === it)
            return ts(e);
        }
        throw Error(
          "An unsupported type was passed to use(): " + String(e)
        );
      },
      useContext: function(e) {
        return ho = "useContext", rt(), e._currentValue;
      },
      useMemo: Co,
      useReducer: Ro,
      useRef: function(e) {
        ar = rt(), Nn = Eo();
        var t = Nn.memoizedState;
        return t === null ? (e = { current: e }, Object.seal(e), Nn.memoizedState = e) : t;
      },
      useState: function(e) {
        return ho = "useState", Ro(rs, e);
      },
      useInsertionEffect: Er,
      useLayoutEffect: Er,
      useCallback: function(e, t) {
        return Co(function() {
          return e;
        }, t);
      },
      useImperativeHandle: Er,
      useEffect: Er,
      useDebugValue: Er,
      useDeferredValue: function(e, t) {
        return rt(), t !== void 0 ? t : e;
      },
      useTransition: function() {
        return rt(), [!1, Xc];
      },
      useId: function() {
        var e = $i.treeContext, t = e.overflow;
        e = e.id, e = (e & ~(1 << 32 - Qo(e) - 1)).toString(32) + t;
        var c = n;
        if (c === null)
          throw Error(
            "Invalid hook call. Hooks can only be called inside of the body of a function component."
          );
        return t = _t++, e = "_" + c.idPrefix + "R_" + e, 0 < t && (e += "H" + t.toString(32)), e + "_";
      },
      useSyncExternalStore: function(e, t, c) {
        if (c === void 0)
          throw Error(
            "Missing getServerSnapshot, which is required for server-rendered content. Will revert to client rendering."
          );
        return c();
      },
      useOptimistic: function(e) {
        return rt(), [e, cc];
      },
      useActionState: uc,
      useFormState: uc,
      useHostTransitionStatus: function() {
        return rt(), Mn;
      },
      useMemoCache: function(e) {
        for (var t = Array(e), c = 0; c < e; c++)
          t[c] = ti;
        return t;
      },
      useCacheRefresh: function() {
        return mo;
      },
      useEffectEvent: function() {
        return vi;
      }
    }, n = null, r = null, u = {
      getCacheForType: function() {
        throw Error("Not implemented.");
      },
      cacheSignal: function() {
        throw Error("Not implemented.");
      },
      getOwner: function() {
        return r === null ? null : r.componentStack;
      }
    }, d = 0, b, E, F, D, te, H, j;
    sc.__reactDisabledLog = !0;
    var ge, Ce, ye = !1, ae = new (typeof WeakMap == "function" ? WeakMap : Map)(), fn = {
      react_stack_bottom_frame: function(e, t, c) {
        return e(t, c);
      }
    }, Jn = fn.react_stack_bottom_frame.bind(fn), Ye = {
      react_stack_bottom_frame: function(e) {
        return e.render();
      }
    }, Fn = Ye.react_stack_bottom_frame.bind(Ye), vr = {
      react_stack_bottom_frame: function(e) {
        var t = e._init;
        return t(e._payload);
      }
    }, yr = vr.react_stack_bottom_frame.bind(vr), In = 0;
    if (typeof performance == "object" && typeof performance.now == "function")
      var $t = performance, ki = function() {
        return $t.now();
      };
    else {
      var Vr = Date;
      ki = function() {
        return Vr.now();
      };
    }
    var Me = 4, Hn = 0, Un = 1, Xn = 2, pt = 3, pn = 4, tn = 5, Dr = 14, Wn = null, br = {}, ct = {}, al = {}, Vo = {}, ol = !1, Si = !1, Ai = !1, Pi = 0, or = !1;
    ni(), ni(), Gs.prerender = function(e, t) {
      return new Promise(function(c, h) {
        var y = t ? t.onHeaders : void 0, x;
        y && (x = function(U) {
          y(new Headers(U));
        });
        var S = vl(
          t ? t.identifierPrefix : void 0,
          t ? t.unstable_externalRuntimeSrc : void 0,
          t ? t.bootstrapScriptContent : void 0,
          t ? t.bootstrapScripts : void 0,
          t ? t.bootstrapModules : void 0
        ), M = Yr(
          e,
          S,
          Tr(
            S,
            void 0,
            t ? t.unstable_externalRuntimeSrc : void 0,
            t ? t.importMap : void 0,
            x,
            t ? t.maxHeadersLength : void 0
          ),
          Y(t ? t.namespaceURI : void 0),
          t ? t.progressiveChunkSize : void 0,
          t ? t.onError : void 0,
          function() {
            var U = new ReadableStream(
              {
                type: "bytes",
                pull: function(oe) {
                  xl(M, oe);
                },
                cancel: function(oe) {
                  M.destination = null, Gn(M, oe);
                }
              },
              { highWaterMark: 0 }
            );
            U = {
              postponed: lt(M),
              prelude: U
            }, c(U);
          },
          void 0,
          void 0,
          h,
          t ? t.onPostpone : void 0
        );
        if (t && t.signal) {
          var V = t.signal;
          if (V.aborted) Gn(M, V.reason);
          else {
            var B = function() {
              Gn(M, V.reason), V.removeEventListener("abort", B);
            };
            V.addEventListener("abort", B);
          }
        }
        Tl(M);
      });
    }, Gs.renderToReadableStream = function(e, t) {
      return new Promise(function(c, h) {
        var y, x, S = new Promise(function(ce, le) {
          x = ce, y = le;
        }), M = t ? t.onHeaders : void 0, V;
        M && (V = function(ce) {
          M(new Headers(ce));
        });
        var B = vl(
          t ? t.identifierPrefix : void 0,
          t ? t.unstable_externalRuntimeSrc : void 0,
          t ? t.bootstrapScriptContent : void 0,
          t ? t.bootstrapScripts : void 0,
          t ? t.bootstrapModules : void 0
        ), U = ko(
          e,
          B,
          Tr(
            B,
            t ? t.nonce : void 0,
            t ? t.unstable_externalRuntimeSrc : void 0,
            t ? t.importMap : void 0,
            V,
            t ? t.maxHeadersLength : void 0
          ),
          Y(t ? t.namespaceURI : void 0),
          t ? t.progressiveChunkSize : void 0,
          t ? t.onError : void 0,
          x,
          function() {
            var ce = new ReadableStream(
              {
                type: "bytes",
                pull: function(le) {
                  xl(U, le);
                },
                cancel: function(le) {
                  U.destination = null, Gn(U, le);
                }
              },
              { highWaterMark: 0 }
            );
            ce.allReady = S, c(ce);
          },
          function(ce) {
            S.catch(function() {
            }), h(ce);
          },
          y,
          t ? t.onPostpone : void 0,
          t ? t.formState : void 0
        );
        if (t && t.signal) {
          var oe = t.signal;
          if (oe.aborted) Gn(U, oe.reason);
          else {
            var se = function() {
              Gn(U, oe.reason), oe.removeEventListener("abort", se);
            };
            oe.addEventListener("abort", se);
          }
        }
        Tl(U);
      });
    }, Gs.resume = function(e, t, c) {
      return new Promise(function(h, y) {
        var x, S, M = new Promise(function(oe, se) {
          S = oe, x = se;
        }), V = Kt(
          e,
          t,
          Tr(
            t.resumableState,
            c ? c.nonce : void 0,
            void 0,
            void 0,
            void 0,
            void 0
          ),
          c ? c.onError : void 0,
          S,
          function() {
            var oe = new ReadableStream(
              {
                type: "bytes",
                pull: function(se) {
                  xl(V, se);
                },
                cancel: function(se) {
                  V.destination = null, Gn(V, se);
                }
              },
              { highWaterMark: 0 }
            );
            oe.allReady = M, h(oe);
          },
          function(oe) {
            M.catch(function() {
            }), y(oe);
          },
          x,
          c ? c.onPostpone : void 0
        );
        if (c && c.signal) {
          var B = c.signal;
          if (B.aborted) Gn(V, B.reason);
          else {
            var U = function() {
              Gn(V, B.reason), B.removeEventListener("abort", U);
            };
            B.addEventListener("abort", U);
          }
        }
        Tl(V);
      });
    }, Gs.resumeAndPrerender = function(e, t, c) {
      return new Promise(function(h, y) {
        var x = jn(
          e,
          t,
          Tr(
            t.resumableState,
            void 0,
            void 0,
            void 0,
            void 0,
            void 0
          ),
          c ? c.onError : void 0,
          function() {
            var V = new ReadableStream(
              {
                type: "bytes",
                pull: function(B) {
                  xl(x, B);
                },
                cancel: function(B) {
                  x.destination = null, Gn(x, B);
                }
              },
              { highWaterMark: 0 }
            );
            V = { postponed: lt(x), prelude: V }, h(V);
          },
          void 0,
          void 0,
          y,
          c ? c.onPostpone : void 0
        );
        if (c && c.signal) {
          var S = c.signal;
          if (S.aborted) Gn(x, S.reason);
          else {
            var M = function() {
              Gn(x, S.reason), S.removeEventListener("abort", M);
            };
            S.addEventListener("abort", M);
          }
        }
        Tl(x);
      });
    }, Gs.version = "19.2.6";
  })()), Gs;
}
var Qf;
function uh() {
  if (Qf) return Ws;
  Qf = 1;
  var de, ue;
  return process.env.NODE_ENV === "production" ? (de = ih(), ue = ah()) : (de = oh(), ue = ch()), Ws.version = de.version, Ws.renderToString = de.renderToString, Ws.renderToStaticMarkup = de.renderToStaticMarkup, Ws.renderToReadableStream = ue.renderToReadableStream, Ws.resume = ue.resume, Ws;
}
var sh = uh(), fh = Ms();
const hh = /* @__PURE__ */ jf(fh);
function dh(de) {
  const ue = Number(de);
  return !Number.isFinite(ue) || ue === 0 ? 0 : ue < 0 ? ue : Math.ceil(ue / 5) * 5;
}
const gh = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQAAACWCAYAAAAonXpvAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAgAElEQVR4nOydeXwb1bn3f8+ZkbzEhJBrnNR1rLEkbCcOKRdzucAN1G1pS+kKJA5Ly1K60L1cLuWlXC7w9vK2tKUUulBuW8pSCFGAQqFAN0hTyqUUaBpiYgdJlhQTspGG1HZkaeY87x8jW6N9l5Mw389HiTU6c+bMaDTPOc8K2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NgcWNBsD8Cmdvj6+lqAiRY5pTZDGC1EogVELQKyBUQtALWw5GYibgaTgwUEMSDBQrAQEgwSEMwQBAYBgokSbSCIIElSlElOgGkShCiIJpnlJIii5jaKKtKYhCImpaFMIh7fMxgM7pvta2NjY2NzqGEL9IMAX0dHo9GiLlQktZGgNsloI0IbAQskRBsBbWDZCqK5AFoSr+ZZHnY+JkHYDmAbgO3E2CaJXxWg7Qy5TUJsd7Jj25nDw3tme6A2NjY2Bwu2QJ9l7l3a1abGxVIW1AuWi4jRBkIbYH3RgSyca0kMSAp+Zt4mQK9J8DbBtI0dYrtO+rYtm0Z3XwvI2R2qjY2NzexiC/Q64evrmM+yaSlJYwkRjmbQUgBLALTO9tgOAXQQ/MzYAOK/kqSNitA3nLU5vH22B2ZjY2NTL2yBXmXuWrasuTE2uYzBS4lwNCSWgrAEwMLZHtubkJ0AbSTwBsn0NyK54ciFncPvWLdOn+2B2djY2FQbW6BXyIMeT5vh4OWSxclEvBzAMQDU2R6XTU5iAF4GsIGI/yYlbdCd8Q3nvRTZO9sDs7GxsakEW6CXiK/P44WB5UR0MjMvB9A922OqNzLxUnAI3UCMMQi8SIzfMsvfDI6MbpntIdnY2NiUwiHzPK4FPkDIxd5jhJTLQTgZoOU4CFXnOoAoA1EAUWbsBzDFwH7Ltiis74EpADoz9MT+OgCdzf+t3mcEU7ALAApZ/k7ZTinbc7V1kuma30SE5pm/gWYiNAFoTuxTJyLM+I0A/TrmjP3OXsHb2Ngc6NgCPQ2f19sKBz4ExhkAD8AMATug+QcDO5mxUwK7Ev/vSwjuaEIIHyo4YQr2JqIZgT+XgHlEOJyAeYm/D6Oq3twSwItMeEKQ/HVrm+tZ2w5vY2NzoGELdAAPLO7qlKAzmXFGYhUuZntM6TCAPQzskoydDOyUjF0JQR7l2R7dgYdAUtDPSwj6wy1/zyNCY/l3/ziAJ5no1wrkb1ZsDvqrNnAbGxubMnnTCvT7l3iXsMFnMuEMAMfO9nim0QHsTgjtXQnBvZPNbZUtCVkHaB+AvYmX+TdjLwF7IbBPAn83t/E+AiYBRCmhhQdzTABRYo6SlNF4Y6OqTE2pMVV1Cl2oQuhOQ1FU0skphKGSEE7DMP8nSaok6SQilSQ5pWCVJDmJpCqJnMSkAmhk8D8RYz4LzCem+QDPBzD9qrqjYQOAIwRhAQFtgrCQgAWCcAQYgkr6abzMxHeSof58cMuWbdUep42NjU0xvKkE+v1LjjreMORZRDgTgHe2xwMAcQARyQgajKAExsoT3HsAfhnAMBENSSn8RMYeYt4rpNzbGI/v3bhjx2S1x15Penp6WmKx2HxFyvmSeb6AMp8FzwdTG4gXgdEJzLwqMpM4AByZEPBtBCwStO8tAmgyM/HlQ4Kxjgl3ktL44ODQ0Hgl47CxsbEphUNaoD81MKDu3BEZgMQZRPQRAO2zPaYYgLBkjFoEuFHszowxBl4mgWEAQ4JomBXlZb/fv7t2Iz74cLvdcxFDJxSjE0SdkHCBuANMnUToBNCBMlb8DQAWCMQ0AX+3EHvaidQmAQ3ZHSUnGfSQAO7kYf/vBu1MdjY2NjXmkBToaxYfdYpgeTGDPpBQ284aMQAhgzEqTQH+akEBzjpAQQAvM2NYgIYk03BTtGl4aJe94qsSomfRooWGonSypG4I7gNjKYClMFf4xcMYe4vAox90KIEulTwwQxmXprXaTkx3CRG/yc5eZ2NjUysOGYF+z9Gd85y6eiGDPg1G72yNYwqmAA9KxmhCgBdYmo0DeJoZTwmB9Q1z5rw4NDQUq8dYbTLp6elpMaamloJpKRMfDeYlMNP0FhOuuIEJdw4QPfbeBqWbiN8OxnIAx8HUCMSIcLvOxg3nDIdCtTwPGxubNx8HvUBf2+s5SQKfJmAQQONsjGGHZLxkMEYksK2wAN8H4GmAnpIC60dHR5+HrY494Ol961vnG07nUpZyKUBHS8YSQVjKpsNeGqwD9DsQ7pzS9YduXSDF5HjT8UR8CkAng3EcgEelFNef/corw3U/GRsbm0OSg1KgP9zT0zJF+oUAPo1M9WZd2M3ARoOx0WDskHnjxvYReD0DT7FU1ge3Bl+ELcAPGbo7OtqlcCxnkicDdArM+9Ea9riPgPsB/oE/HH4RMH07dmyLHKMoWM4QuyHk+sGhYGRWTsDGxuaQ4aAS6L6+jvkwGr8E8BcBzKv38fdYhPhruYX4XhDWE/AUmNf7w+ENsAX4mwZN0+YJ5pME0ds5qW53Jj5+gllcH4wEn57FIdrY2ByiHBQC/d6lXW0OXVzOwCWoc+a2vQy8lBDiYzmFOD1DxGsJWPdKKLQRtgC3SaBpWqMKHM9MpzDzyUR8Eog2EPA1fyj0m9ken42NzaHDAS3QVy/1dKg6X8mgj6OO9vF9FiG+VTKyiXEGnhOE1Yir9/tf9Y/Va2w2Bz3C09l5DAtxigAaWcr1gUjkmdkelI2NzcHPASnQfT09GgnjamY+H3UqRTpuEeLhHEIcoBcBrJYCvtHRUdvmaVMV+vv71RdeeMHODW9jY1MRB5RAf6S/vXn/ZNNVYPwHknbHmjIqGet1xhYjp3f6RgKvYUP1BcYCds5uGxsbG5sDkgNGoPsWewYhcSMIHbU+loS5Gv+jzng1u138ZWaskQK+UChkhxXZ2NjY2BzwzLpA9/W6lwL0PQADtT7WFIC/6Iw/6RJ7M+X4FoB9kOqawNbAplqPxcbGxsbGpprMmkC/5+jOeY6442sAPosalyt9g4FndInnjIxSozEw7iXi703HCNvY2NjY2ByMzIpAX9vrPpNBtwForeVxXpOmWn2jkZE/fS8zfmQQ3xwO27m1bWxsbGwOfuoq0H+maY1zmtSbwHxJLY+zxTAd3QKZ9vEgmG6aMzV5e73Kia5e6ulwxOV8XSjNJLmRBDeDxR4oDS8O2jnbbWxsbGyqRN0Euq+nqxukrAV4WS36NwBsSDi6padiZeA5wfQtf2T0QdQ46cvqXk1TWQww6F0gDAA5nfwmwXgWxH9gUtat2vzK+lqOy8bGxsbm0KYuAn1Nr+d8At8KUHO1+2YALxqM38Ql9qXKcQngl2D5rXok7rhvsfcEwbgK4A+U2cU6sPz04MjolqoOrM7c1t+v/tP434+RhG5iMc6EvVIaex0K9qrSuefDIyN2CVgbGxubGlBTge7r62uBHr0VhI/Wov9RyXg0ztiWuiKPEnCHNMSNwbFgzePGfb3eUwC+GsCpVeguBvD1Lbr4xul+/0Ghjr/P63WTKo8nohPBOB7AscifQ+AZEN165IKO+96xbp2dTMXGxsamStRMoN/X6+4WoEcAdFe779cZeDwuMWSkCPKdAH1PiTt+tGXblt3VPmY6vh7PaSBcDeCk6vdOw5Jw0dmb/c9Wv+/KeaS/vTk60fRRBr6A8qvdrYdOZw36/TX/rmwObtwdbm89Juc2Ngc7NRHo9y32LBWM3wNoq2a/UQae1CWe0VO81vcy4xrhVH/kr8OqdnWvpilQ7gRwSo0PNS4EnbziZf+GGh+naO7zet2KKr/ATBeCqlLtzh91znnb+Rs31sVBMRdmhsLmMxncIxheJnKDuQWABEia9c0hAST+Z93cnnhPkGDSQSyZMSkYfkk8RIoyjDf2Dw+OjUVn8/xmA0+HxysdslllFswMAIKZwawKVlmozGBzmwAzGKpgZigKi+m2MMNZ5wJ0XSAcettsns/BTkdHR2OjcHyABZ8MiXkgzGXwuGAakwJhJnrMTmd98FN1gX7/Eu8xUvLvAcyvZr+bDcYv4hL/SC7KdRB+OKXr142Nje2p5rFy4ev1XAjge6hfxbftBowTzxkOhep0vKysXeJ+Jxt0GQinV7tvAr69cjhwebX7LQZfX5+TjOinGLgKwMIaHUYCiIAwTMBTjc37v//BF7bN6gSmHrhdXT8g8Ger1N0zgXDo36rU15uKZQsWNE82Nt3IwLkA5hZo/gxAq5W44756aDltqk9VBfr9S446Xhry11VavQEwV+WPxCVetKjXmfAohLgsGAzWxYHsMa/XOa7IW0H08Yo6Yt7AAqsB2gJmQUSfBOO0AnutGxwOvKOi45aJz+ttZZW/R8DZNTyMDvA/Dw4H65qd797u7laV9N+C6Jh6HhfANiji/YNDrxwwmpda0LNoUbsulFer1N2DgXDorCr19aahx+XSdNDDAEqNLNIB/BKEX8NQnrEzZx48VK2S2dolXcullI+Dqrd6HTEYD6Z6r29klpcGw5Enq3WMQty7tKttXOdfAFSurdwP0L3SoNVnv/JKSl74tUvce5mpkEAfuG+x94R629PXLvacz8w3UZU1LVlQE6l/6zZpuXdpV5uqG08BtKRex7TQDoNXATikBbpUlLYcJQtLhoCd1enpzYNnkWepDuMPKO/3qwI4E4wBdnBXlYf2ZkT09/eLelRUrIpAX7PYfSpLehhAVcLSpgA8GpN4PrkqjwJ0dSA8+h3UOI7cyn2LvccKnR9G7ljy3DBvIMLXhoaDD12ba8wGnVSMjkQwLgdQlxXKA4u7Og0WP2bGe+pxvAQn+QAxWIfvdnVPT7ui60+hBs6aJXBQRDBUAmfxnyHQgwy5LbmBsn7fJM37gAUEGKdKxms1G2gevJ1dKxjGNkvYq+jv7xdvvPGG0HVdxGIxcUT8CKHP1xGPx4Wu60JKKZplszCaDAFdvzoQDn9het8BDIhdfbvExMSE0HUd8+NxYchWMXX41PS+aDYMIXmOMJoMYRiGYGY4WBwnSc4NhsP3Fjt2EvrXGZQuzDeC6QdEcqNUlG3CMOYzi2Ugfh+AFUiTB8y4LhgM7pt+7+nUbmUpbpSqHG8wDGHIBsGNDCmlcEopmFkY0iHYyUJKKRzMYGYhpSpI6HNBylmB8OhlBYYuPIs8S1joxwsWMQiOCCnH2iPuyDrkj4rp7+9X/7FrV6dkBrNTAACDEUNsTz6zrKZp81Qp21MGoTfutJodurq6OoUu5jIz2MEi4RsipFQEACiKFNM+IcxKuj/I+/++a9fjAGq+EK1YoK9d0rWcJf0KVSp3ukMy7opJ7EnIcmI8pwtcEAqN1rXq2Zoe7yAx3wmgscRdYwC+MDgS/J98jXx9fU42ohcU1SNxXdTCa3rclxiMG1HexOx5MNaA8CQxL2Oin5Wwr1Pp7tawZUuwjOMWzeqlno6EMPfW8jiFkFI+MpvHrwuS2kBpS3Q2rg5EIi+X0o2maZoCdlu3eTo7TwKJRxhoTMyHBUDXB8Kj/11K3x0dHY0NivoCgN7EJkGM56JSf/vY2FgUgr1gsdbj0mb22bv7dQCAAqDJ4UTUMWEuNwA4SACKgKHETKU10xjMSBB4Xa5LtiL0A4yb+yqKiglFBTABxBPbSCCuCgDm/goAgMDEEFJ8uNjzci9yH8eQKfkwiOlj/sjoz9OaRmBqiu7yeDxfgmFcBcYXAYCBkHCqP0ppTRggRV6iMKALBRA6oJueizoIIAIUA2SYY5eJbaRIAALE/I1s421vb29udDq/SMzvAugEwGihxHmDAYMEtrpCEQ9rNy6KaD/MJdjfeOONZkniASIcg4TbNIH1Bhb/CiCnQFelbGcSfwJmTMW6oUbfDmBGoCtSrmDBNxJMd1iZ6J2E+VcycppAJEEEsGWbAJfyPCybioqi3Nvd3cpSrEGVhPlmg3Hr1IwwjxHhSn8kdGI9S5heCwjfYs/1RLwGpQpzQlAI+tfB4UBeYQ4ApEevRrGChasbLZCNNb3e64ionOQ/zwriowaHA/8yOBL49uBw4MWVI8E7GLirlE50IWsqZFf3apqi44+YZWEOYPvZW4LPz/IYag6TzLhno1KWXDchFAqFAuFwysomsWLeTebEsxng3aUKcwAYGxuLMmMNzOdgYkUnLx1LRCUw8JZS+0yBeOZ8RbzBV0lXhoqirx0JI134r88izFMIBAI7A6HQlwA+w+wEV6ZHDVGFUUsSmZoWj8s10ORwvkSMrwN0KnI7HHeCcPPWztCvNE3L6qPl9/v3AZSWRIxUSMe+bO1n9jMnmTNtCPhJejIyQ4in8/VRCKE31sVsVNEKXVWMu8FoL9yyMOt0M9tbYlLzIqRygb/OzhgP9/S0TAn9HjA+VPre/CimcN6KYCDvzQMknAel/GoJnavXAuLaGqmkfb3erwP8f0rdj4G7DtPpk6f7AxkqZAH8rRQTKilUsxv+kf725v0Tym8BaLU6RtEQ8j5YDxmIFqTZ0PUqR6MkhQtRqOxeiBbAMlAynNbQrYoiHwhJIcyOqdZKfJCJqPjJENPx1kMRYV2xuwbC4Yc8Ltf3g6FwygSkv79f3bv79XQVvp54OZG6OJzOBikt/88jkeoL0dXZdSrAjyNTDk0y43kitALcDVDyc8J7FOC3AP4VWZ6HRJzpu6HINV6v98QCYc3JQmGEcEa/RrrGiXczaNxsnuu5zBIgJ8DtW7ZtqUskVtkCfe1iz1e4sId2QXQAD8QkNiTs5cT4bkdEu7yQvaTaPNDd7Z4i/REwynGUeuzvc44449PDhZ0eTOEi70Zp2pEnrq2VMF/suRnMXyx5R+YNq0aC+UwGpaxu9tTS63tyoukGmv2VOQCMQTReN9uDqAsSbanyi4sSSJ2dnfMikcjefG36+vqc0fGJmVUac3F9Z0e2WQVtw7yGnXh1ul/aDYOOEiyihtOINcRieqyhQSedzwbxbdP7EOEdUV1/VlVVqKoqAUBKuZCkvHhmjEQpgoYZVxxx5D99Z/r9YS8cBgBYh3Upv/P+/n6xd/eeG4QQxZ8jUQtSDobPezu7XpEqrQ8Gg2Mo8Cyx2P1neOONN+YBdDk5lFv8fv90XgYAgMel/R7AOxNvI4FwyJW+v8flOo0NZUaF7XW5jmXIX6QIa/DTLJVLj2g7YsO0A1lHR0djo6LexECyoBfjOG9n17lZtQ5ZtZl8LMf0mwF8Jtv5tre3JzQ9080pM2SPjLa0Cdkng+HQQ9n6S8frcn0WdfL9Kkug+3q9JzDz9ZUePMrA7TGJraYBIsaETwfCoTv8CFXadUms6fEMGCQfQFkeobwe47GzihHmwIxwKckhi8FrSh9XYdYu9tzKjLIq3zGJK/J9LkHtVLyb87pyxlAMvl7PsQA+X6v+S4LwhcGhoTdHLntKfbAyaLfX652r67pojMdFvLFRNQxDOHVd6E6nKqUUqqTlLPhfAHwpX9fxN95ohWJdtBWvjs4YJtFCy226d8hSATEYHv1ctn08nWkqX8OIjGUmD4oAuGbmXZpPgQBtK8br+YUXXpAACjmSpUDgjWzJYMnAfBDfTQbD49J0gEPMFCQgSMQvgejFqK5vyHIOM/jNjI7fzvFxUpNB2SMSAuHwE9b3DPopLOp1Aj2oE84LbQ1GsTXZLjGmz3g07c9gzNihmfh6TdPuD4VC6WPObhYgXOLt7PpTtklAY2NjKwyLvJVZzoGpNUXrUcI95w+Hf1hs20op2YZ+z9Gd82AKmIrU9TEAdySF+U6wfEcwFLqjkj7LYe1i72eJ8HuAywnveBExfLDYTGBret1nU+nC5dnJqCxqJlgKvsWem8sV5gB2rhr2/yZfAwIXbW8jIW8qcxyFUVDQBFIHdCJcMbg5UPXv8cCFUtTVBBzDcf0NhfH3uOp4HbqxQ2G8Zijqq2TIsMIYZeK7iXlHoZ6loqTdW6LgPjlJXdEVZfZhStM+NTQUTsKS5lMgUYIKvUQkOJ/TpQqQlwjvAeESBv2AGf/boKh/92jazR6Pp/SIHqtA58LX0FS1Y8bRl4B7/eHRlVmE8wyBUOgOBp6zbOoUzNkSXVmvc0oCJya+zdvZmaGBJV1vTdmgcOY5EC2wvhWcpc0BQMkC3aE77gTQWclBdQB3T0mEJYOBDayIf6lHRTQrTw0MqGt6Pbcx8w9QnnPgFuj03kFLWEc+1vR4TiLQnaUeQ4Xj/RfludHLwdfjOW3am7VMNubtv6OjEcAJRfZ1x8qXRytyOMnH4FDAz8wXA3gZdQx5TDDOoDuklP0rNwe+Wedjzy5c/ITOiixm5SNESt+VrNCRYosvTqBTqm09ZjpjFdopVSAQ5xbo7kXu43p6esrO5xEMhx8DuFRfjUYwvgjdGHVrWtET/f7+fhVWzSaj4ORGkLRo91iXirgSRfw2BdO3rO8JIkU4D2AgbSx0BSNF3dvMJH6Rfm1JiBSBLqTMch+kTsgap6Zyfn/ezq6aFCMrhpJW2b7F7tPLcxhLIgGsjkn4zZX5Yy3R/Ss37thR11SYPkDs2j52J5npEMshYqh41znDxRUWue+oo3qJ5CMoLRpgI1j98Jkjw1V1pniwt3e+jnhFIRRE+W2WdFjDR5iLSjC0W5dKzdO+rhoJ3g7gdl9fn1PI/Z1skJcFvofK7erbQAiCeTtA2xn0Glhuh8B2htgeczQPz3ae+lmDyvaILiycjTT7PJcn0NNt8cRFO2ZaBHpxKzVO9ykQxlUeTYuB4WSwSiAVICczq0TymKmpqQw7dCnEmb/gIGoB8JESd1WJcXNXV9czo6OjeSfuAPCPHTvarOYPUP7r0dHR0QjQO2c2ED0YDAaLyyFvKM9CTVopCLzY+nFIC7UqFisfCd5CzGcw6M9IPnu79ampnwJYNdMwzRzi2H9YNpV7yvc30dj8W2+npjLBCbBqOr9BBcPJxBKYHefXEtXmdGUlB2MA98ckXjYd4J40CGdt3LGjroUrrgUELfb+mJnLFeYxKOLD52x6ZayYxvd5vW6hyKdQvH1+JxFdxZv9t9ci0YqO2FXp6tBSYaa8kQ0s8bEiHHr3ScnvO3dL/XJGD5r2UT8Av6/X+zGA/7fMrsaYsWrVSKCuWqWDBa/XO5fjetrklZ4k5hkBIWfuj5nkMo0EPpeKcXCjVEc2mWe1mw99375WCMWypWg1quX3U+QkIHOCc/a07Z5mzoVB5p9786mfiyHhWHiGt7NziSTlMoI8BaBiJ7BOIfk2ACcWaigVJe1Zkt/80SDEElg1opL+WOSYEKXo7gaLyEpfNBBRmyX4G2De7Q+HN7hdrs+QabNPbMegp7Prj4HI6PcBQAputcjz6NCuTD8Xyvj++CRO3sOWhgCAF4s9p2pTtED3dbuXg7G8koP9WWf81RTmzzZOzvnw0K6hulehWtzj/h4zl5+TnegzxXpkr17q6RA6P4Xiwl82AfRgTMeNHy1GhVcG9xzdOQ9x+lQVusppZ3vQ42nTqWCWuUlIfv+sxmMTvGWmJh0HqyevGhkJVXdAhw4c5TYoqduIcas/Ero/337eRV2/FkZj4dVaekico7zUsOnpaYvNSEdA28xuRaiYEzuVkgq3avbZRIz1xQDQ09PTIqemlkhAYwlNELrYDOU8BpnPqON7enpaRkZG8jpxZmQELLBChxBLU64DyaJDkxsaGuZCt9TZJErdN11zozt2AkAwHL7d7er6N4LluU98k1fTnveHQs8S05GWqIBc4y9F4zRr9vXiV+iistX5nkQNcwAb4yzfF8gyC6o1a3o9NxJQdgUoAu5audl/e7HtFR13I7e/wT4ATzLwK6niiXM2BYpa8VeCM+68hMFVyLXPOQW6rvLZqaEoGWwnIVeuHK6d3bwQvp4eDax/r5x9mflyW5gXQNHTQ3yKcgLzbx39ZVH9p4UmlRTSldJN2kNaFH4Qe71eJ8f1pLatkABLHsx6rCAxZY8SITmXQR8sqs8c9PX1OXVdd6YL48T755DqXAav1+uUceOmtOp4wohGlwLIW0OCiRZSyqKYC01wUhZxxKn263xQXL6HrbcV8Uspn6dpbtCU/D5jRvxzDYp6LJLOeCpLrO1u7/5nA1OW/XJ+n9bv7wk2RHZTocBCUCI5zyxQlED39bqXAuWXzpxWtceALVLQuyOj+eNMa8GaxZ6vEePfK+hiU+Oc/VnjGLNhpnadCgnwLZL4VYLYRiS3MYntDoe+7YwNobpfAyZ+f3UKZlCzr8/jHRwK+DM/onyx6euhGKtWDoVq5uFbCNNhL/4LgEqvCMh4ctVI8EeFG77pyVzNyIoc11JgUJtlRbW3QMKQ3KSnpy3Cc5kznP1Esasx635b/JHRnNqK7vbu4iY2OYj+Y/J8BjcDuKWY9n6/P+ZxuR4AKGWxYwixLdc+FlJX9lLJez0IiKQ8ggQfDSCv5mYaJpxjeaurhrE+pSuiNovGfdx6X4yNjUW7OzvPMki8gOkUr4QOXY3dQ0TR5O2UaULRNG0e2Cor2R8cy1kdchPqkLM9F0Wu0MWVqEAS/K/OGJUcI5ZnjI5G6q6OWNPr/Sox/2cFXYyD5Vml1LFO2GsvquCYVeUxr9c5znx81TrU8RGkxaXed9RRvYA8Nkvr7UR8A28O3lKPAiz5oJaG29gSMlMCUWnQJ6s+oEORtCQqAOCY46jeJM6SDawSD3dOX9FxfmEEABzjhWSJieEiwuzSne8KOfFVUou8v79f/fvu168iQHo8nvsCgUCxz9v3pb0fHx0dLWj+oLQEUqzmnxSxogStanNmfGLZggU3FHKM9i7q+hAjGaZGwM9Htm5NnXBILLB8nRnj2BKJBN2d7o8lHJTNfgjvAVueSVlMKEKINmucOmVJYZvGrD3jCoZr+Xp6NGZZdj3sfQw8EZdgxtX+EgszVIO1i91fJlSWBIeZLh4cGa1L7fVaMenEElQp5z4AgCzQlU8AACAASURBVPClRHjaDELhc1LaMMaY6HMTUaNr5ebgd2dbmPt63JcwcH45+zLxNWf7/TUtHnPIwJS+Qo8WssVmo7+/X9U0rTfjA06m6eRK7JVpoWRQC/cliFNXpEWo6fV9+1LUyhWG2eVl7+uvn0umXdwNXR/yulyfTYRz5UK4Ne3LAKWEsTKouFoMaeaPqampvJORQCCwEwSrBqJ9vKHpP/Lt43a7O5n4B9ZtBL4hoyEVzikQjAQfBej/pW1OysEsJpSMOPUafn+VUniFTsanCVR2EZe/GIw48GwwEsqVZahmrOlxX8JMFSUtIeCWwRF/RYUVDgSk5IoK8WShA3Ma/h1A8sdBrIIRARAEsBpq4x2rLJm3ZpP7FntPAPPN5e1NG9sWLPoONtvyvDjkgjQb+j6Py3USsyIUhRMlJs0yk8LyHqwIwSw4sW3v7t3vE0yvAEgvzpR8cJcQsuZe5D7OmlY0PT2tzBp/nAalq5hFwdV0uvMdF17hzdDjcmlxQ1GDY8FM81YmAsDVybfUysAPtrpCl3lIexrMfyMhNsWl3KgYSosQfAITXwzGQPqQJfG3UBwz14OByW3bCmsxCbiJkQx/JsI1blfX4S3RyavTV+rezq6PsiF/AMJcSwe3vBIKZxTsYtDCaU0yU25nxUB49GqPq+sEgN+Z+WkWL31KnaAWlSshgUfTTlN0feOWsbFizBcVU1Cgx1ie6qTyigowgOd1GZOCLkCdV2e+Xve5AN1aWS/8HCtNNY+TrgeCpS7Ln5dlh3DlvUu7fnLuptGdADC4OXAVgKuqe5DKedDjadOZH0B5Ggoppbz4HevqW1vgoCZT5d4G0J+IJOTMU8AsM8ly5h1AEkwAOBnKRQIpPhnLFixonrDm3RZY4tG0m8EsGEIQs4CAALMgkGCGCmJBEIJhnPLCCy8sSo4zZUUXC4UK+7Vwms2Ys2UVS98nPZxKYKWnU+uHAJhZCJBgQIAhICCISbB5AYUOLFNUeU6uvq24Xa6zwVlzK7jBcAMElgwVBCgytxGVcWkoHAoVc0ykXo+itCX+UGidx9X1GJIqdEHgf59obBz0dGpPguglQLoAOpXBKRoaAj3oD41emrVjiylG5M9YJ8mhrOJ4/K8ApTr4Ztsv7X4m4AaPS7uaGIKJBSAEwIIAwZT4Hs12ghmabGxclNFnjcgr0J8aGFBfey1Sdi3uVwzGG8A1o6P1VVff1+vuBujHlfVCe6DwysEsK8xrAXG816uONzQ44+IfqmO/UzUUxekUMTUeV1RV6E4phCqEUKVuOJmESkQqgfXGOfs3lGKLrxZSpb0wCrcrkRaHLq4HcMDaln2A0B1YA5RXFZCBnwgdW+7t7m5VHTHVIEV1xhSnQXFVKIoqiZwybqiKIKckoQoyVDbIyUQqgJghxYv1jLU/QKhKBUYgUz091diYqs5nLAWw1JwCsKkYYHPPxH+JvxmJ+uTW3mdWdEUniAHeYl3eOItY1UspW8mqCmAsB2H59MTFUjYbYIDTRK1RrBc/83aCWMmCPwbGB1B6BkwJxpWBSKgoZ7oEMwK9gBBNgRzKGazra1MTlVEHCOeb30m2RST/XCd8ErkWh5yS9S/vb87v9+/2atrHmPFU6sAyv0+WWJi6pqWlAMzJZ/KGM/9N1cQAYN3v99el0hpQQKBvem3r8QsobwhSXv6iy5gO1NUr2NfX54QRXQ3rLL4suBEG/dnX61GBmWxAib+BcTBgROEwHIDKUKDDYAGhMmQiCFdKBoRI3Jrmz3T/RJPu6/U8bcC46JzhomfBFTM4FIz4ej37AIvqqgow8PH7l3hvWvGyv+7+EcXAvZ5vETJUikVDwKfgpE+pMABDgQLAEAYAYX6/YAhhPpSJJZgJoBlxAlUY8PV6XhTSOG/FllCGmvBQw+tyncDMJ2R/IJcOpa364kSnUc6lZQFEcnLQ3dnpNsCW1KEkNE2bl2+V7na755IhB6zbJOWPlujr63PuHx+vKIyp2LC8YCQy7V19v/et3g6p6B8n4JOg3HkjTHgcoN9BKlcHSihZ7XG5PoJpj3EAIMwtploeYHrW9/f3n7V31+ufBeFqWMuXphID6Hkivs4fCuesH+Ht7PoAg2dChCWzG+aEJqdmmBXFD92IwaK5I2AJgJlCMj2LFrXrZMkqVzK0M98Yqk1eYb2PeeWCMtXtOoBhSfeHwqP1Dc8ypq4DkM3TulRSS+pV6QEF85oPKKTcDODD1eq0SDbBUoWpSghpyMuQSF5xILG2x7uCwZWEKlaLY6VQbgTw/tkeSK1hiOXM/G0AIKIsDzKZsi1bGylhENHhAH8iblmha5rWCIk2Bq7J13cygZfZRgIgpiNhPuQBAIYQxzOQUspWkdKNPFm+yDCWAviptX/JnDdp1MTERLtg+iMDf0w+QRJjT2wgyzWR1vOScBLh4nLC8vyv+scA/F8A/+3VtFPB7GWmFhAfRkwtTNzCTLuFwOMNc1qeHSrD14WkkFLI88w35ribJDcDKOqZn/BluGXZggU/mWxqWiaZ3QThBvMiBoZYoWcVRdlQ1PkLHifgwzAIIEiGwAAGRHo52nQYyZhxAiQjtZiT7nQKMoxLE+cIADAMJO6z6W9Ul5SUk+ZnRJBStBBkXbWXeaXUt7vdL3QKKks4vioZt+znk0e31i+ByNpe7wCDnyrccvYh4NsrhwN1tc+v6fHcQISv1KDrqKPReMtsxNbnwtfnXQKD/wwUlVO+5hDTN1eO+POWnLVJxdvZtaIj4npoHarjv6BpWm8odHBpSbq6ujqLCR+zOTApJtteNclrY5lbYt1uK7sl762nMPf1dcxn8N31Ol4F6Ey4es+ceRVl3isHNug21Eb90xibUi+sQb9l8XBPTwsM/gUODGE+yUSXDo346/59H+z4I6P3V0uYA8DBJswBwBbmBzf1FOZAHpW7z+2ey1T+AzEKypsysOoYztuQJ8f4AcLzAF+0anPOLEM15Wy/P+jr8TwBKj/rXy6I+XMAvlvtfsthivQ7UcFktHrweih08aohfzEhRzY2NjYVkXOF7hf8HirTfg4A/5D4Q9k7l8jaHveFAK2o1/HKIMbEVxy5cNGJg8OzI8wtlJXDvAi89/d0LatR30WzZrH7KwDOnN1R8CQTfW5wOPj2rOlxbWxsbGpAToE+xvjnSjpuJFpfuFXl+LzeViaqlZCqBs9KQ7xt1ebgNw+EWObBkcATAD1ai74liRNq0W+x+Ho87ySmr8/mGMB40oDsW7XZ/8NZHccBjtvtzlW0yMbGpkxyqtzfYM5MuVgCy4m2lBLMWC6s4gt0YNhK04kCdBWG/d89e5ZTnqZjsPJpBfoQCKUXKMnPiQD+p8p9FoWvT1sIA6tReuxttdgH4PLBkcCsnH896HG5NENKIdkh4ISQUgoHM8xMbw4hVSkAQJFSABBSKuZ7RQoGEtngGER0gjTkIgDZE4TY2NiURU6BHgNVZINsOnyy5slTHulvb94/wZ+v9XFKhvG0EHzRis0Hprr1nJGRbWt73Jcy6GfV7ZlmZYV+LSBgKPegtJrF1eQ3hoqL61ECdxYROrAWQjmOIAEDUABIkBnOQwZEYtrKM1nezA3SmjmFpmP2YXv829hUmZwCXZrl98qCmVGPbGiTk80XEnh+4Za1OTyAfSDsBWMvgL0M7BVEfxwa9v/o2gNsVZ7OypHgHb5ezyoAp1WvV+79xTHavHqHr/X1uv+TgSx5mctiHIQxMJww8xC0wEw8kZqkgjEJ4ueI6J6VmwPFFbI4uJEguhqMx6vTXeH66DY2NqWRU6ArFRRkkXUQZk8NDKi7tkcur2LCl2n2Avw0gD+BxBikKbSFwD7Sxb4pYJ/qcOzLlhL2oEPhT8OgEQCNBdsWSSyqHg8gZ0anarOmxzPAwDUVdCEBuhzMGwyow+eMjNSliMJBStU0ICTYFug2NlUmp0CnomulZ6IQiVqv1Ha+NnYmEWnV6o+AW0jQbZte9g9fe4CvrqvF4FAwsqbX80MCqpZNTUCegDoJ9HuXdrWRXqHdnPCdwc3+71RvVIcwTG1IyzNOwB1MSE5uU385yVIsiXk3MxpBvMKgIvOT22Tgfau3Qwq5UCiyRTI3sxCbKolXb29vbz7ssMMEABiGIWQicV0wGNyXrb3X5foqgMdizKFmwxB6U5NI7CcaDEMYDQ1CSimcUoppnwt2sFClFFKqKsi4LBAJXQQAHR0d8x0OR4qsmZqaGi+mahsAuFyuhSpwAgPzBdEYpBxrnpoKFaqvDgAej6eDYrHUgk2yIZbIspcL4Xa70wvgRIPBYM7rP4AB9VUtdKzB3EFMHSzQTMwbyOF43u/3V7XOQx6BXllprqlJ6kSRKQDLgYirZYPTGfjM4HDgJ1Xq76CClKnrYTR8AlXK8c5E/1SNfgpxLSBUXdyDtOpXJbJlYr9xdeFmNiYZZVF1f9h8MJeCR9Mej8fjWR+ank7tK6AM+/pe0tW3F3jQosfl0nTQ7wHMByABlonxSiQnF+b/DAmCBBBl0O9Y4LbR0dGNGeNxuU4DaC0AkejP2o/Muo0QBPO6OdHo17MJFremfZkY1rLOUYDPCITDT6S3nRnHIs9SCHkOID/E0JcSAE4UdyHJ8Li0EBjrpEI3ZTuPfDSpztV6dCpZztTsez2At2ffg45i4K8OIsRVAcR1CAACBENRAd2AAKCDAKGAIEEy4W8hDAA0nXMeDYpyKST/p6Xzbc2q+m4AOWtDeDu7VrDgVZA4AYncI9PXAyQw0dgUdbu6bpfEXwuFQjknjhQ3LmOhfNm6jUm/BmbK3OzH9npVjsd/CtDymX0Y3wCQNXGUu9P9ga0UugGMJWZFQYCmiwfFdXhcWpAIP0dc/XGh+7sYcgpticrqZwtStEr2z8fqnp52VCdfO5hw3aoaCvPb+vtVX6/3lDW9nk+s7XGf+3BPzwHlkT84NLaHCPdWscu6mCIWL/Z8FcCpFXUi+eKLQqFodUb0JiCtLnQptcitBEIh39jYWNYKVIaAD6ZAtrzooWIediPhcIgIQZgFQ+YD1Aqz6EcbzInfQpiV4NoTBUs6AXQT+LNC8p+6ujLzKFiEbDNALTAnvnPTjtFmOUY7GMsB+s+JxsZfe73ejIlyTNfTfS4eyifM3Zp2IYTxV4C/Ol3pKwsaCBcKyX/1uFzf0zSt+AgWgV9kbqKc9dDTS8iWCiFpbiHggZTPCD/xRyJZhXl3R0e7x9X1KyZeC8aKPEVnGgn8WYXxgtflyiknJMSvsmzOuwj1+/0xEFnz/W8LRkIZJaO7urraPC7tD0TyEZgFX3LhZsZ/saqHPZr2sNfl+my+4xcip9B+faZScXkQJSvfVBsFxnHV64vvq1ZfVp4aGFDX9rgvPGLi768A/AcCfsxE9ySymNUMX1+fc+1iz9m+HvdPfb2el3y97j+s7fHmT7rDqFrKXAZqLiB9vd5TiFMLa5TB9we3BOuWmviQgNNs6KI8gZ4PhTlLkZ9kUZVCSM5ZtasQLULy4wMYSNFaaprWiLLDYmk5x/WMSJImRUm9joRc6lrhdnXdSIyfIVObGoRZSOZlpBo6BECfVxiveFza45qmFQ4/Znwpc+gyX5KobL4U2eRFDObzwPqCtFbQS5sksqRXsx3Q6/W2Gqr6B0sN9WQXwEYGnmPTUdlKO4P+5OnwZKsRD5CRcR5E+Lq3szOfAAYxtSb/xhiynLsw+McATrFsGifC78C4A4TnkfmcFIlSss/kO3Yhcgr01wzo5VYpBAAJOrGC3fND6K9SRxtXbA5WNbTsqYEBde1iz/m7dmwdYaKfAaSlHrI29nlTE+D5FPRogBmrQfRxmHWiT2HitWaN+OysHA48A6Ba12GqSv1k5UGPpw3gNags3jwUdc6xw6ZKJ2VlxihOoPf19TkLtzIf2gC+nOWj04tdcRJSamL7DcJbDMJbpKAFUtACqMoCcqhHGoQuInwYqSuy9khHJEUAKoqSNkHgnxuEIwzCEayIw8mhHq42NhzGijhcMfS3EvhzsGipGDgt/fw5Q9PBO7Kdi6dT+ymlVQskxncNwuJAOOQJhEP9gXCob050/2EAvy8hKKZpJdCeQvnr3S7XmQCOSd/OoPNy7kT4XePknMMMQtOisOYIhEMUCIcUgP6ftZkUtCgQDjVZXwpLjwC/lGyUdi1EZl36viP7WljXHwfDIph5N8BnsCIO94dDbwuGQ/8aDIcOA9MFSBXsjVCN67Odhkj/HkyamcQvevJoUiVz8p6gzPF6Ne1DIEudd4bPocdd/lDo3YFI6KJAKPQvgXBojhT0NgD3JZvxz/3h8IZcxy2GnDb0KZhxWEeU6UROzKc/NTCg1iQ7GvNx1XBuJ/C6ynsx8QGCe7zn7tq+9RoA2WeEACCp6gVkfD3eD2Fi700A3LmuiwCdBGBL7l74boAqXfVC1DgcSXfw3QBVpPJj4k+ev3FjzcMqD0FSHoAEWCMCRH9/v3j99dfVufv3i8nDDlOj0ajaqCgXTo2P7wVwe6HOOR6/IqHWBkyhOC0InSrzmcX0AWtdbcZYKJzThrobQMjrcl3FoB8kzwILYZYZNonH21LdiUQkFMpZEnofgB96XK7FAH0eAAho3r9/vwbrb09SGyxF3YlFhlDwuFwnAbgwuYV3E9F5/nAow+E0Yad/AsBvPJp2Phg/BbA9xsbncoxz5mQI9LW08U+bCJYcpWnHvBIKZQiYQChkToZ3ASGEkucBXmhdBLpGXXtGMZqy75ZIJAhTu2CeFaWp7zlTQE7NmbgcDKtWNsiG8t7gWMZiTAYio3d5OzufZxJ/wPS9wBg8StNufCUUei6t/VvSj5WgW5+a+hmAldk+JLL+DijTqY2t9dN5UyASzlZPXSZ8Hc7xuFxrAFojiSr258m5ymFGaLusYI1OmLdzR2Sg/A7y9l0VlbsEtlbahw8Qa3rdZ6PXO0TEdyOfMAc9Ojji/2Wlx5zm4Z6elrWLvT8F8cMA8qslKUMdlQo7qhJLTYZeMzX2ml7vVwF6T0WdMN++anPwd1Ua0puNdBv6JzwuzfC4NPa4NGPv7tfjCmP/RGPTBMf1NxoU9XUG3ShZyXhIp+NyuRZOC0EAYMKXYFFLMuhjhfpwu91zkZwEAEVoECRRyu+CoKfa9oVIP+fXCvUJFiMpfcbSareTLLQqFcRkdZoDAR/0hzKFeRoyEArdwaA7SNBFkUgkrz3Y7XKdjaR9N0qcuiqXXPiaW+HUifae4irlyQUpbw015VosW7CgmRnW5GEhqMqJWYT5DKYNnlOun5TInNykmpAm0z5b4enUvpj1AFazDiHj3mZgJsEWM2X1FbESCIcfAuGToVAoVKhtIXKrLYk27ahE5w4AEmcUblQady1b1owqxcOKCsLT7jm6c97axe4vo9ezmUCrgYKpcneq8Wz2wfJYu6Rr+RTFX2Lmjxe1gxB5VufA4MhICEBF6h4AL67YUpsSlb6+o44hcKUahJ2OJnlZVQb0JiOh8k7X6AkUY/oownlOBa5CMh/Cls6Q9hOYq85pBjweT95qihRLs8cWEOher7eV2JJ+lrApEImk/gbSVMJUxCSBwR+0vB3fL/en5jYgShViaatSb2fX6Uw43nLMH/nD4aKrVwqHcoV/dDSv8B/AgEqU1MgR40f+yOijMG3C0wM7F6WZtmYEOiFT0GUlTe1NjZSy30Rj88dhOkeaIyLcEAgECvbt0PUfwWqnFpmOaQzLsRmPMvjnqWPjG70uV2b2S7JqgTLNJWxqf8ymhFO8rq4HPK6u//Bo2qDH5TrJ4/F0pPtqBEKhqiyocseaE7+0XZqjLxciWuHr6LhscGysao5S52/cOOnr9eioIE5+Ggl0lbqPr7vreAjxGcRxNhefkEWSxAVnFnEjFjWGXu91bIZ6FP1jiypNeQW6CQUBzrCnlcBtFeybu9P+fhUTb9yJir9zvrTeWewOFYiozYwLKmNfZ34zjNvt7oQhPzX9nsHXrcM63ctdDzDxR2Yaxo1zAXwz53EUvZUtzysCBjyadmci65+TwE7J5CQy33Nc70VSWIwT8DmkT/JJtlqfgSxY93q9rer+/XJSUaTD4XBSPN4KIdogqRXEZzCQ1CIR7k2PqWaJNutjVRhGynNBEt6R8tSVRk6P82wUE9sc0UIfpaRNOqoL3GCOlx+yaEoWujvd7wxGitVoybbpayW5SIGeukqO+f3+tNh3fr/lzb6Yrt9RTLfDr766x+PShjHtH5C1NklyvCDe2RKNXjHR2HhMMpKAVAav9Xq9/zx9TfuO7GuJYiL53M9iLoHp2DYzIWPwmQDORCJcDbqBra7QpAfaeoB+Na91/o9eeOGFqpimc8ehS7lxOymV9t+GFueXAXyj0o7S2IMqrNIJ+Oi9S7u+du6m0bw3n8/rbWWVP5L4wZcu8Ig+uXKLP2dYSin4et3nAvxfJe62rRibMUFGuPwJ3DiUxmqGv80wf+LvX2VQhaVZ6XeDw4GajO9NgY62LNPHJ0znJABkUStP53QXmE+M04ko7++LDONqgJwAQMBwIBy+DwCiMv5Yg6JKTE9cCechj0CHFG0QKZOOY8DJ3yuDkKMi9E5i+Q5/OEu4FNGClFw6jF9wXEdcdcABALoBJoHpBPVpRFTDyNQqUeqzy3H44bsxNmb5mE+wvPH7t24Noor09fU5o+MTM+Ni0A9DodHpSdcDQFLFTZDnAShSoFtU7lmcxXKQ3Cf7JMDyu6fnx0pYHBJht2UO2tjf36+mCs7kCp2Zdm3csWPS3eE+gxT5AmZ8CagDur4awHsByIk5E62K9WvO4sQnCTcojE/BTB2di2YApwF82t7XX7/A7XafFwwGi1h05SenQGdV3bTTkNjDwPyKHNDoSl9fx/8MDmWPOy2T3aiO2n2eqovH1/Z4r+MR/6ODiUeRr6+vBXp0ORPeTaBTAV5W7iUgwhUrN/uLceYplswQk8IUe6P8vYy+AQDMuG/V0NB4ufvn4v6ermUSFTuLxKDwZ6oyoDcpJCyrmeltLC/LFTM8jdfl+ne/358zN4F30SI3W5y/mHAdEr/DsbGxPR5X1zqAp/P0L+vq6lqWM3GKKPuZ0MaknI4syUyI0VaeXoJ3E/P7RrZuzZJKmK3Xcu9QZhrppD8MU9kZ4HKxf2Li42TG4ANAlKdX5wAWhbue3uoK7cG05oKwor29/XOFMrd1dHTMh0WeiGzOYtmxRCWkTvw6OzvnwcwbkPicN6EEmK3hhrQlyyo4eWxhTiaCY0G/x+W6AKCZ2HxmnOrVtGv8odA1whCtM1WIzA8zBHooFNruXuR+Owl5M4CTCg8Ux8GQf+3o6FiUKz9DseRU2QaDwX3MGHterzjKai4MZ0bgfYVUs6rVsUz8MHo9//D1evb7ej0MI/oPEB43U6Jy2StDZnxz5eZA7hVFidzfrfUCdHzhlmnjAIWKbFd2OCAzV13d/tTAgCpJVKxqJ+IrBocOzMp3Bw1ZQnwMRSn40PaHw3nT6rKiXAPQ9Pf7ciAU8qUcFjIl8YhgzhNOxa2pb/ENJlxK4MsAvgygywG6HIwrQLgLKUmQ+FvZknqk2FlNxtNeMm2H3wB8Bjkcb8092UnpM9uq1Coxyi6SlY2Ojo5GYlgmyPz90dGkhnId1ulgWB13W5qczg8U6rdRiFRv9SzOYjmwXIvU/P5SypTVuDX+uxCJCUbyWclImQwkEv7MqM6FTE5AAuHwQwB/29qeGf/l0bTTIFJj19PNJdMEtwafD4RD/8YsPsjAdwF6Bnn8LwhobhCOc4s7u9zkf1ASNr1gcMepjkqLTNPn7+/Wflw1hymiu8FcmbdzJlX94RBwy+BIoKqxzlJRelHGcoHAubJLpVNu+dMNZ28JPl+4WWns3LH1/1A5Jo5Unli5OfjdqgzozUya3RcA5s+fv2d0dDR7+yI4yuXqlYyPJrew0+PSktm7GEIC81IOy3wuzDSbGSsNyVhgbasL3Jwv9aemaVcojL8iofZl0EoAP7S2IeZWnu6UMRaIhBZZP/e6uj7B4B/PtAde9ofDD+U6ZgJrrHw2gWBdSS7p6OhoLEXVnA+nql4Ctqx6QYMel3Y6AJE8TaRUsCTmjwFImWilU2xsvZXECjwpg9JU7mNjY1GPS9uJxPVicN6EL1YahGMFLNlOiei3KcOLchusFuU01fmicNeVkc7Q8UTJ5DDEuAcQN8HyEE43l6QTjAQfBfDo9Huv1+vE1FQHC6ERaCUDl1hG9W4A3y/2HLORX04zHt/HwIhRqbs7nFIoD/vMsJLK+Uf0fqBwOMAsESHQe1cOB8pRjeeniBCIHBxbKOWsr8f9RZRpxiDmm8saVR58ve6lqSuJstipq/KCqgzoTY6gjJjdfZU68kjTy9ryDCIvzHK+5ovwHrKussw2HV5NOwVZSVmhy1AolHeVGAqFtjPYah8+CWnPRLbYu4mQ8fs7vHX+HaBkUiYmfNbtdufMkun1ep0w08aafXIW/wKCNV56boOqfiSjTa7+Xa4T3C5X1siXviP7Wogzco53wgxd6+XEC2nPAQZO627vzrs6ZkrLDZHdWSwFJT1jnsg6ubFq1o45qqsrx3efpLu9uxXEX7ds2q5Tmge7oqceW8oUbdM6rNOlwCpYVtXmRCcl0mZfFnMJPJ1dnzfDMLOcjN8f82/dGgyEw0/6w6HPAJYsgYSiEjDlI69Aj0PeBSD6l8oFOgB0w0Grr610sQ9gcGwsSpBVFyIV4ifgsphOR68c9tek2tiRCzueQWoyj2IRUxT/UK4P1y72fgJE5V7Ph1aOBO8oc9+sPDUwoAJ0J1DhDU58USGHR5tiyVA9VzSh7urqWgbGoGXTMAibsr441cSWMz6aU8a4G4XDUgUsRTZgJjxJ2Yctwo2znHNiUmOdeDpNJ78c7E+fNGfaYEnSmtQmuL7H5dJy9pmgvb29mYm+RcB1iYlD6qHnTHweyfMZB+GXMy9OvICHEi+LIx6pHVDkJQAAFPJJREFU0jE1mN5fGqkCTHBBc4yavk+WVT2Bf2p9L6W8EXlkiNfrdeqOqVthDXVj3BTKrNmQ+j04nVlt4cxiJTJS684MLmOf9vb2ZhBf7WC6It84AbPaG5K+DMiTArho8qrcI5HIXq9Le3DE4HP3MTC30uxshNP7erxfx4i/YlX00HDwv5f0ensSsZKzxSQIj0Hi1sGRwJOFm1fGO9at0309nptAKCmMxYTuXLPY3UGG+vMGon1TInYCWHkXCO9k5vIS9RCCmOKqr4B3bd96CSovvvP9wc3Bx6oxHhuAidtSzT2VaciEwV+bUeETng6EQifnautdtMjNpARmjgxeoWna59If0qkZvArGiwuPy/VlAFpyE6ckRWpvb28miymOkV1IBUIhn8elXYkZj2z6uLvDfXNwLJjpxKXGU50LswiFSX3qsSaHcxuSDmFuHfS/R2na+7Jlblu2YEHzRFPTCjCuA0MDCIjHPwGL+cDtds8lQ1qeu3RdIDT67fS+Ztq7XGcSaMZ/IZHY54e52gvgLSm3h5QFJ9JspJpxsmXM04nuVRg3YCYDIB3ncXX9lqT+yXTvf3eHeynH9XsoJSKGNzmaGjPHTZRyP/v9/qz3czASfNqraZdxanW8RNeZ2pVGp/NTYLQx4csel2s5M1/RGXGvT0+y07Woaznrxt1WkSqAW7ONoRQKOhsx+McMOvdZXeI9jooX12Dir6zt9QRWDgf+p5J+rgXkbXMOv2De5Bt/IZZfAkireHCF2QngaSb6Ixvy6TcOO2LDp6sUP1gsgyOBb/t6vSfCjG0sBZWYboAwbpgCEuYlRjk2+QQxQXTWimAga83kCqnUI33TRNS4vCojsTFJK8zCXHgFlgv3IvdxIJks18mc97vyb90a9LhczwM0PfGcK5hPB/Bg2iAtMeM83+3SbiKwSmY8sQomlcl8D8JSMNJ9S1KqbzU0NLTCki2TKOckRjKLqxKVtQBAQJE/BXAi0lf8aYIk26p027Ztk+5F7g+TkH9CUku1UDL/xePSngboVyDeCeYOAIsngI+AUwvIMOiKvr6+n8yohHX5ZdCMqn+bQZzXVhszjMcaFHUcycI0J3gXLXLnCqFLj63PtuLNgNIiJ7KEgIVCoahb064mtgo7ficLZcjtcj1KEH9LbHsXIJcjRabxGOmO942MjGRG3zC1WR5+e/5/e/cf3VZ53gH8+zz3SnacNBCThCzE1s/EAaehq1PaQdaGAu3WUmgIGA6jbLSFdO0Y7DC2Q7udstNlLKdjwOi20EEPPwoEQzfGUgqBhSykrISEMSC2k0iyZNxgshBCMI6R732f/XHlRJLl+JdkWfbzOSdHutKV7qtY0lf33vd9XpzgaE4smbwzHAicQ6C8Sa5y2xsMBqtJsqf+pRVE9J9vBZLpMIKtBHkTwGHvfSx5/ZXk3n3J8dVxB0YQ6PFUamskEIhtcxA90xKcyuPdTQcEuKfl9EiguS0+rt7vmTC9swX4Bzk9chF5swatGncDj9tLRNthzIvE2F7siVzGrKfv9zDL/yxAw55PKhUCrr+0NTbuN2C+x5dGzpYTTzc4nP0GskanRS26nMOjhc4njxRb5ras8cGdI6mCRkRPS1Y9b/L2GPMCPfuQOy0i4EaAMl/bmbmoBwIk74csAT/J78xGDuWMaycz9GtOdCY2RQLB15DpxEnAWZH60LfjnR25wZlXx32oc82JtxI7I/Wha0GSNTsj2QBWAbLqWJGSfILNxqKbs4f2RSKR+XDcm46vQs8kkx0n/Hx0dXX1ReqDL4GOF8kRtq8E8NcFH5Bbk90Mtceb+5j8Mf6Fx64nkskNkfqQDZK7s26u9gJWCs8kSXiTBZftG2LaXQF+4/gBouF75Puqq69x+j46G9nD6PI68bHDUVjuJgFdSbmdrP1e514q3MFX8GC8M7V2uDaMxIh2uYXoPhfAz/qleFOFCb7b0hB56J6mpnFXfGsGzOVt8Seb2+PnWg7VCeiLQvQnIrgXXtWeg/AmHugBpBdeScB05noMkG0CbCTInQLcDMJqxzanNrfHGy5ri33jsj2J+ydNmMPrQzBvQf15BPwNxlG+dqwE+NF4j7AMxYCuHcfDu2Dhc1e0j79AgzouHAhcieOTdgAARFA70lnUskUDgW+L5Mxjf8Jx7Me2N3gO7gsXB4PHviAznaXG0ufisBD+MJZKDnrfkWWuz142NExlSMK27EUhWb84EDhWoaypqckG55SFhbDk9CjPFu/seNAwNYDwY+QMsSuwacEOEb4g3pn8YnaYL1m4ZC4c9wFk/f2Ihj+6EolE5hMht3OfyNpCU4uGw+ElyB1vnY7W1QVP9PxLFi6ZC0FuZz/hIefBiHd2/MgIXQBvytgTOQDQX1bPnNm0L5UqOKoqFArVU9Y0rAKZ1VBXt7DQugO8vfzc4b/ECGf3VUh0Jd6Mp1LXOmJOE29Pfbj+TtuEcE28M3kNivQ9PqLd7VAoNJ+NdACo+bKPsdIuwlRnx21BWlY3JxKlOHQ75T3WEFlFwEMgnLDOdZEchtC1zXtiT5Tiyf+9oWHWR9T/DkBjGULYaRnr3DV79xa1qtZ0F41G/abfWV/oPkO4Z7jpObMtqa8Pu8xrgcwXj4ExAFySu1Kp1JDnvBvq6hY6bGdNrmG8otRE78aSyTsBIBII/SmRfGxQGw3c/NsI6BOSGBl7r2u5sQIdphAOh2ez6/5R/u2xVOpvUeDLNxqN+qXfzZvMwxgh6k0kkxuOvX6inBAT4HAilRq28FQoFJpPrvwBE0IiqAVJLYT2E+g5S5wthQvYAIuDwbNEZIXJVPIjwIiIM9w2I3WRZcLOoJoXFnNsX0dHzg+XUF1oJVPu5FDM8nqh8/1Zr2cJGZPbd0ekO9HZOVxfJF4cDC53RcIEDkNkMUjSAKeIZEcsmdyOYcIxFAotsfJLwfbbr8aG2JsHvB9j7x08OGiotCHaUuj9M6AhEAi6wisAaTLw3rMEc8gCtuxJpZLDvNZRG3EyR4PBG0Vwhw/ADdUWTilmphMSJPSNy9pjW4v4rNPG09Gov8cyXwfRLQCGHDIzTlsth762Jjb0m368Ni4Jr2CmV8bw0K2w5PebdyeKXlVLKaUqxWhimSOB4C8BfCbMhG9WcTGmJM9vzL2Slpt0b31s7mlqsuf0vn81RG7C+M5DZ6FDQmZ9W1vi724t8eH9lqXhZQC9MYqH9EDk5uY9iQ0la5RSSlWIUWVytL7+DCH+HwD+C3yMzxf30PuA/QJae3l7bNPwq6qhbFwaXmKBLhTIxZmxtqMZonBEgCdB8tjhmjmbJ6on/6PLIossZ0Rz1DsQbLLY3LCmrWNa75W3nB5pNiKvab8BpdSoEzkSCP0FID8AgAt9jHNKE+oA4Qkj8j39ohq/lsZFteRWrzCQeiKERChIJPUQ1AA4AMFBr6MMvwNB60wXz3zpBBNqlNLjDdH1QvJnBe5yAGwRkcfITj9Z5Ml+KlbL0vDtAF0H4Prm9vj95W6PUqp8Rp3GTU1N9vsH390lmSIKX/UxPl2qUAeMAC1CWHdFW3xUM+2oytXSGImaNNvMjjFEYIuMz+ce1LnMB2s5PfrPEMnUg6ZHqsRae3GhcbdKqSlvTEkcCoWWs5EXkSked6mf8UmrZKHuETxpmH5wRVtsuGELSk0LjY2N/m/1H33uVM6pR5AwRi4vxWQ5SqnJbcwpHAkEzgbwLECzGMDlfsbyUoc6ABCeAcztrW0dW24twxhspSaL+vr6k6+ust8r8LlziPC9Yk7dq5Sa/MaVwJFAYBVAvwBQzQAu8TOaJiLUPfsJeMQlPKCH49V01FBXt/DKat+vTx/yMyebHVu+phPUKDU9jDt9o8HgF0TwH8hUafqkRbjYz+OfB240RF4D8UOO7f5Uv7zUdBGtqwtfM8MXX3zicswHAfzVvAV1G87dunVC5x1QSk2souxOR4PBi0TkZ5law5hHwJV+xoIi1H0fJQNgM4CfM8kzk6lcq1LFFqmLLFs7Q94IjuxztheEP29uiz85/KpKqUpUtMQNBwKXAPTQQFF6H4Cv+BifKl0P+BGQJECbBfKsv9ps0V7SaioJ14VXXD8Dr5w2mh/OhO1MfNOlrft2lK5lSqlyKGraLg4Elhqix7OnJTzTIqz2M6qKuaGxMQB2ALQZxjyH3vTO5q4unZFLVazFodBnb/Dzf80fw6eYCC3sWrdo7Xulpo6i7z4vWrSousqy7gbomwO3zSLgPJtxlk2jKldWYgbeTE87hegVAV7lD/pe05BXlSIaDH7h5irr2Tlj/xSnReiffGT/4JL2di3Uo1SFK9nx8HAweAUJ/gXArIHb5hHwOz7GGRPXE360HACtAnqVCa8Q0c6+tLRfFYtpbXk16USCwa9+t8r6t4+N/+PUJ4KfCuMuHTGiVOUqabKGF4WjsMzj3uTux4WY8Ls+Qt3Ed5obq4MAYhDEQLJPgL1iEKuqMTE9L6/KJRwMXnFrlfVodXE/RltI6K7de2KbbtU6D0pVlJInalNTk3344KFvAeb7AM3N3vByi3CejzGvYnK9EDoE8sKeRBIC+TURDgDU7TrUPfOk3u6v7NrfW+5WqqknHAh8fd0M+z6rNE+fAOgfkTb36uyHSlWGCYvSaDQ6G2nnFiHcCKA6uwERJvyWTVhqTapz7MXUA8IBCLoBdItIN5jeJsEBEuoG4YhAjhhIj4/cIy7P6mnevVvrcU9TLQC/19TEc/r6+MMPP+S5p6T5aN8crnIcfNTfz/0zHZ7RX8N/39d33R9XW7eVuDk9IvKgZVkPaM94pSa3Cd83jkQii+A4twF0Vf59JxHwaZvxKYswq6L32oumB8CR/EsB9TDJERHpBZEREYeFHCHpF7DDJI4IOSLiMHuXudfZYTKOCDvCwizCIswCMLFAvAUWZhYRJoBFhPn4MkSExbuBjYCZB55DmATwntdbXxhMIixgi48tAwLynpfABmCGsBCxiHfdCMDsLYuACcJC7K0nA231tsnktRFgBoRBYHjLgGSWkbn/2DIYEICIIZlloszjBu4nb53c5cy6A9uggd+hPOQ/AY5vc8h/k12CgI3E9PClrbHWcjdGKZWrbLEZDQQ+AaIfiuD8/PssAB+3CJ+xCYHKOc+u1HTypoAeJbEead6zJ1nuxiilyhjoAyJ1kWXE7ncEchVAs/LvP4WAMyxCo0WoZyp/g5VS+XYK4RmAnztcM/ultbt2aYlZpcpg0uRjNBqdLf3u1YB8B8DSQuvMyoT7GUyIWoQSdQZSSo2Z9EJoK7E854Ke12FwSk2cSRPo2SKBwCoCXy8wFw3Uh89XBaAhs+ceYcLMSflKlJr2uiF4HkzPWuh/fk1bqrvcDVJqqprUMRgMBhdYwEUwWAPC5wEUDHfAK1oTtAhBJoSYMI7qWUqp0mkVyFOWyKOX7ul4vdyNUWoqqZjYC4fDs+G6FwJYDdCXBiaBGcps8grYeAEPzNfz70qViwNgOxF+ISJPN7cn9DC8UiVQkRkXDAar2fD5TGa1ABcCmD/cY6oAnMqEBQwsoOOXMyryf0CpyU0AxF1Jt7lm525XHn6PeVNHR0dnudul1FQ2JeIsHA4vYdddKUKfA2ElgPBIH3sSAQuYsCBzeSoBc4hQ5HKaSk0LhwTY5RjscgXvS96dhBgMngfjhaPp9Kb9+7WColLFNCVjq6GubqFL9koh89sE+qwAyzDKwh0zMsFeS8AcAmrJOy9fmzk/P+TJfKWmGQfAG65gpyPoMIL8HAfQC9BWgvm5uPbmeFc8Aa0Tr1TRTclAzxcOh2dbIp8QY5YJ0ZkQLIcX8oPGvY8EwRtCdxIRajIn82dkLmuybquhzDKge/xqyukR4FeOwcuuoGdwiveC8AQRPQzL2hqLxdJlaKJS08q0jpmGQCDoGl4ujOUg+Xgm6MMA/MXeFmP40Peue7f7yRtnz/Aq51l0/Hol1AhVU9fbRvBLR/C/rqBABZlfQeg+e4Z/4549e3Q+AqUm0LQO9CFw9LToQpfdIFsSJiAiQBBAGCJBgBaizJlKyAp3ygR+5jZ74L68HwQMwM77UaB//MpVx4Rz7In7CwqAdlew3REkzKDd8QOAPMjAfftSqfYJa5RSKod+p49SY2Oj/+j7R+uFJUhk5pNwrUBqiWQegWoFqAVhLgS1AOYCmF3uNqup5zctQrO/9L8r0wB2OoKXHIN383KcgNeFcAfZ9iN6SF2p8tNAL7FVWGV3RbtOdhxnrmVMLcGqFZa5EKkF+BSIzBWSWgLNJaBWILUCqiXvsL/2vVMFnWUTVvtKF+iHBXjJMXjFFfTlBrkBYRNE7oinUltL1gCl1KhpoE9yTU1N9ttvv+2vrq627T7b/5HvI5uZ/dzPfrYc22H2s+vaROQnZr/rujYx+8mQbcj4iSj7ug0hP5HYIoVL6qrKsNLG97/s4zF16jyRlPEOq7e6ktcNXXoA3A/XviveFY8Ve7tKqfHTQFeqAl0XCb13vo9PLsZzGXjDzrY7gq7B58c7AblLLOveRCJxpBjbU0qVhu6lKVWB7CKMxHAA7HIE2xyDQ4NynF4iwR2xzo5/hY4ZV6oiaKArVYFsGnugpwG87AhedAw+yA1yh4AWY/iOxFuJneNto1JqYmmgK1WB7DF8dnsF+G/X67Hemxvkh0WwwTbO3Xu7uvYXrZFKqQmlga5UhWlsbPT70kdHvP4HArzoGLzsCPLGlnUDdHt1b82G3f+3W4vAKFXhNNCVqjBHjx6t9lnDr3dIgG2OwS4nt6KbAEkQ1rNt/0THjys1dWigK1VhXNet8VlDJ/o7RrDVEbw+aOgZWknotnhnxyPQjm5KTTka6EpVmCqRGl+BAadvGcELjqDdzZ3xjAQ7wFgXSyafmrBGKqUmnAa6UhXGFV+NLyuy40bwQr8gPngM+RYRsy7e2bllQhuolCoLDXSlKoxAqm0Ara53aP2t/CAXPMWMdfuSyR1laaBSqiw00JWqMGyZmgfTwJG8GusE2ghx18U6O1vL1DSlVBlpoCtVYQSoyQrzNAT3WzDr93Z2JsrYLKVUmWmgK1VpRKoB9AD8Ywfmh6nOVHe5m6SUKj8NdKUqjFjWq+l0OtDVlTpU7rYopZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkqpEvl/Bx28DV6wg8UAAAAASUVORK5CYII=", vh = gh, yh = [
  {
    city: "Lisbon, IA",
    lines: ["200 Kraiburg Blvd", "Lisbon, IA 52253", "319-455-4200"]
  },
  {
    city: "Iowa City, IA",
    lines: ["3 Escort Lane, Suite B", "Iowa City, IA 52240", "319-455-4200"]
  },
  {
    city: "Dyersville, IA",
    lines: ["819 9th Street SE, Suite A", "Dyersville, IA 52040", "319-640-3710"]
  }
];
function xs(de) {
  return `$${Math.max(0, Math.round(de)).toLocaleString()}`;
}
function vf(de) {
  const ue = Math.round(de);
  return ue < 0 ? `-$${Math.abs(ue).toLocaleString()}` : `$${Math.max(0, ue).toLocaleString()}`;
}
function bh(de) {
  const ue = ["Vanity program"], W = de.colorLabel?.trim();
  W ? ue.push(`Color: ${W}`) : de.projectColorTbd && ue.push("Color TBD");
  const ke = de.materialGroup?.trim();
  return ke && ue.push(ke), ue.join(" · ");
}
function wh(de) {
  const ue = de.quoteNumber?.trim();
  if (!ue) return null;
  const W = [de.projectAddress, de.city, de.state].filter(Boolean).join(", "), ke = de.customerDisplay, nn = ke.preparedByDisplayName || de.preparedBy || "—";
  return /* @__PURE__ */ q.jsxs("div", { className: "customer-estimate-print", "aria-hidden": "true", children: [
    /* @__PURE__ */ q.jsxs("header", { className: "cep-header", children: [
      /* @__PURE__ */ q.jsx("img", { className: "cep-logo", src: vh, alt: "Elite Stone Fabrication" }),
      /* @__PURE__ */ q.jsxs("div", { className: "cep-header-text", children: [
        /* @__PURE__ */ q.jsx("h1", { className: "cep-title", children: "Elite Stone Fabrication Estimate" }),
        /* @__PURE__ */ q.jsx("p", { className: "cep-date", children: de.estimateDate })
      ] })
    ] }),
    /* @__PURE__ */ q.jsxs("section", { className: "cep-section cep-overview", children: [
      /* @__PURE__ */ q.jsx("h2", { className: "cep-h2", children: "Project overview" }),
      /* @__PURE__ */ q.jsxs("dl", { className: "cep-overview-grid", children: [
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Estimate date" }),
          /* @__PURE__ */ q.jsx("dd", { children: de.estimateDate })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Quote / estimate ref." }),
          /* @__PURE__ */ q.jsx("dd", { children: ue })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Customer" }),
          /* @__PURE__ */ q.jsx("dd", { children: de.customerName || "—" })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Account" }),
          /* @__PURE__ */ q.jsx("dd", { children: de.accountName || "—" })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item cep-overview-span-2", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Project / Elite job name" }),
          /* @__PURE__ */ q.jsx("dd", { children: de.projectName || "—" })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item cep-overview-span-3", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Project address" }),
          /* @__PURE__ */ q.jsx("dd", { children: W || "—" })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Branch" }),
          /* @__PURE__ */ q.jsx("dd", { children: de.branch || "—" })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Salesperson" }),
          /* @__PURE__ */ q.jsx("dd", { children: de.salesRep || "—" })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Prepared by" }),
          /* @__PURE__ */ q.jsx("dd", { children: nn })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ q.jsxs("section", { className: "cep-section cep-estimate-summary", children: [
      /* @__PURE__ */ q.jsx("h2", { className: "cep-h2", children: "Estimate summary" }),
      /* @__PURE__ */ q.jsx("table", { className: "cep-table cep-table-compact cep-table-amounts cep-summary-table", children: /* @__PURE__ */ q.jsxs("tbody", { children: [
        ke.estimateSummaryRows.map((be) => /* @__PURE__ */ q.jsxs("tr", { children: [
          /* @__PURE__ */ q.jsx("td", { children: be.label }),
          /* @__PURE__ */ q.jsx("td", { className: "cep-amt", children: vf(be.displayAmount) })
        ] }, be.key)),
        /* @__PURE__ */ q.jsxs("tr", { className: "cep-summary-total-row", children: [
          /* @__PURE__ */ q.jsx("td", { children: /* @__PURE__ */ q.jsx("strong", { children: "Estimated project total" }) }),
          /* @__PURE__ */ q.jsx("td", { className: "cep-amt cep-summary-total-value", children: /* @__PURE__ */ q.jsx("strong", { children: vf(ke.finalRounded) }) })
        ] })
      ] }) }),
      /* @__PURE__ */ q.jsx("p", { className: "cep-muted cep-round-note", children: "Estimate only — not a contract." })
    ] }),
    ke.showRoomBreakdown ? /* @__PURE__ */ q.jsxs("section", { className: "cep-section cep-room-breakdown cep-section-compact", children: [
      /* @__PURE__ */ q.jsx("h2", { className: "cep-h2", children: "Room / area cost breakdown" }),
      /* @__PURE__ */ q.jsxs("p", { className: "cep-muted cep-room-breakdown-lead", children: [
        "Estimated cost by room or area so you can compare scope — for example, kitchen now and bath later. Area totals reconcile with ",
        /* @__PURE__ */ q.jsx("strong", { children: "Estimated project total" }),
        " above."
      ] }),
      /* @__PURE__ */ q.jsxs("table", { className: "cep-table cep-table-compact cep-table-amounts cep-room-breakdown-table", children: [
        /* @__PURE__ */ q.jsx("thead", { children: /* @__PURE__ */ q.jsxs("tr", { children: [
          /* @__PURE__ */ q.jsx("th", { children: "Room / area" }),
          /* @__PURE__ */ q.jsx("th", { className: "cep-num", children: "Material" }),
          /* @__PURE__ */ q.jsx("th", { className: "cep-num", children: "Add-ons" }),
          /* @__PURE__ */ q.jsx("th", { className: "cep-num", children: "Area total" })
        ] }) }),
        /* @__PURE__ */ q.jsx("tbody", { children: ke.roomAreaPrintRows.map((be) => /* @__PURE__ */ q.jsxs(hh.Fragment, { children: [
          /* @__PURE__ */ q.jsxs("tr", { className: "cep-room-breakdown-main-row", children: [
            /* @__PURE__ */ q.jsxs("td", { children: [
              /* @__PURE__ */ q.jsx("strong", { children: be.displayName }),
              be.isVanity ? /* @__PURE__ */ q.jsxs("span", { className: "cep-muted-inline", children: [
                " ",
                "·",
                " ",
                be.vanityProgramLabel ? `${be.vanityProgramLabel} · ` : "",
                bh({
                  materialGroup: be.materialGroup,
                  colorLabel: be.colorLabel,
                  projectColorTbd: de.colorTbd
                })
              ] }) : /* @__PURE__ */ q.jsxs("span", { className: "cep-muted-inline", children: [
                " ",
                "· ",
                be.materialGroup,
                be.colorLabel ? ` · ${be.colorLabel}` : de.colorTbd ? " · Color TBD" : ""
              ] })
            ] }),
            /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: xs(be.displayedMaterial) }),
            /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: be.displayedAddOns > 0 ? xs(be.displayedAddOns) : "—" }),
            /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: /* @__PURE__ */ q.jsx("strong", { children: xs(be.displayedAreaTotal) }) })
          ] }),
          be.addonLines.length > 0 ? /* @__PURE__ */ q.jsx("tr", { className: "cep-room-breakdown-detail-row", children: /* @__PURE__ */ q.jsxs("td", { colSpan: 4, className: "cep-room-includes", children: [
            "Includes: ",
            be.addonLines.map((Oe) => Oe.label).join(", ")
          ] }) }) : null,
          be.customerCustomLines.map((Oe, Tn) => /* @__PURE__ */ q.jsxs(
            "tr",
            {
              className: "cep-room-breakdown-detail-row",
              children: [
                /* @__PURE__ */ q.jsx("td", { colSpan: 3, className: "cep-room-custom-line", children: Oe.name }),
                /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: vf(dh(Oe.amountExact)) })
              ]
            },
            Oe.lineKey || `${be.roomId}-custom-${Tn}-${Oe.amountExact}`
          )),
          be.customerNoteLines.length > 0 ? /* @__PURE__ */ q.jsx("tr", { className: "cep-room-breakdown-detail-row cep-room-note-row", children: /* @__PURE__ */ q.jsx("td", { colSpan: 4, className: "cep-room-note", children: be.customerNoteLines.join(" ") }) }) : null
        ] }, be.roomId)) }),
        ke.unassignedExact !== 0 ? /* @__PURE__ */ q.jsx("tfoot", { children: /* @__PURE__ */ q.jsxs("tr", { children: [
          /* @__PURE__ */ q.jsx("td", { colSpan: 3, children: ke.unassignedExact < 0 ? "Project discount / credit" : "Other project items (see Estimate summary)" }),
          /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: vf(ke.unassignedDisplayTotal) })
        ] }) }) : null
      ] })
    ] }) : null,
    ke.roomComparisonTable ? /* @__PURE__ */ q.jsxs("section", { className: "cep-section cep-section-compact cep-comparison cep-comparison-print", children: [
      /* @__PURE__ */ q.jsx("h2", { className: "cep-h2 cep-h2-muted", children: ke.roomComparisonTable.isPerRoomMode ? "Optional material comparison by room" : "Optional material group comparison" }),
      /* @__PURE__ */ q.jsx("p", { className: "cep-muted cep-comparison-note", children: ke.roomComparisonTable.isPerRoomMode ? "Illustrative only — alternate material tier pricing for the rooms shown. Other rooms use the selected material above." : "Illustrative only — shows estimated area totals at alternate material tiers with the same scope and add-ons." }),
      ke.roomComparisonTable.roomBlocks.map((be) => /* @__PURE__ */ q.jsxs("div", { className: "cep-comparison-room-block", children: [
        /* @__PURE__ */ q.jsx("h3", { className: "cep-h3", children: be.roomDisplayName }),
        be.groupBlocks.map((Oe) => /* @__PURE__ */ q.jsxs("div", { className: "cep-comparison-group-block", children: [
          /* @__PURE__ */ q.jsxs("p", { className: "cep-comparison-group-heading", children: [
            /* @__PURE__ */ q.jsx("strong", { children: Oe.group }),
            Oe.colorLabel ? /* @__PURE__ */ q.jsxs("span", { className: "cep-muted-inline", children: [
              " · ",
              Oe.colorLabel
            ] }) : null
          ] }),
          /* @__PURE__ */ q.jsx("table", { className: "cep-table cep-table-compact cep-table-amounts cep-comparison-detail-table", children: /* @__PURE__ */ q.jsxs("tbody", { children: [
            Oe.countertopDisplay > 0 ? /* @__PURE__ */ q.jsxs("tr", { children: [
              /* @__PURE__ */ q.jsx("td", { children: "Countertop material" }),
              /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: xs(Oe.countertopDisplay) })
            ] }) : null,
            Oe.backsplashDisplay > 0 ? /* @__PURE__ */ q.jsxs("tr", { children: [
              /* @__PURE__ */ q.jsx("td", { children: "4-inch backsplash material" }),
              /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: xs(Oe.backsplashDisplay) })
            ] }) : null,
            Oe.fhbDisplay > 0 ? /* @__PURE__ */ q.jsxs("tr", { children: [
              /* @__PURE__ */ q.jsx("td", { children: "Full-height backsplash material" }),
              /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: xs(Oe.fhbDisplay) })
            ] }) : null,
            Oe.addonsDisplay > 0 ? /* @__PURE__ */ q.jsxs("tr", { children: [
              /* @__PURE__ */ q.jsx("td", { children: "Add-ons / fixtures" }),
              /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: xs(Oe.addonsDisplay) })
            ] }) : null,
            /* @__PURE__ */ q.jsxs("tr", { className: "cep-comparison-room-total-row", children: [
              /* @__PURE__ */ q.jsx("td", { children: /* @__PURE__ */ q.jsx("strong", { children: "Room total" }) }),
              /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: /* @__PURE__ */ q.jsx("strong", { children: xs(Oe.roomTotalDisplay) }) })
            ] })
          ] }) })
        ] }, `${be.roomId}-${Oe.group}`))
      ] }, be.roomId)),
      /* @__PURE__ */ q.jsxs("div", { className: "cep-comparison-project-totals", children: [
        /* @__PURE__ */ q.jsx("p", { className: "cep-comparison-project-totals-label", children: /* @__PURE__ */ q.jsx("strong", { children: ke.roomComparisonTable.isPerRoomMode ? "Subtotal (shown rooms)" : "Estimated project total" }) }),
        ke.roomComparisonTable.selectedGroups.map((be) => /* @__PURE__ */ q.jsxs("p", { className: "cep-comparison-project-total-line", children: [
          be.group,
          be.colorLabel ? ` · ${be.colorLabel}` : "",
          ":",
          " ",
          /* @__PURE__ */ q.jsx("strong", { children: xs(ke.roomComparisonTable.projectDisplayTotals[be.group] ?? 0) })
        ] }, be.group))
      ] })
    ] }) : null,
    ke.customerFacingNoteLines.length > 0 ? /* @__PURE__ */ q.jsxs("section", { className: "cep-section cep-section-compact cep-project-notes", children: [
      /* @__PURE__ */ q.jsx("h2", { className: "cep-h2", children: "Project Notes" }),
      /* @__PURE__ */ q.jsx("ul", { className: "cep-project-notes-list", children: ke.customerFacingNoteLines.map((be, Oe) => /* @__PURE__ */ q.jsx("li", { children: be }, `note-${Oe}-${be.slice(0, 24)}`)) })
    ] }) : null,
    /* @__PURE__ */ q.jsxs("footer", { className: "cep-closing", children: [
      /* @__PURE__ */ q.jsxs("div", { className: "cep-footer-terms-sig", children: [
        /* @__PURE__ */ q.jsxs("div", { className: "cep-terms-box", children: [
          /* @__PURE__ */ q.jsx("h2", { className: "cep-terms-title", children: "Terms & conditions" }),
          /* @__PURE__ */ q.jsxs("ul", { className: "cep-terms-list", children: [
            /* @__PURE__ */ q.jsx("li", { children: "This estimate is valid for 30 days from the date shown unless otherwise noted in writing." }),
            /* @__PURE__ */ q.jsx("li", { children: "Final pricing may change after field measure, material selection, template, and plan review." }),
            /* @__PURE__ */ q.jsx("li", { children: "Payment terms, deposits, and schedule are confirmed in the signed customer agreement." }),
            /* @__PURE__ */ q.jsx("li", { children: "Natural stone and quartz may vary in color, veining, and pattern; samples are representative only." })
          ] })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-signature-block", children: [
          /* @__PURE__ */ q.jsxs("div", { className: "cep-sig-line-inline", children: [
            /* @__PURE__ */ q.jsx("span", { className: "cep-sig-role", children: "Customer signature" }),
            /* @__PURE__ */ q.jsx("span", { className: "cep-sig-under cep-sig-under-main", "aria-hidden": "true" }),
            /* @__PURE__ */ q.jsx("span", { className: "cep-sig-role cep-sig-role-date", children: "Date" }),
            /* @__PURE__ */ q.jsx("span", { className: "cep-sig-under cep-sig-under-date", "aria-hidden": "true" })
          ] }),
          /* @__PURE__ */ q.jsxs("div", { className: "cep-sig-line-inline", children: [
            /* @__PURE__ */ q.jsx("span", { className: "cep-sig-role", children: "Elite Stone representative" }),
            /* @__PURE__ */ q.jsx("span", { className: "cep-sig-under cep-sig-under-main", "aria-hidden": "true" }),
            /* @__PURE__ */ q.jsx("span", { className: "cep-sig-role cep-sig-role-date", children: "Date" }),
            /* @__PURE__ */ q.jsx("span", { className: "cep-sig-under cep-sig-under-date", "aria-hidden": "true" })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ q.jsx("div", { className: "cep-branches", children: yh.map((be) => /* @__PURE__ */ q.jsxs("address", { className: "cep-branch", children: [
        /* @__PURE__ */ q.jsx("strong", { children: be.city }),
        be.lines.map((Oe) => /* @__PURE__ */ q.jsx("span", { children: Oe }, Oe))
      ] }, be.city)) }),
      /* @__PURE__ */ q.jsx("p", { className: "cep-website", children: "www.elitestonefabrication.com" })
    ] })
  ] });
}
const ph = ".cep-header{display:flex;align-items:center;gap:14px;margin-bottom:10px;padding-bottom:10px;border-bottom:2px solid #b91c1c}.cep-header-text{flex:1;min-width:0}.cep-comparison-room-block{margin-bottom:8px}.cep-comparison-group-block{margin-bottom:6px}.cep-comparison-group-heading{margin:0 0 4px;font-size:.72rem}.cep-comparison-detail-table{margin-bottom:4px}.cep-comparison-project-totals{margin-top:6px}.cep-comparison-project-totals-label{margin:0 0 4px;font-size:.66rem}.cep-comparison-project-total-line{margin:2px 0;font-size:.66rem}.cep-logo{width:108px;height:auto;flex-shrink:0;display:block}.cep-title{margin:0;font-size:1.2rem;font-weight:700;letter-spacing:-.01em;line-height:1.2;color:#0f172a}.cep-date{margin:4px 0 0;font-size:.8rem;font-weight:500;color:#475569}.cep-section{margin-bottom:8px}.cep-section-compact{margin-bottom:6px}.cep-muted-inline{font-weight:500;color:#64748b;font-size:.66rem}.cep-h2{margin:0 0 5px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#64748b}.cep-h2-muted{color:#94a3b8;font-weight:600}.cep-h3{margin:0 0 4px;font-size:.8rem;font-weight:700;color:#0f172a}.cep-muted{margin:0 0 5px;font-size:.72rem;line-height:1.35;color:#64748b}.cep-overview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 12px;margin:0;padding:8px 10px;border:1px solid #e2e8f0;border-radius:4px;background:#fafbfc}.cep-overview-item{margin:0;min-width:0}.cep-overview-item dt{margin:0;font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748b;line-height:1.2}.cep-overview-item dd{margin:1px 0 0;font-size:.74rem;font-weight:600;color:#0f172a;line-height:1.25}.cep-overview-span-2{grid-column:span 2}.cep-overview-span-3{grid-column:1 / -1}.cep-material-group{margin-bottom:5px}.cep-material-group:last-of-type{margin-bottom:4px}.cep-table-scope tfoot th,.cep-table-scope tfoot td{font-size:.68rem}.cep-material-scope-foot td{font-weight:600;font-size:.68rem;background:#f8fafc;border-top:1px solid #cbd5e1}.cep-material-group-amt{vertical-align:bottom;padding-left:10px!important;white-space:nowrap}.cep-group-material-label{display:block;font-weight:500;font-size:.58rem;color:#64748b;text-transform:none;letter-spacing:normal;line-height:1.2;margin-bottom:1px}.cep-group-material-value{display:block;font-weight:700;font-size:.72rem;color:#475569;font-variant-numeric:tabular-nums}.cep-vanity-group-amt{margin:2px 0 0;text-align:right;font-size:.66rem}.cep-scope-grand{margin:6px 0 0;padding-top:5px;border-top:1px solid #e2e8f0;font-size:.7rem;font-weight:600;color:#475569}.cep-room-breakdown-lead{margin:0 0 8px;max-width:52rem}.cep-room-breakdown-table{page-break-inside:auto}.cep-room-breakdown-main-row td{vertical-align:top;padding-top:6px;padding-bottom:4px}.cep-room-breakdown-detail-row td{padding-top:0;padding-bottom:6px;border-top:none;font-size:.62rem;color:#64748b}.cep-room-addon-list{margin:0;padding:0 0 0 14px;list-style:disc}.cep-room-custom-line{padding-left:14px!important}.cep-addon-room{color:#64748b;font-weight:500}.cep-subtotal-row td{border-top:1px solid #cbd5e1;background:#f8fafc}.cep-num{text-align:right;font-variant-numeric:tabular-nums}.cep-comparison{opacity:.92;padding:6px 8px;border:1px dashed #e2e8f0;border-radius:4px;background:#fafbfc}.cep-comparison-note{margin-bottom:4px;font-size:.66rem}.cep-comparison-table{font-size:.66rem}.cep-comparison-table th{background:#f1f5f9;font-weight:600}.cep-estimate-summary{border:1px solid #cbd5e1;border-radius:4px;padding:8px 10px 6px;background:#fff}.cep-summary-total-row td{border-top:2px solid #0f172a;padding-top:6px}.cep-summary-total-value{font-size:1rem;color:#b91c1c}.cep-round-note{margin-top:4px;font-size:.62rem}.cep-closing{margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0}.cep-footer-terms-sig{width:100%;max-width:100%;box-sizing:border-box}.cep-terms-box{padding:8px 10px;border:1px solid #cbd5e1;border-radius:4px;background:#fafbfc}.cep-terms-title{margin:0 0 4px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#334155}.cep-terms-list{margin:0;padding-left:1rem;font-size:.64rem;line-height:1.35;color:#334155}.cep-terms-list li{margin-bottom:2px}.cep-project-notes-list{margin:0;padding-left:1rem;font-size:.72rem;line-height:1.4;color:#334155}.cep-project-notes-list li{margin-bottom:3px}.cep-signature-block{margin:8px 0;padding:6px 0 4px}.cep-sig-line-inline{display:grid;grid-template-columns:auto minmax(2rem,1fr) auto 5rem;align-items:flex-end;column-gap:8px;row-gap:0;margin-bottom:9px}.cep-sig-line-inline:last-child{margin-bottom:0}.cep-sig-role{font-size:.66rem;font-weight:600;color:#374151;white-space:nowrap;padding-bottom:2px;line-height:1.2}.cep-sig-role-date{padding-left:4px}.cep-sig-under{border-bottom:1.5px solid #0f172a;min-height:.95em;margin-bottom:1px}.cep-sig-under-main{min-width:0}.cep-sig-under-date{width:100%;max-width:5rem}.cep-branches{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:6px;width:100%}.cep-branch{margin:0;font-style:normal;font-size:.62rem;line-height:1.35;color:#334155;text-align:center}.cep-branch strong{display:block;margin-bottom:2px;font-size:.66rem;color:#0f172a}.cep-branch span{display:block}.cep-website{margin:0;text-align:center;font-size:.7rem;font-weight:700;letter-spacing:.02em;color:#b91c1c}.cep-table-compact{font-size:.72rem}.cep-table-compact th,.cep-table-compact td{padding:3px 6px}.cep-meta{width:100%;border-collapse:collapse;font-size:.9rem}.cep-meta th{text-align:left;font-weight:600;color:var(--text-secondary);padding:6px 12px 6px 0;width:140px;vertical-align:top}.cep-meta td{padding:6px 0;color:var(--text)}.cep-table{width:100%;border-collapse:collapse;font-size:.86rem}.cep-table th,.cep-table td{border:1px solid var(--border);padding:8px 10px;text-align:left}.cep-table th{background:#f8fafc;font-weight:700;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em}.cep-summary-table tbody tr td{padding-top:3px;padding-bottom:3px}.cep-table-amounts .cep-amt{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}.cep-measure-notes ul{margin:0;padding-left:1.15rem;font-size:.84rem}.cep-round-note{margin:8px 0 0;font-size:.78rem;color:var(--text-secondary)}.cep-total-block{text-align:center;padding:16px;border:2px solid var(--elite-red);border-radius:var(--radius-sm);background:var(--elite-red-soft)}.cep-total-label{margin:0;font-size:.82rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary)}.cep-total-value{margin:6px 0 0;font-size:2rem;font-weight:800;color:var(--elite-red)}.cep-terms ul{margin:0;padding-left:1.2rem;font-size:.84rem;line-height:1.5}", Th = "@media print{.cep-header{margin-bottom:5px;padding-bottom:5px}.cep-logo{width:88px}.cep-title{font-size:12pt;line-height:1.15}.cep-date{font-size:7.5pt}.cep-section{margin-bottom:3px;page-break-inside:auto;break-inside:auto}.cep-section-compact{margin-bottom:2px}.cep-h2{font-size:6.5pt;margin-bottom:2px}.cep-h3{font-size:7pt;margin-bottom:1px}.cep-overview-grid{padding:4px 6px;gap:2px 8px}.cep-overview-item dt{font-size:5.5pt}.cep-overview-item dd{font-size:6.5pt}.cep-table-compact{font-size:7pt}.cep-table-compact th,.cep-table-compact td{padding:1px 4px}.cep-breakdown{page-break-inside:auto!important;break-inside:auto}.cep-breakdown .cep-muted{margin-bottom:2px;font-size:6.5pt;line-height:1.25}.cep-material-group{margin-bottom:3px;page-break-inside:avoid;break-inside:avoid}.cep-material-scope-foot td{font-size:6pt}.cep-group-material-label{font-size:5.25pt;margin-bottom:0}.cep-group-material-value{font-size:7pt}.cep-vanity-group-amt{font-size:6pt;margin-top:1px}.cep-estimate-summary{page-break-inside:avoid;break-inside:avoid;padding:5px 7px 3px}.cep-summary-total-value{font-size:10pt}.cep-round-note{margin-top:2px;font-size:6pt;line-height:1.25}.cep-comparison-print{page-break-inside:auto;break-inside:auto;padding:2px 4px!important;margin-bottom:2px}.cep-comparison-table-print{font-size:6pt}.cep-comparison-table-print th,.cep-comparison-table-print td{padding:1px 3px!important;line-height:1.15}.cep-comparison-print .cep-comparison-note{margin-bottom:2px;font-size:6pt!important;line-height:1.2}.cep-closing{margin-top:4px;padding-top:4px;page-break-inside:auto;break-inside:auto}.cep-footer-terms-sig{page-break-inside:avoid;break-inside:avoid}.cep-terms-box{padding:4px 6px}.cep-terms-list{font-size:6.25pt;line-height:1.28}.cep-terms-list li{margin-bottom:0}.cep-signature-block{margin:4px 0;padding:3px 0 2px}.cep-sig-line-inline{grid-template-columns:auto minmax(1.5rem,1fr) auto 4.25rem;column-gap:6px;margin-bottom:5px}.cep-sig-role{font-size:6.25pt}.cep-sig-under{border-bottom-width:1.25px}.cep-sig-under-date{max-width:4.25rem}.cep-branches{gap:4px;margin-bottom:3px;margin-top:2px}.cep-branch{font-size:6pt;line-height:1.28}.cep-website{font-size:6.5pt;margin-top:2px}}", xh = ".customer-estimate-print{width:100%;max-width:100%;box-sizing:border-box}.cep-logo{width:88px;height:auto;display:block;flex-shrink:0}.cep-closing{width:100%;max-width:100%}.cep-footer-terms-sig,.cep-signature-block,.cep-sig-line-inline{width:100%;max-width:100%;box-sizing:border-box}.cep-sig-role{white-space:nowrap;word-break:normal}.cep-branches{width:100%;max-width:100%;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;box-sizing:border-box}.cep-branch{min-width:0;white-space:normal;word-break:normal;overflow-wrap:normal}.cep-branch strong,.cep-branch span{display:block;white-space:normal;word-break:normal}.cep-website{width:100%;white-space:nowrap}.cep-table{width:100%;table-layout:auto}.cep-overview-grid{width:100%;box-sizing:border-box}";
function tc(de) {
  return de && typeof de == "object" ? de : null;
}
function kt(de, ue = "") {
  return String(de ?? "").trim() || ue;
}
function af(de) {
  return !!de;
}
function Ia(de, ue = 0) {
  const W = Number(de);
  return Number.isFinite(W) ? W : ue;
}
function Eh(de) {
  const ue = tc(de);
  if (!ue) return null;
  const W = tc(ue.header), ke = tc(ue.display);
  if (!W || !ke) return null;
  const nn = kt(W.quoteNumber);
  if (!nn) return null;
  const be = Array.isArray(ke.estimateSummaryRows) ? ke.estimateSummaryRows.map((P) => {
    const N = tc(P);
    return {
      key: kt(N?.key, "row"),
      label: kt(N?.label),
      displayAmount: Ia(N?.displayAmount)
    };
  }) : [], Oe = Array.isArray(ke.roomAreaPrintRows) ? ke.roomAreaPrintRows.map((P) => {
    const N = tc(P), Pe = Array.isArray(N?.addonLines) ? N.addonLines.map((ft) => ({ label: kt(tc(ft)?.label) })) : [], ee = Array.isArray(N?.customerCustomLines) ? N.customerCustomLines.map((ft) => {
      const tr = tc(ft);
      return {
        lineKey: kt(tr?.lineKey) || void 0,
        name: kt(tr?.name),
        amountExact: Ia(tr?.amountExact)
      };
    }) : [], X = Array.isArray(N?.customerNoteLines) ? N.customerNoteLines.map((ft) => kt(ft)).filter(Boolean) : [];
    return {
      roomId: kt(N?.roomId, "room"),
      displayName: kt(N?.displayName),
      isVanity: af(N?.isVanity),
      vanityProgramLabel: kt(N?.vanityProgramLabel) || void 0,
      materialGroup: kt(N?.materialGroup),
      colorLabel: kt(N?.colorLabel) || void 0,
      displayedMaterial: Ia(N?.displayedMaterial),
      displayedAddOns: Ia(N?.displayedAddOns),
      displayedAreaTotal: Ia(N?.displayedAreaTotal),
      addonLines: Pe,
      customerCustomLines: ee,
      customerNoteLines: X
    };
  }) : [];
  let Tn = null;
  const Re = tc(ke.roomComparisonTable);
  if (Re && Array.isArray(Re.roomBlocks)) {
    const P = Re.roomBlocks.map((ee) => {
      const X = tc(ee), ft = Array.isArray(X?.groupBlocks) ? X.groupBlocks.map((tr) => {
        const Yt = tc(tr);
        return {
          group: kt(Yt?.group),
          colorLabel: kt(Yt?.colorLabel) || void 0,
          countertopDisplay: Ia(Yt?.countertopDisplay),
          backsplashDisplay: Ia(Yt?.backsplashDisplay),
          fhbDisplay: Ia(Yt?.fhbDisplay),
          addonsDisplay: Ia(Yt?.addonsDisplay),
          roomTotalDisplay: Ia(Yt?.roomTotalDisplay)
        };
      }) : [];
      return {
        roomId: kt(X?.roomId, "room"),
        roomDisplayName: kt(X?.roomDisplayName),
        isVanity: af(X?.isVanity),
        groupBlocks: ft
      };
    }), N = tc(Re.projectDisplayTotals) != null ? Object.fromEntries(
      Object.entries(tc(Re.projectDisplayTotals)).map(([ee, X]) => [ee, Ia(X)])
    ) : {}, Pe = Array.isArray(Re.selectedGroups) ? Re.selectedGroups.map((ee) => {
      const X = tc(ee);
      return {
        group: kt(X?.group),
        colorLabel: kt(X?.colorLabel) || void 0
      };
    }) : [];
    Tn = {
      roomBlocks: P,
      roomRows: Array.isArray(Re.roomRows) ? Re.roomRows : [],
      projectDisplayTotals: N,
      selectedGroups: Pe,
      isPerRoomMode: af(Re.isPerRoomMode)
    };
  }
  const ie = Array.isArray(ke.customerFacingNoteLines) ? ke.customerFacingNoteLines.map((P) => kt(P)).filter(Boolean) : [], He = {
    estimateSummaryRows: be,
    finalRounded: Ia(ke.finalRounded),
    showRoomBreakdown: af(ke.showRoomBreakdown),
    roomAreaPrintRows: Oe,
    unassignedExact: Ia(ke.unassignedExact),
    unassignedDisplayTotal: Ia(ke.unassignedDisplayTotal),
    roomComparisonTable: Tn,
    customerFacingNoteLines: ie,
    preparedByDisplayName: kt(ke.preparedByDisplayName)
  };
  return {
    accountName: kt(W.accountName),
    customerName: kt(W.customerName),
    projectName: kt(W.projectName),
    projectAddress: kt(W.projectAddress),
    city: kt(W.city),
    state: kt(W.state),
    branch: kt(W.branch),
    salesRep: kt(W.salesRep),
    preparedBy: He.preparedByDisplayName,
    quoteNumber: nn,
    primaryGroup: kt(W.primaryGroup),
    primaryColorLabel: kt(W.primaryColorLabel),
    colorTbd: af(W.colorTbd),
    estimateTotalExact: Ia(ue.finalRounded),
    customerDisplay: He,
    estimateDate: kt(W.estimateDate)
  };
}
function Rh(de) {
  const ue = Eh(de);
  return ue ? sh.renderToStaticMarkup(/* @__PURE__ */ q.jsx(wh, { ...ue })) : "";
}
function Ch(de) {
  const ue = Rh(de);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Elite Stone Fabrication Estimate</title>
  <style>
    @page {
      size: letter portrait;
      margin: 0.32in 0.38in;
    }
    html, body {
      width: 100%;
      margin: 0;
      padding: 0;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .customer-estimate-print {
      display: block !important;
      width: 100%;
      max-width: 100%;
      margin: 0;
      padding: 0;
      color: #0f172a;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 8pt;
      line-height: 1.28;
      box-sizing: border-box;
    }
    ${ph}
    ${Th}
    ${xh}
  </style>
</head>
<body>${ue}</body>
</html>`;
}
export {
  Ch as buildCustomerEstimatePrintHtml,
  Rh as renderCustomerEstimateDocumentMarkup
};
