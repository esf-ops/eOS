function qf(fe) {
  return fe && fe.__esModule && Object.prototype.hasOwnProperty.call(fe, "default") ? fe.default : fe;
}
var hf = { exports: {} }, nf = {};
var Df;
function $f() {
  if (Df) return nf;
  Df = 1;
  var fe = /* @__PURE__ */ Symbol.for("react.transitional.element"), ce = /* @__PURE__ */ Symbol.for("react.fragment");
  function W(ke, nn, ye) {
    var Oe = null;
    if (ye !== void 0 && (Oe = "" + ye), nn.key !== void 0 && (Oe = "" + nn.key), "key" in nn) {
      ye = {};
      for (var Tn in nn)
        Tn !== "key" && (ye[Tn] = nn[Tn]);
    } else ye = nn;
    return nn = ye.ref, {
      $$typeof: fe,
      type: ke,
      key: Oe,
      ref: nn !== void 0 ? nn : null,
      props: ye
    };
  }
  return nf.Fragment = ce, nf.jsx = W, nf.jsxs = W, nf;
}
var tf = {}, df = { exports: {} }, gn = {};
var Lf;
function eh() {
  if (Lf) return gn;
  Lf = 1;
  var fe = /* @__PURE__ */ Symbol.for("react.transitional.element"), ce = /* @__PURE__ */ Symbol.for("react.portal"), W = /* @__PURE__ */ Symbol.for("react.fragment"), ke = /* @__PURE__ */ Symbol.for("react.strict_mode"), nn = /* @__PURE__ */ Symbol.for("react.profiler"), ye = /* @__PURE__ */ Symbol.for("react.consumer"), Oe = /* @__PURE__ */ Symbol.for("react.context"), Tn = /* @__PURE__ */ Symbol.for("react.forward_ref"), Re = /* @__PURE__ */ Symbol.for("react.suspense"), ie = /* @__PURE__ */ Symbol.for("react.memo"), Be = /* @__PURE__ */ Symbol.for("react.lazy"), A = /* @__PURE__ */ Symbol.for("react.activity"), D = Symbol.iterator;
  function Ae(T) {
    return T === null || typeof T != "object" ? null : (T = D && T[D] || T["@@iterator"], typeof T == "function" ? T : null);
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
  function tr(T, Y, pe) {
    this.props = T, this.context = Y, this.refs = ft, this.updater = pe || ee;
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
  function Gl(T, Y, pe) {
    this.props = T, this.context = Y, this.refs = ft, this.updater = pe || ee;
  }
  var Br = Gl.prototype = new Yt();
  Br.constructor = Gl, X(Br, tr.prototype), Br.isPureReactComponent = !0;
  var Jn = Array.isArray;
  function Me() {
  }
  var Je = { H: null, A: null, T: null, S: null }, Et = Object.prototype.hasOwnProperty;
  function rn(T, Y, pe) {
    var Te = pe.ref;
    return {
      $$typeof: fe,
      type: T,
      key: Y,
      ref: Te !== void 0 ? Te : null,
      props: pe
    };
  }
  function Kn(T, Y) {
    return rn(T.type, Y, T.props);
  }
  function si(T) {
    return typeof T == "object" && T !== null && T.$$typeof === fe;
  }
  function Ln(T) {
    var Y = { "=": "=0", ":": "=2" };
    return "$" + T.replace(/[=:]/g, function(pe) {
      return Y[pe];
    });
  }
  var qr = /\/+/g;
  function nt(T, Y) {
    return typeof T == "object" && T !== null && T.key != null ? Ln("" + T.key) : Y.toString(36);
  }
  function Pe(T) {
    switch (T.status) {
      case "fulfilled":
        return T.value;
      case "rejected":
        throw T.reason;
      default:
        switch (typeof T.status == "string" ? T.then(Me, Me) : (T.status = "pending", T.then(
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
  function Q(T, Y, pe, Te, me) {
    var Ne = typeof T;
    (Ne === "undefined" || Ne === "boolean") && (T = null);
    var Se = !1;
    if (T === null) Se = !0;
    else
      switch (Ne) {
        case "bigint":
        case "string":
        case "number":
          Se = !0;
          break;
        case "object":
          switch (T.$$typeof) {
            case fe:
            case ce:
              Se = !0;
              break;
            case Be:
              return Se = T._init, Q(
                Se(T._payload),
                Y,
                pe,
                Te,
                me
              );
          }
      }
    if (Se)
      return me = me(T), Se = Te === "" ? "." + nt(T, 0) : Te, Jn(me) ? (pe = "", Se != null && (pe = Se.replace(qr, "$&/") + "/"), Q(me, Y, pe, "", function(tt) {
        return tt;
      })) : me != null && (si(me) && (me = Kn(
        me,
        pe + (me.key == null || T && T.key === me.key ? "" : ("" + me.key).replace(
          qr,
          "$&/"
        ) + "/") + Se
      )), Y.push(me)), 1;
    Se = 0;
    var Rt = Te === "" ? "." : Te + ":";
    if (Jn(T))
      for (var Rn = 0; Rn < T.length; Rn++)
        Te = T[Rn], Ne = Rt + nt(Te, Rn), Se += Q(
          Te,
          Y,
          pe,
          Ne,
          me
        );
    else if (Rn = Ae(T), typeof Rn == "function")
      for (T = Rn.call(T), Rn = 0; !(Te = T.next()).done; )
        Te = Te.value, Ne = Rt + nt(Te, Rn++), Se += Q(
          Te,
          Y,
          pe,
          Ne,
          me
        );
    else if (Ne === "object") {
      if (typeof T.then == "function")
        return Q(
          Pe(T),
          Y,
          pe,
          Te,
          me
        );
      throw Y = String(T), Error(
        "Objects are not valid as a React child (found: " + (Y === "[object Object]" ? "object with keys {" + Object.keys(T).join(", ") + "}" : Y) + "). If you meant to render a collection of children, use an array instead."
      );
    }
    return Se;
  }
  function de(T, Y, pe) {
    if (T == null) return T;
    var Te = [], me = 0;
    return Q(T, Te, "", "", function(Ne) {
      return Y.call(pe, Ne, me++);
    }), Te;
  }
  function Tr(T) {
    if (T._status === -1) {
      var Y = T._result;
      Y = Y(), Y.then(
        function(pe) {
          (T._status === 0 || T._status === -1) && (T._status = 1, T._result = pe);
        },
        function(pe) {
          (T._status === 0 || T._status === -1) && (T._status = 2, T._result = pe);
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
  }, he = {
    map: de,
    forEach: function(T, Y, pe) {
      de(
        T,
        function() {
          Y.apply(this, arguments);
        },
        pe
      );
    },
    count: function(T) {
      var Y = 0;
      return de(T, function() {
        Y++;
      }), Y;
    },
    toArray: function(T) {
      return de(T, function(Y) {
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
  return gn.Activity = A, gn.Children = he, gn.Component = tr, gn.Fragment = W, gn.Profiler = nn, gn.PureComponent = Gl, gn.StrictMode = ke, gn.Suspense = Re, gn.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = Je, gn.__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(T) {
      return Je.H.useMemoCache(T);
    }
  }, gn.cache = function(T) {
    return function() {
      return T.apply(null, arguments);
    };
  }, gn.cacheSignal = function() {
    return null;
  }, gn.cloneElement = function(T, Y, pe) {
    if (T == null)
      throw Error(
        "The argument must be a React element, but you passed " + T + "."
      );
    var Te = X({}, T.props), me = T.key;
    if (Y != null)
      for (Ne in Y.key !== void 0 && (me = "" + Y.key), Y)
        !Et.call(Y, Ne) || Ne === "key" || Ne === "__self" || Ne === "__source" || Ne === "ref" && Y.ref === void 0 || (Te[Ne] = Y[Ne]);
    var Ne = arguments.length - 2;
    if (Ne === 1) Te.children = pe;
    else if (1 < Ne) {
      for (var Se = Array(Ne), Rt = 0; Rt < Ne; Rt++)
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
      $$typeof: ye,
      _context: T
    }, T;
  }, gn.createElement = function(T, Y, pe) {
    var Te, me = {}, Ne = null;
    if (Y != null)
      for (Te in Y.key !== void 0 && (Ne = "" + Y.key), Y)
        Et.call(Y, Te) && Te !== "key" && Te !== "__self" && Te !== "__source" && (me[Te] = Y[Te]);
    var Se = arguments.length - 2;
    if (Se === 1) me.children = pe;
    else if (1 < Se) {
      for (var Rt = Array(Se), Rn = 0; Rn < Se; Rn++)
        Rt[Rn] = arguments[Rn + 2];
      me.children = Rt;
    }
    if (T && T.defaultProps)
      for (Te in Se = T.defaultProps, Se)
        me[Te] === void 0 && (me[Te] = Se[Te]);
    return rn(T, Ne, me);
  }, gn.createRef = function() {
    return { current: null };
  }, gn.forwardRef = function(T) {
    return { $$typeof: Tn, render: T };
  }, gn.isValidElement = si, gn.lazy = function(T) {
    return {
      $$typeof: Be,
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
    var Y = Je.T, pe = {};
    Je.T = pe;
    try {
      var Te = T(), me = Je.S;
      me !== null && me(pe, Te), typeof Te == "object" && Te !== null && typeof Te.then == "function" && Te.then(Me, vl);
    } catch (Ne) {
      vl(Ne);
    } finally {
      Y !== null && pe.types !== null && (Y.types = pe.types), Je.T = Y;
    }
  }, gn.unstable_useCacheRefresh = function() {
    return Je.H.useCacheRefresh();
  }, gn.use = function(T) {
    return Je.H.use(T);
  }, gn.useActionState = function(T, Y, pe) {
    return Je.H.useActionState(T, Y, pe);
  }, gn.useCallback = function(T, Y) {
    return Je.H.useCallback(T, Y);
  }, gn.useContext = function(T) {
    return Je.H.useContext(T);
  }, gn.useDebugValue = function() {
  }, gn.useDeferredValue = function(T, Y) {
    return Je.H.useDeferredValue(T, Y);
  }, gn.useEffect = function(T, Y) {
    return Je.H.useEffect(T, Y);
  }, gn.useEffectEvent = function(T) {
    return Je.H.useEffectEvent(T);
  }, gn.useId = function() {
    return Je.H.useId();
  }, gn.useImperativeHandle = function(T, Y, pe) {
    return Je.H.useImperativeHandle(T, Y, pe);
  }, gn.useInsertionEffect = function(T, Y) {
    return Je.H.useInsertionEffect(T, Y);
  }, gn.useLayoutEffect = function(T, Y) {
    return Je.H.useLayoutEffect(T, Y);
  }, gn.useMemo = function(T, Y) {
    return Je.H.useMemo(T, Y);
  }, gn.useOptimistic = function(T, Y) {
    return Je.H.useOptimistic(T, Y);
  }, gn.useReducer = function(T, Y, pe) {
    return Je.H.useReducer(T, Y, pe);
  }, gn.useRef = function(T) {
    return Je.H.useRef(T);
  }, gn.useState = function(T) {
    return Je.H.useState(T);
  }, gn.useSyncExternalStore = function(T, Y, pe) {
    return Je.H.useSyncExternalStore(
      T,
      Y,
      pe
    );
  }, gn.useTransition = function() {
    return Je.H.useTransition();
  }, gn.version = "19.2.6", gn;
}
var of = { exports: {} };
of.exports;
var Nf;
function nh() {
  return Nf || (Nf = 1, (function(fe, ce) {
    process.env.NODE_ENV !== "production" && (function() {
      function W(R, L) {
        Object.defineProperty(ye.prototype, R, {
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
        return R === null || typeof R != "object" ? null : (R = Ia && R[Ia] || R["@@iterator"], typeof R == "function" ? R : null);
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
      function ye(R, L, ne) {
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
      function Be(R) {
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
      function A(R) {
        if (R == null) return null;
        if (typeof R == "function")
          return R.$$typeof === Xt ? null : R.displayName || R.name || null;
        if (typeof R == "string") return R;
        switch (R) {
          case T:
            return "Fragment";
          case pe:
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
            case he:
              return "Portal";
            case me:
              return R.displayName || "Context";
            case Te:
              return (R._context.displayName || "Context") + ".Consumer";
            case Ne:
              var L = R.render;
              return R = R.displayName, R || (R = L.displayName || L.name || "", R = R !== "" ? "ForwardRef(" + R + ")" : "ForwardRef"), R;
            case Rn:
              return L = R.displayName || null, L !== null ? L : A(R.type) || "Memo";
            case tt:
              L = R._payload, R = R._init;
              try {
                return A(R(L));
              } catch {
              }
          }
        return null;
      }
      function D(R) {
        if (R === T) return "<>";
        if (typeof R == "object" && R !== null && R.$$typeof === tt)
          return "<...>";
        try {
          var L = A(R);
          return L ? "<" + L + ">" : "<...>";
        } catch {
          return "<...>";
        }
      }
      function Ae() {
        var R = Ie.A;
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
        var R = A(this.type);
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
      function Br(R) {
        Jn(R) ? R._store && (R._store.validated = 1) : typeof R == "object" && R !== null && R.$$typeof === tt && (R._payload.status === "fulfilled" ? Jn(R._payload.value) && R._payload.value._store && (R._payload.value._store.validated = 1) : R._store && (R._store.validated = 1));
      }
      function Jn(R) {
        return typeof R == "object" && R !== null && R.$$typeof === vl;
      }
      function Me(R) {
        var L = { "=": "=0", ":": "=2" };
        return "$" + R.replace(/[=:]/g, function(ne) {
          return L[ne];
        });
      }
      function Je(R, L) {
        return typeof R == "object" && R !== null && R.key != null ? (Be(R.key), Me("" + R.key)) : L.toString(36);
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
                case he:
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
          var an = Ee === "" ? "." + Je(Ke, 0) : Ee;
          return Xl(Fe) ? (ne = "", an != null && (ne = an.replace(ht, "$&/") + "/"), rn(Fe, L, ne, "", function(Ql) {
            return Ql;
          })) : Fe != null && (Jn(Fe) && (Fe.key != null && (Ke && Ke.key === Fe.key || Be(Fe.key)), ne = Gl(
            Fe,
            ne + (Fe.key == null || Ke && Ke.key === Fe.key ? "" : ("" + Fe.key).replace(
              ht,
              "$&/"
            ) + "/") + an
          ), Ee !== "" && Ke != null && Jn(Ke) && Ke.key == null && Ke._store && !Ke._store.validated && (ne._store.validated = 2), Fe = ne), L.push(Fe)), 1;
        }
        if (Ke = 0, an = Ee === "" ? "." : Ee + ":", Xl(R))
          for (var We = 0; We < R.length; We++)
            Ee = R[We], ln = an + Je(Ee, We), Ke += rn(
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
            Ee = Ee.value, ln = an + Je(Ee, We++), Ke += rn(
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
        var R = Ie.H;
        return R === null && console.error(
          `Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:
1. You might have mismatching versions of React and the renderer (such as React DOM)
2. You might be breaking the Rules of Hooks
3. You might have more than one copy of React in the same app
See https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.`
        ), R;
      }
      function qr() {
        Ie.asyncTransitions--;
      }
      function nt(R) {
        if (el === null)
          try {
            var L = ("require" + Math.random()).slice(0, 7);
            el = (fe && fe[L]).call(
              fe,
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
      function Pe(R) {
        return 1 < R.length && typeof AggregateError == "function" ? new AggregateError(R) : R[0];
      }
      function Q(R, L) {
        L !== aa - 1 && console.error(
          "You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. "
        ), aa = L;
      }
      function de(R, L, ne) {
        var Ee = Ie.actQueue;
        if (Ee !== null)
          if (Ee.length !== 0)
            try {
              Tr(Ee), nt(function() {
                return de(R, L, ne);
              });
              return;
            } catch (Fe) {
              Ie.thrownErrors.push(Fe);
            }
          else Ie.actQueue = null;
        0 < Ie.thrownErrors.length ? (Ee = Pe(Ie.thrownErrors), Ie.thrownErrors.length = 0, ne(Ee)) : L(R);
      }
      function Tr(R) {
        if (!Zl) {
          Zl = !0;
          var L = 0;
          try {
            for (; L < R.length; L++) {
              var ne = R[L];
              do {
                Ie.didUsePromise = !1;
                var Ee = ne(!1);
                if (Ee !== null) {
                  if (Ie.didUsePromise) {
                    R[L] = ne, R.splice(0, L);
                    return;
                  }
                  ne = Ee;
                } else break;
              } while (!0);
            }
            R.length = 0;
          } catch (Fe) {
            R.splice(0, L + 1), Ie.thrownErrors.push(Fe);
          } finally {
            Zl = !1;
          }
        }
      }
      typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart == "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
      var vl = /* @__PURE__ */ Symbol.for("react.transitional.element"), he = /* @__PURE__ */ Symbol.for("react.portal"), T = /* @__PURE__ */ Symbol.for("react.fragment"), Y = /* @__PURE__ */ Symbol.for("react.strict_mode"), pe = /* @__PURE__ */ Symbol.for("react.profiler"), Te = /* @__PURE__ */ Symbol.for("react.consumer"), me = /* @__PURE__ */ Symbol.for("react.context"), Ne = /* @__PURE__ */ Symbol.for("react.forward_ref"), Se = /* @__PURE__ */ Symbol.for("react.suspense"), Rt = /* @__PURE__ */ Symbol.for("react.suspense_list"), Rn = /* @__PURE__ */ Symbol.for("react.memo"), tt = /* @__PURE__ */ Symbol.for("react.lazy"), Ct = /* @__PURE__ */ Symbol.for("react.activity"), Ia = Symbol.iterator, Ge = {}, mt = {
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
      Object.freeze(St), ye.prototype.isReactComponent = {}, ye.prototype.setState = function(R, L) {
        if (typeof R != "object" && typeof R != "function" && R != null)
          throw Error(
            "takes an object of state variables to update or a function which returns an object of state variables."
          );
        this.updater.enqueueSetState(this, R, L, "setState");
      }, ye.prototype.forceUpdate = function(R) {
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
      for (bl in Gt)
        Gt.hasOwnProperty(bl) && W(bl, Gt[bl]);
      Oe.prototype = ye.prototype, Gt = Tn.prototype = new Oe(), Gt.constructor = Tn, xn(Gt, ye.prototype), Gt.isPureReactComponent = !0;
      var Xl = Array.isArray, Xt = /* @__PURE__ */ Symbol.for("react.client.reference"), Ie = {
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
      }, xr = Object.prototype.hasOwnProperty, Pt = console.createTask ? console.createTask : function() {
        return null;
      };
      Gt = {
        react_stack_bottom_frame: function(R) {
          return R();
        }
      };
      var $r, Da, vn = {}, rr = Gt.react_stack_bottom_frame.bind(
        Gt,
        ee
      )(), Nn = Pt(D(ee)), rc = !1, ht = /\/+/g, To = typeof reportError == "function" ? reportError : function(R) {
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
      }, xo = !1, el = null, aa = 0, fi = !1, Zl = !1, Vl = typeof queueMicrotask == "function" ? function(R) {
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
      var bl = {
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
          if (!Jn(R))
            throw Error(
              "React.Children.only expected to receive a single React element child."
            );
          return R;
        }
      };
      ce.Activity = Ct, ce.Children = bl, ce.Component = ye, ce.Fragment = T, ce.Profiler = pe, ce.PureComponent = Tn, ce.StrictMode = Y, ce.Suspense = Se, ce.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = Ie, ce.__COMPILER_RUNTIME = Gt, ce.act = function(R) {
        var L = Ie.actQueue, ne = aa;
        aa++;
        var Ee = Ie.actQueue = L !== null ? L : [], Fe = !1;
        try {
          var ln = R();
        } catch (We) {
          Ie.thrownErrors.push(We);
        }
        if (0 < Ie.thrownErrors.length)
          throw Q(L, ne), R = Pe(Ie.thrownErrors), Ie.thrownErrors.length = 0, R;
        if (ln !== null && typeof ln == "object" && typeof ln.then == "function") {
          var Ke = ln;
          return Vl(function() {
            Fe || fi || (fi = !0, console.error(
              "You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);"
            ));
          }), {
            then: function(We, Ql) {
              Fe = !0, Ke.then(
                function(nl) {
                  if (Q(L, ne), ne === 0) {
                    try {
                      Tr(Ee), nt(function() {
                        return de(
                          nl,
                          We,
                          Ql
                        );
                      });
                    } catch (hi) {
                      Ie.thrownErrors.push(hi);
                    }
                    if (0 < Ie.thrownErrors.length) {
                      var dt = Pe(
                        Ie.thrownErrors
                      );
                      Ie.thrownErrors.length = 0, Ql(dt);
                    }
                  } else We(nl);
                },
                function(nl) {
                  Q(L, ne), 0 < Ie.thrownErrors.length && (nl = Pe(
                    Ie.thrownErrors
                  ), Ie.thrownErrors.length = 0), Ql(nl);
                }
              );
            }
          };
        }
        var an = ln;
        if (Q(L, ne), ne === 0 && (Tr(Ee), Ee.length !== 0 && Vl(function() {
          Fe || fi || (fi = !0, console.error(
            "A component suspended inside an `act` scope, but the `act` call was not awaited. When testing React components that depend on asynchronous data, you must await the result:\n\nawait act(() => ...)"
          ));
        }), Ie.actQueue = null), 0 < Ie.thrownErrors.length)
          throw R = Pe(Ie.thrownErrors), Ie.thrownErrors.length = 0, R;
        return {
          then: function(We, Ql) {
            Fe = !0, ne === 0 ? (Ie.actQueue = Ee, nt(function() {
              return de(
                an,
                We,
                Ql
              );
            })) : We(an);
          }
        };
      }, ce.cache = function(R) {
        return function() {
          return R.apply(null, arguments);
        };
      }, ce.cacheSignal = function() {
        return null;
      }, ce.captureOwnerStack = function() {
        var R = Ie.getCurrentStack;
        return R === null ? null : R();
      }, ce.cloneElement = function(R, L, ne) {
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
          Ke && (ln = Ae()), X(L) && (Be(L.key), Fe = "" + L.key);
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
          Br(arguments[Fe]);
        return Ee;
      }, ce.createContext = function(R) {
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
      }, ce.createElement = function(R, L, ne) {
        for (var Ee = 2; Ee < arguments.length; Ee++)
          Br(arguments[Ee]);
        Ee = {};
        var Fe = null;
        if (L != null)
          for (We in Da || !("__self" in L) || "key" in L || (Da = !0, console.warn(
            "Your app (or one of its dependencies) is using an outdated JSX transform. Update to the modern JSX transform for faster performance: https://react.dev/link/new-jsx-transform"
          )), X(L) && (Be(L.key), Fe = "" + L.key), L)
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
        var We = 1e4 > Ie.recentlyCreatedOwnerStacks++;
        return Yt(
          R,
          Fe,
          Ee,
          Ae(),
          We ? Error("react-stack-top-frame") : rr,
          We ? Pt(D(R)) : Nn
        );
      }, ce.createRef = function() {
        var R = { current: null };
        return Object.seal(R), R;
      }, ce.forwardRef = function(R) {
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
        var L = { $$typeof: Ne, render: R }, ne;
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
      }, ce.isValidElement = Jn, ce.lazy = function(R) {
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
      }, ce.memo = function(R, L) {
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
      }, ce.startTransition = function(R) {
        var L = Ie.T, ne = {};
        ne._updatedFibers = /* @__PURE__ */ new Set(), Ie.T = ne;
        try {
          var Ee = R(), Fe = Ie.S;
          Fe !== null && Fe(ne, Ee), typeof Ee == "object" && Ee !== null && typeof Ee.then == "function" && (Ie.asyncTransitions++, Ee.then(qr, qr), Ee.then(Re, To));
        } catch (ln) {
          To(ln);
        } finally {
          L === null && ne._updatedFibers && (R = ne._updatedFibers.size, ne._updatedFibers.clear(), 10 < R && console.warn(
            "Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table."
          )), L !== null && ne.types !== null && (L.types !== null && L.types !== ne.types && console.error(
            "We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."
          ), L.types = ne.types), Ie.T = L;
        }
      }, ce.unstable_useCacheRefresh = function() {
        return Ln().useCacheRefresh();
      }, ce.use = function(R) {
        return Ln().use(R);
      }, ce.useActionState = function(R, L, ne) {
        return Ln().useActionState(
          R,
          L,
          ne
        );
      }, ce.useCallback = function(R, L) {
        return Ln().useCallback(R, L);
      }, ce.useContext = function(R) {
        var L = Ln();
        return R.$$typeof === Te && console.error(
          "Calling useContext(Context.Consumer) is not supported and will cause bugs. Did you mean to call useContext(Context) instead?"
        ), L.useContext(R);
      }, ce.useDebugValue = function(R, L) {
        return Ln().useDebugValue(R, L);
      }, ce.useDeferredValue = function(R, L) {
        return Ln().useDeferredValue(R, L);
      }, ce.useEffect = function(R, L) {
        return R == null && console.warn(
          "React Hook useEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        ), Ln().useEffect(R, L);
      }, ce.useEffectEvent = function(R) {
        return Ln().useEffectEvent(R);
      }, ce.useId = function() {
        return Ln().useId();
      }, ce.useImperativeHandle = function(R, L, ne) {
        return Ln().useImperativeHandle(R, L, ne);
      }, ce.useInsertionEffect = function(R, L) {
        return R == null && console.warn(
          "React Hook useInsertionEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        ), Ln().useInsertionEffect(R, L);
      }, ce.useLayoutEffect = function(R, L) {
        return R == null && console.warn(
          "React Hook useLayoutEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        ), Ln().useLayoutEffect(R, L);
      }, ce.useMemo = function(R, L) {
        return Ln().useMemo(R, L);
      }, ce.useOptimistic = function(R, L) {
        return Ln().useOptimistic(R, L);
      }, ce.useReducer = function(R, L, ne) {
        return Ln().useReducer(R, L, ne);
      }, ce.useRef = function(R) {
        return Ln().useRef(R);
      }, ce.useState = function(R) {
        return Ln().useState(R);
      }, ce.useSyncExternalStore = function(R, L, ne) {
        return Ln().useSyncExternalStore(
          R,
          L,
          ne
        );
      }, ce.useTransition = function() {
        return Ln().useTransition();
      }, ce.version = "19.2.6", typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop == "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
    })();
  })(of, of.exports)), of.exports;
}
var zf;
function _s() {
  return zf || (zf = 1, process.env.NODE_ENV === "production" ? df.exports = eh() : df.exports = nh()), df.exports;
}
var Hf;
function th() {
  return Hf || (Hf = 1, process.env.NODE_ENV !== "production" && (function() {
    function fe(T) {
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
        case Me:
          return "Suspense";
        case Je:
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
          case Br:
            return T.displayName || "Context";
          case Gl:
            return (T._context.displayName || "Context") + ".Consumer";
          case Jn:
            var Y = T.render;
            return T = T.displayName, T || (T = Y.displayName || Y.name || "", T = T !== "" ? "ForwardRef(" + T + ")" : "ForwardRef"), T;
          case Et:
            return Y = T.displayName || null, Y !== null ? Y : fe(T.type) || "Memo";
          case rn:
            Y = T._payload, T = T._init;
            try {
              return fe(T(Y));
            } catch {
            }
        }
      return null;
    }
    function ce(T) {
      return "" + T;
    }
    function W(T) {
      try {
        ce(T);
        var Y = !1;
      } catch {
        Y = !0;
      }
      if (Y) {
        Y = console;
        var pe = Y.error, Te = typeof Symbol == "function" && Symbol.toStringTag && T[Symbol.toStringTag] || T.constructor.name || "Object";
        return pe.call(
          Y,
          "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
          Te
        ), ce(T);
      }
    }
    function ke(T) {
      if (T === ft) return "<>";
      if (typeof T == "object" && T !== null && T.$$typeof === rn)
        return "<...>";
      try {
        var Y = fe(T);
        return Y ? "<" + Y + ">" : "<...>";
      } catch {
        return "<...>";
      }
    }
    function nn() {
      var T = Ln.A;
      return T === null ? null : T.getOwner();
    }
    function ye() {
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
      function pe() {
        Q || (Q = !0, console.error(
          "%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)",
          Y
        ));
      }
      pe.isReactWarning = !0, Object.defineProperty(T, "key", {
        get: pe,
        configurable: !0
      });
    }
    function Re() {
      var T = fe(this.type);
      return de[T] || (de[T] = !0, console.error(
        "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
      )), T = this.props.ref, T !== void 0 ? T : null;
    }
    function ie(T, Y, pe, Te, me, Ne) {
      var Se = pe.ref;
      return T = {
        $$typeof: ee,
        type: T,
        key: Y,
        props: pe,
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
        value: Ne
      }), Object.freeze && (Object.freeze(T.props), Object.freeze(T)), T;
    }
    function Be(T, Y, pe, Te, me, Ne) {
      var Se = Y.children;
      if (Se !== void 0)
        if (Te)
          if (nt(Se)) {
            for (Te = 0; Te < Se.length; Te++)
              A(Se[Te]);
            Object.freeze && Object.freeze(Se);
          } else
            console.error(
              "React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead."
            );
        else A(Se);
      if (qr.call(Y, "key")) {
        Se = fe(T);
        var Rt = Object.keys(Y).filter(function(tt) {
          return tt !== "key";
        });
        Te = 0 < Rt.length ? "{key: someKey, " + Rt.join(": ..., ") + ": ...}" : "{key: someKey}", he[Se + Te] || (Rt = 0 < Rt.length ? "{" + Rt.join(": ..., ") + ": ...}" : "{}", console.error(
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
        ), he[Se + Te] = !0);
      }
      if (Se = null, pe !== void 0 && (W(pe), Se = "" + pe), Oe(Y) && (W(Y.key), Se = "" + Y.key), "key" in Y) {
        pe = {};
        for (var Rn in Y)
          Rn !== "key" && (pe[Rn] = Y[Rn]);
      } else pe = Y;
      return Se && Tn(
        pe,
        typeof T == "function" ? T.displayName || T.name || "Unknown" : T
      ), ie(
        T,
        Se,
        pe,
        nn(),
        me,
        Ne
      );
    }
    function A(T) {
      D(T) ? T._store && (T._store.validated = 1) : typeof T == "object" && T !== null && T.$$typeof === rn && (T._payload.status === "fulfilled" ? D(T._payload.value) && T._payload.value._store && (T._payload.value._store.validated = 1) : T._store && (T._store.validated = 1));
    }
    function D(T) {
      return typeof T == "object" && T !== null && T.$$typeof === ee;
    }
    var Ae = _s(), ee = /* @__PURE__ */ Symbol.for("react.transitional.element"), X = /* @__PURE__ */ Symbol.for("react.portal"), ft = /* @__PURE__ */ Symbol.for("react.fragment"), tr = /* @__PURE__ */ Symbol.for("react.strict_mode"), Yt = /* @__PURE__ */ Symbol.for("react.profiler"), Gl = /* @__PURE__ */ Symbol.for("react.consumer"), Br = /* @__PURE__ */ Symbol.for("react.context"), Jn = /* @__PURE__ */ Symbol.for("react.forward_ref"), Me = /* @__PURE__ */ Symbol.for("react.suspense"), Je = /* @__PURE__ */ Symbol.for("react.suspense_list"), Et = /* @__PURE__ */ Symbol.for("react.memo"), rn = /* @__PURE__ */ Symbol.for("react.lazy"), Kn = /* @__PURE__ */ Symbol.for("react.activity"), si = /* @__PURE__ */ Symbol.for("react.client.reference"), Ln = Ae.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, qr = Object.prototype.hasOwnProperty, nt = Array.isArray, Pe = console.createTask ? console.createTask : function() {
      return null;
    };
    Ae = {
      react_stack_bottom_frame: function(T) {
        return T();
      }
    };
    var Q, de = {}, Tr = Ae.react_stack_bottom_frame.bind(
      Ae,
      ye
    )(), vl = Pe(ke(ye)), he = {};
    tf.Fragment = ft, tf.jsx = function(T, Y, pe) {
      var Te = 1e4 > Ln.recentlyCreatedOwnerStacks++;
      return Be(
        T,
        Y,
        pe,
        !1,
        Te ? Error("react-stack-top-frame") : Tr,
        Te ? Pe(ke(T)) : vl
      );
    }, tf.jsxs = function(T, Y, pe) {
      var Te = 1e4 > Ln.recentlyCreatedOwnerStacks++;
      return Be(
        T,
        Y,
        pe,
        !0,
        Te ? Error("react-stack-top-frame") : Tr,
        Te ? Pe(ke(T)) : vl
      );
    };
  })()), tf;
}
var Bf;
function rh() {
  return Bf || (Bf = 1, process.env.NODE_ENV === "production" ? hf.exports = $f() : hf.exports = th()), hf.exports;
}
var q = rh(), Ws = {}, rf = {}, gf = { exports: {} }, la = {};
var Uf;
function lh() {
  if (Uf) return la;
  Uf = 1;
  var fe = _s();
  function ce(Re) {
    var ie = "https://react.dev/errors/" + Re;
    if (1 < arguments.length) {
      ie += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var Be = 2; Be < arguments.length; Be++)
        ie += "&args[]=" + encodeURIComponent(arguments[Be]);
    }
    return "Minified React error #" + Re + "; visit " + ie + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function W() {
  }
  var ke = {
    d: {
      f: W,
      r: function() {
        throw Error(ce(522));
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
  function ye(Re, ie, Be) {
    var A = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return {
      $$typeof: nn,
      key: A == null ? null : "" + A,
      children: Re,
      containerInfo: ie,
      implementation: Be
    };
  }
  var Oe = fe.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  function Tn(Re, ie) {
    if (Re === "font") return "";
    if (typeof ie == "string")
      return ie === "use-credentials" ? ie : "";
  }
  return la.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ke, la.createPortal = function(Re, ie) {
    var Be = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
    if (!ie || ie.nodeType !== 1 && ie.nodeType !== 9 && ie.nodeType !== 11)
      throw Error(ce(299));
    return ye(Re, ie, null, Be);
  }, la.flushSync = function(Re) {
    var ie = Oe.T, Be = ke.p;
    try {
      if (Oe.T = null, ke.p = 2, Re) return Re();
    } finally {
      Oe.T = ie, ke.p = Be, ke.d.f();
    }
  }, la.preconnect = function(Re, ie) {
    typeof Re == "string" && (ie ? (ie = ie.crossOrigin, ie = typeof ie == "string" ? ie === "use-credentials" ? ie : "" : void 0) : ie = null, ke.d.C(Re, ie));
  }, la.prefetchDNS = function(Re) {
    typeof Re == "string" && ke.d.D(Re);
  }, la.preinit = function(Re, ie) {
    if (typeof Re == "string" && ie && typeof ie.as == "string") {
      var Be = ie.as, A = Tn(Be, ie.crossOrigin), D = typeof ie.integrity == "string" ? ie.integrity : void 0, Ae = typeof ie.fetchPriority == "string" ? ie.fetchPriority : void 0;
      Be === "style" ? ke.d.S(
        Re,
        typeof ie.precedence == "string" ? ie.precedence : void 0,
        {
          crossOrigin: A,
          integrity: D,
          fetchPriority: Ae
        }
      ) : Be === "script" && ke.d.X(Re, {
        crossOrigin: A,
        integrity: D,
        fetchPriority: Ae,
        nonce: typeof ie.nonce == "string" ? ie.nonce : void 0
      });
    }
  }, la.preinitModule = function(Re, ie) {
    if (typeof Re == "string")
      if (typeof ie == "object" && ie !== null) {
        if (ie.as == null || ie.as === "script") {
          var Be = Tn(
            ie.as,
            ie.crossOrigin
          );
          ke.d.M(Re, {
            crossOrigin: Be,
            integrity: typeof ie.integrity == "string" ? ie.integrity : void 0,
            nonce: typeof ie.nonce == "string" ? ie.nonce : void 0
          });
        }
      } else ie == null && ke.d.M(Re);
  }, la.preload = function(Re, ie) {
    if (typeof Re == "string" && typeof ie == "object" && ie !== null && typeof ie.as == "string") {
      var Be = ie.as, A = Tn(Be, ie.crossOrigin);
      ke.d.L(Re, Be, {
        crossOrigin: A,
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
        var Be = Tn(ie.as, ie.crossOrigin);
        ke.d.m(Re, {
          as: typeof ie.as == "string" && ie.as !== "script" ? ie.as : void 0,
          crossOrigin: Be,
          integrity: typeof ie.integrity == "string" ? ie.integrity : void 0
        });
      } else ke.d.m(Re);
  }, la.requestFormReset = function(Re) {
    ke.d.r(Re);
  }, la.unstable_batchedUpdates = function(Re, ie) {
    return Re(ie);
  }, la.useFormState = function(Re, ie, Be) {
    return Oe.H.useFormState(Re, ie, Be);
  }, la.useFormStatus = function() {
    return Oe.H.useHostTransitionStatus();
  }, la.version = "19.2.6", la;
}
var ia = {};
var Wf;
function ih() {
  return Wf || (Wf = 1, process.env.NODE_ENV !== "production" && (function() {
    function fe() {
    }
    function ce(A) {
      return "" + A;
    }
    function W(A, D, Ae) {
      var ee = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
      try {
        ce(ee);
        var X = !1;
      } catch {
        X = !0;
      }
      return X && (console.error(
        "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
        typeof Symbol == "function" && Symbol.toStringTag && ee[Symbol.toStringTag] || ee.constructor.name || "Object"
      ), ce(ee)), {
        $$typeof: ie,
        key: ee == null ? null : "" + ee,
        children: A,
        containerInfo: D,
        implementation: Ae
      };
    }
    function ke(A, D) {
      if (A === "font") return "";
      if (typeof D == "string")
        return D === "use-credentials" ? D : "";
    }
    function nn(A) {
      return A === null ? "`null`" : A === void 0 ? "`undefined`" : A === "" ? "an empty string" : 'something with type "' + typeof A + '"';
    }
    function ye(A) {
      return A === null ? "`null`" : A === void 0 ? "`undefined`" : A === "" ? "an empty string" : typeof A == "string" ? JSON.stringify(A) : typeof A == "number" ? "`" + A + "`" : 'something with type "' + typeof A + '"';
    }
    function Oe() {
      var A = Be.H;
      return A === null && console.error(
        `Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:
1. You might have mismatching versions of React and the renderer (such as React DOM)
2. You might be breaking the Rules of Hooks
3. You might have more than one copy of React in the same app
See https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.`
      ), A;
    }
    typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart == "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
    var Tn = _s(), Re = {
      d: {
        f: fe,
        r: function() {
          throw Error(
            "Invalid form element. requestFormReset must be passed a form that was rendered by React."
          );
        },
        D: fe,
        C: fe,
        L: fe,
        m: fe,
        X: fe,
        S: fe,
        M: fe
      },
      p: 0,
      findDOMNode: null
    }, ie = /* @__PURE__ */ Symbol.for("react.portal"), Be = Tn.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    typeof Map == "function" && Map.prototype != null && typeof Map.prototype.forEach == "function" && typeof Set == "function" && Set.prototype != null && typeof Set.prototype.clear == "function" && typeof Set.prototype.forEach == "function" || console.error(
      "React depends on Map and Set built-in types. Make sure that you load a polyfill in older browsers. https://reactjs.org/link/react-polyfills"
    ), ia.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = Re, ia.createPortal = function(A, D) {
      var Ae = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
      if (!D || D.nodeType !== 1 && D.nodeType !== 9 && D.nodeType !== 11)
        throw Error("Target container is not a DOM element.");
      return W(A, D, null, Ae);
    }, ia.flushSync = function(A) {
      var D = Be.T, Ae = Re.p;
      try {
        if (Be.T = null, Re.p = 2, A)
          return A();
      } finally {
        Be.T = D, Re.p = Ae, Re.d.f() && console.error(
          "flushSync was called from inside a lifecycle method. React cannot flush when React is already rendering. Consider moving this call to a scheduler task or micro task."
        );
      }
    }, ia.preconnect = function(A, D) {
      typeof A == "string" && A ? D != null && typeof D != "object" ? console.error(
        "ReactDOM.preconnect(): Expected the `options` argument (second) to be an object but encountered %s instead. The only supported option at this time is `crossOrigin` which accepts a string.",
        ye(D)
      ) : D != null && typeof D.crossOrigin != "string" && console.error(
        "ReactDOM.preconnect(): Expected the `crossOrigin` option (second argument) to be a string but encountered %s instead. Try removing this option or passing a string value instead.",
        nn(D.crossOrigin)
      ) : console.error(
        "ReactDOM.preconnect(): Expected the `href` argument (first) to be a non-empty string but encountered %s instead.",
        nn(A)
      ), typeof A == "string" && (D ? (D = D.crossOrigin, D = typeof D == "string" ? D === "use-credentials" ? D : "" : void 0) : D = null, Re.d.C(A, D));
    }, ia.prefetchDNS = function(A) {
      if (typeof A != "string" || !A)
        console.error(
          "ReactDOM.prefetchDNS(): Expected the `href` argument (first) to be a non-empty string but encountered %s instead.",
          nn(A)
        );
      else if (1 < arguments.length) {
        var D = arguments[1];
        typeof D == "object" && D.hasOwnProperty("crossOrigin") ? console.error(
          "ReactDOM.prefetchDNS(): Expected only one argument, `href`, but encountered %s as a second argument instead. This argument is reserved for future options and is currently disallowed. It looks like the you are attempting to set a crossOrigin property for this DNS lookup hint. Browsers do not perform DNS queries using CORS and setting this attribute on the resource hint has no effect. Try calling ReactDOM.prefetchDNS() with just a single string argument, `href`.",
          ye(D)
        ) : console.error(
          "ReactDOM.prefetchDNS(): Expected only one argument, `href`, but encountered %s as a second argument instead. This argument is reserved for future options and is currently disallowed. Try calling ReactDOM.prefetchDNS() with just a single string argument, `href`.",
          ye(D)
        );
      }
      typeof A == "string" && Re.d.D(A);
    }, ia.preinit = function(A, D) {
      if (typeof A == "string" && A ? D == null || typeof D != "object" ? console.error(
        "ReactDOM.preinit(): Expected the `options` argument (second) to be an object with an `as` property describing the type of resource to be preinitialized but encountered %s instead.",
        ye(D)
      ) : D.as !== "style" && D.as !== "script" && console.error(
        'ReactDOM.preinit(): Expected the `as` property in the `options` argument (second) to contain a valid value describing the type of resource to be preinitialized but encountered %s instead. Valid values for `as` are "style" and "script".',
        ye(D.as)
      ) : console.error(
        "ReactDOM.preinit(): Expected the `href` argument (first) to be a non-empty string but encountered %s instead.",
        nn(A)
      ), typeof A == "string" && D && typeof D.as == "string") {
        var Ae = D.as, ee = ke(Ae, D.crossOrigin), X = typeof D.integrity == "string" ? D.integrity : void 0, ft = typeof D.fetchPriority == "string" ? D.fetchPriority : void 0;
        Ae === "style" ? Re.d.S(
          A,
          typeof D.precedence == "string" ? D.precedence : void 0,
          {
            crossOrigin: ee,
            integrity: X,
            fetchPriority: ft
          }
        ) : Ae === "script" && Re.d.X(A, {
          crossOrigin: ee,
          integrity: X,
          fetchPriority: ft,
          nonce: typeof D.nonce == "string" ? D.nonce : void 0
        });
      }
    }, ia.preinitModule = function(A, D) {
      var Ae = "";
      typeof A == "string" && A || (Ae += " The `href` argument encountered was " + nn(A) + "."), D !== void 0 && typeof D != "object" ? Ae += " The `options` argument encountered was " + nn(D) + "." : D && "as" in D && D.as !== "script" && (Ae += " The `as` option encountered was " + ye(D.as) + "."), Ae ? console.error(
        "ReactDOM.preinitModule(): Expected up to two arguments, a non-empty `href` string and, optionally, an `options` object with a valid `as` property.%s",
        Ae
      ) : (Ae = D && typeof D.as == "string" ? D.as : "script", Ae) === "script" || (Ae = ye(Ae), console.error(
        'ReactDOM.preinitModule(): Currently the only supported "as" type for this function is "script" but received "%s" instead. This warning was generated for `href` "%s". In the future other module types will be supported, aligning with the import-attributes proposal. Learn more here: (https://github.com/tc39/proposal-import-attributes)',
        Ae,
        A
      )), typeof A == "string" && (typeof D == "object" && D !== null ? (D.as == null || D.as === "script") && (Ae = ke(
        D.as,
        D.crossOrigin
      ), Re.d.M(A, {
        crossOrigin: Ae,
        integrity: typeof D.integrity == "string" ? D.integrity : void 0,
        nonce: typeof D.nonce == "string" ? D.nonce : void 0
      })) : D == null && Re.d.M(A));
    }, ia.preload = function(A, D) {
      var Ae = "";
      if (typeof A == "string" && A || (Ae += " The `href` argument encountered was " + nn(A) + "."), D == null || typeof D != "object" ? Ae += " The `options` argument encountered was " + nn(D) + "." : typeof D.as == "string" && D.as || (Ae += " The `as` option encountered was " + nn(D.as) + "."), Ae && console.error(
        'ReactDOM.preload(): Expected two arguments, a non-empty `href` string and an `options` object with an `as` property valid for a `<link rel="preload" as="..." />` tag.%s',
        Ae
      ), typeof A == "string" && typeof D == "object" && D !== null && typeof D.as == "string") {
        Ae = D.as;
        var ee = ke(
          Ae,
          D.crossOrigin
        );
        Re.d.L(A, Ae, {
          crossOrigin: ee,
          integrity: typeof D.integrity == "string" ? D.integrity : void 0,
          nonce: typeof D.nonce == "string" ? D.nonce : void 0,
          type: typeof D.type == "string" ? D.type : void 0,
          fetchPriority: typeof D.fetchPriority == "string" ? D.fetchPriority : void 0,
          referrerPolicy: typeof D.referrerPolicy == "string" ? D.referrerPolicy : void 0,
          imageSrcSet: typeof D.imageSrcSet == "string" ? D.imageSrcSet : void 0,
          imageSizes: typeof D.imageSizes == "string" ? D.imageSizes : void 0,
          media: typeof D.media == "string" ? D.media : void 0
        });
      }
    }, ia.preloadModule = function(A, D) {
      var Ae = "";
      typeof A == "string" && A || (Ae += " The `href` argument encountered was " + nn(A) + "."), D !== void 0 && typeof D != "object" ? Ae += " The `options` argument encountered was " + nn(D) + "." : D && "as" in D && typeof D.as != "string" && (Ae += " The `as` option encountered was " + nn(D.as) + "."), Ae && console.error(
        'ReactDOM.preloadModule(): Expected two arguments, a non-empty `href` string and, optionally, an `options` object with an `as` property valid for a `<link rel="modulepreload" as="..." />` tag.%s',
        Ae
      ), typeof A == "string" && (D ? (Ae = ke(
        D.as,
        D.crossOrigin
      ), Re.d.m(A, {
        as: typeof D.as == "string" && D.as !== "script" ? D.as : void 0,
        crossOrigin: Ae,
        integrity: typeof D.integrity == "string" ? D.integrity : void 0
      })) : Re.d.m(A));
    }, ia.requestFormReset = function(A) {
      Re.d.r(A);
    }, ia.unstable_batchedUpdates = function(A, D) {
      return A(D);
    }, ia.useFormState = function(A, D, Ae) {
      return Oe().useFormState(A, D, Ae);
    }, ia.useFormStatus = function() {
      return Oe().useHostTransitionStatus();
    }, ia.version = "19.2.6", typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop == "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
  })()), ia;
}
var Yf;
function bf() {
  if (Yf) return gf.exports;
  Yf = 1;
  function fe() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function")) {
      if (process.env.NODE_ENV !== "production")
        throw new Error("^_^");
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(fe);
      } catch (ce) {
        console.error(ce);
      }
    }
  }
  return process.env.NODE_ENV === "production" ? (fe(), gf.exports = lh()) : gf.exports = ih(), gf.exports;
}
var Gf;
function ah() {
  if (Gf) return rf;
  Gf = 1;
  var fe = _s(), ce = bf();
  function W(i) {
    var o = "https://react.dev/errors/" + i;
    if (1 < arguments.length) {
      o += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var f = 2; f < arguments.length; f++)
        o += "&args[]=" + encodeURIComponent(arguments[f]);
    }
    return "Minified React error #" + i + "; visit " + o + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  var ke = /* @__PURE__ */ Symbol.for("react.transitional.element"), nn = /* @__PURE__ */ Symbol.for("react.portal"), ye = /* @__PURE__ */ Symbol.for("react.fragment"), Oe = /* @__PURE__ */ Symbol.for("react.strict_mode"), Tn = /* @__PURE__ */ Symbol.for("react.profiler"), Re = /* @__PURE__ */ Symbol.for("react.consumer"), ie = /* @__PURE__ */ Symbol.for("react.context"), Be = /* @__PURE__ */ Symbol.for("react.forward_ref"), A = /* @__PURE__ */ Symbol.for("react.suspense"), D = /* @__PURE__ */ Symbol.for("react.suspense_list"), Ae = /* @__PURE__ */ Symbol.for("react.memo"), ee = /* @__PURE__ */ Symbol.for("react.lazy"), X = /* @__PURE__ */ Symbol.for("react.scope"), ft = /* @__PURE__ */ Symbol.for("react.activity"), tr = /* @__PURE__ */ Symbol.for("react.legacy_hidden"), Yt = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), Gl = /* @__PURE__ */ Symbol.for("react.view_transition"), Br = Symbol.iterator;
  function Jn(i) {
    return i === null || typeof i != "object" ? null : (i = Br && i[Br] || i["@@iterator"], typeof i == "function" ? i : null);
  }
  var Me = Array.isArray;
  function Je(i, o) {
    var f = i.length & 3, g = i.length - f, w = o;
    for (o = 0; o < g; ) {
      var m = i.charCodeAt(o) & 255 | (i.charCodeAt(++o) & 255) << 8 | (i.charCodeAt(++o) & 255) << 16 | (i.charCodeAt(++o) & 255) << 24;
      ++o, m = 3432918353 * (m & 65535) + ((3432918353 * (m >>> 16) & 65535) << 16) & 4294967295, m = m << 15 | m >>> 17, m = 461845907 * (m & 65535) + ((461845907 * (m >>> 16) & 65535) << 16) & 4294967295, w ^= m, w = w << 13 | w >>> 19, w = 5 * (w & 65535) + ((5 * (w >>> 16) & 65535) << 16) & 4294967295, w = (w & 65535) + 27492 + (((w >>> 16) + 58964 & 65535) << 16);
    }
    switch (m = 0, f) {
      case 3:
        m ^= (i.charCodeAt(o + 2) & 255) << 16;
      case 2:
        m ^= (i.charCodeAt(o + 1) & 255) << 8;
      case 1:
        m ^= i.charCodeAt(o) & 255, m = 3432918353 * (m & 65535) + ((3432918353 * (m >>> 16) & 65535) << 16) & 4294967295, m = m << 15 | m >>> 17, w ^= 461845907 * (m & 65535) + ((461845907 * (m >>> 16) & 65535) << 16) & 4294967295;
    }
    return w ^= i.length, w ^= w >>> 16, w = 2246822507 * (w & 65535) + ((2246822507 * (w >>> 16) & 65535) << 16) & 4294967295, w ^= w >>> 13, w = 3266489909 * (w & 65535) + ((3266489909 * (w >>> 16) & 65535) << 16) & 4294967295, (w ^ w >>> 16) >>> 0;
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
  ), Pe = /* @__PURE__ */ new Map([
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
  ]), Q = /["'&<>]/;
  function de(i) {
    if (typeof i == "boolean" || typeof i == "number" || typeof i == "bigint")
      return "" + i;
    i = "" + i;
    var o = Q.exec(i);
    if (o) {
      var f = "", g, w = 0;
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
        w !== g && (f += i.slice(w, g)), w = g + 1, f += o;
      }
      i = w !== g ? f + i.slice(w, g) : f;
    }
    return i;
  }
  var Tr = /([A-Z])/g, vl = /^ms-/, he = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function T(i) {
    return he.test("" + i) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : i;
  }
  var Y = fe.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, pe = ce.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Te = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, me = pe.d;
  pe.d = {
    f: me.f,
    r: me.r,
    D: Jl,
    C: sr,
    L: Na,
    m: Wc,
    X: ns,
    S: Er,
    M: ku
  };
  var Ne = [], Se = null, Rt = /(<\/|<)(s)(cript)/gi;
  function Rn(i, o, f, g) {
    return "" + o + (f === "s" ? "\\u0073" : "\\u0053") + g;
  }
  function tt(i, o, f, g, w) {
    return {
      idPrefix: i === void 0 ? "" : i,
      nextFormID: 0,
      streamingFormat: 0,
      bootstrapScriptContent: f,
      bootstrapScripts: g,
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
  function Ct(i, o, f, g) {
    return {
      insertionMode: i,
      selectedValue: o,
      tagScope: f,
      viewTransition: g
    };
  }
  function Ia(i, o, f) {
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
        var w = o[g];
        if (w != null && typeof w != "boolean" && w !== "") {
          if (g.indexOf("--") === 0) {
            var m = de(g);
            w = de(("" + w).trim());
          } else
            m = St.get(g), m === void 0 && (m = de(
              g.replace(Tr, "-$1").toLowerCase().replace(vl, "-ms-")
            ), St.set(g, m)), w = typeof w == "number" ? w === 0 || nt.has(g) ? "" + w : w + "px" : de(("" + w).trim());
          f ? (f = !1, i.push(' style="', m, ":", w)) : i.push(";", m, ":", w);
        }
      }
    f || i.push('"');
  }
  function Xl(i, o, f) {
    f && typeof f != "function" && typeof f != "symbol" && i.push(" ", o, '=""');
  }
  function Xt(i, o, f) {
    typeof f != "function" && typeof f != "symbol" && typeof f != "boolean" && i.push(" ", o, '="', de(f), '"');
  }
  var Ie = de(
    "javascript:throw new Error('React form unexpectedly submitted.')"
  );
  function xr(i, o) {
    this.push('<input type="hidden"'), Pt(i), Xt(this, "name", o), Xt(this, "value", i), this.push("/>");
  }
  function Pt(i) {
    if (typeof i != "string") throw Error(W(480));
  }
  function $r(i, o) {
    if (typeof o.$$FORM_ACTION == "function") {
      var f = i.nextFormID++;
      i = i.idPrefix + f;
      try {
        var g = o.$$FORM_ACTION(i);
        if (g) {
          var w = g.data;
          w?.forEach(Pt);
        }
        return g;
      } catch (m) {
        if (typeof m == "object" && m !== null && typeof m.then == "function")
          throw m;
      }
    }
    return null;
  }
  function Da(i, o, f, g, w, m, P, V) {
    var M = null;
    if (typeof g == "function") {
      var G = $r(o, g);
      G !== null ? (V = G.name, g = G.action || "", w = G.encType, m = G.method, P = G.target, M = G.data) : (i.push(" ", "formAction", '="', Ie, '"'), P = m = w = g = V = null, rc(o, f));
    }
    return V != null && vn(i, "name", V), g != null && vn(i, "formAction", g), w != null && vn(i, "formEncType", w), m != null && vn(i, "formMethod", m), P != null && vn(i, "formTarget", P), M;
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
        f = T("" + f), i.push(" ", o, '="', de(f), '"');
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
        f = T("" + f), i.push(" ", "xlink:href", '="', de(f), '"');
        break;
      case "contentEditable":
      case "spellCheck":
      case "draggable":
      case "value":
      case "autoReverse":
      case "externalResourcesRequired":
      case "focusable":
      case "preserveAlpha":
        typeof f != "function" && typeof f != "symbol" && i.push(" ", o, '="', de(f), '"');
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
        f === !0 ? i.push(" ", o, '=""') : f !== !1 && typeof f != "function" && typeof f != "symbol" && i.push(" ", o, '="', de(f), '"');
        break;
      case "cols":
      case "rows":
      case "size":
      case "span":
        typeof f != "function" && typeof f != "symbol" && !isNaN(f) && 1 <= f && i.push(" ", o, '="', de(f), '"');
        break;
      case "rowSpan":
      case "start":
        typeof f == "function" || typeof f == "symbol" || isNaN(f) || i.push(" ", o, '="', de(f), '"');
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
        if ((!(2 < o.length) || o[0] !== "o" && o[0] !== "O" || o[1] !== "n" && o[1] !== "N") && (o = Pe.get(o) || o, qr(o))) {
          switch (typeof f) {
            case "function":
            case "symbol":
              return;
            case "boolean":
              var g = o.toLowerCase().slice(0, 5);
              if (g !== "data-" && g !== "aria-") return;
          }
          i.push(" ", o, '="', de(f), '"');
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
  function Nn(i) {
    var o = "";
    return fe.Children.forEach(i, function(f) {
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
        var w = o[g];
        if (w != null)
          switch (g) {
            case "children":
            case "dangerouslySetInnerHTML":
              throw Error(W(399, f));
            default:
              vn(i, g, w);
          }
      }
    return i.push("/>"), null;
  }
  function aa(i, o) {
    i.push(L("title"));
    var f = null, g = null, w;
    for (w in o)
      if (rn.call(o, w)) {
        var m = o[w];
        if (m != null)
          switch (w) {
            case "children":
              f = m;
              break;
            case "dangerouslySetInnerHTML":
              g = m;
              break;
            default:
              vn(i, w, m);
          }
      }
    return i.push(">"), o = Array.isArray(f) ? 2 > f.length ? f[0] : null : f, typeof o != "function" && typeof o != "symbol" && o !== null && o !== void 0 && i.push(de("" + o)), rr(i, g, f), i.push(Fe("title")), null;
  }
  function fi(i, o) {
    i.push(L("script"));
    var f = null, g = null, w;
    for (w in o)
      if (rn.call(o, w)) {
        var m = o[w];
        if (m != null)
          switch (w) {
            case "children":
              f = m;
              break;
            case "dangerouslySetInnerHTML":
              g = m;
              break;
            default:
              vn(i, w, m);
          }
      }
    return i.push(">"), rr(i, g, f), typeof f == "string" && i.push(("" + f).replace(Rt, Rn)), i.push(Fe("script")), null;
  }
  function Zl(i, o, f) {
    i.push(L(f));
    var g = f = null, w;
    for (w in o)
      if (rn.call(o, w)) {
        var m = o[w];
        if (m != null)
          switch (w) {
            case "children":
              f = m;
              break;
            case "dangerouslySetInnerHTML":
              g = m;
              break;
            default:
              vn(i, w, m);
          }
      }
    return i.push(">"), rr(i, g, f), f;
  }
  function Vl(i, o, f) {
    i.push(L(f));
    var g = f = null, w;
    for (w in o)
      if (rn.call(o, w)) {
        var m = o[w];
        if (m != null)
          switch (w) {
            case "children":
              f = m;
              break;
            case "dangerouslySetInnerHTML":
              g = m;
              break;
            default:
              vn(i, w, m);
          }
      }
    return i.push(">"), rr(i, g, f), typeof f == "string" ? (i.push(de(f)), null) : f;
  }
  var bl = /^[a-zA-Z][a-zA-Z:_\.\-\d]*$/, R = /* @__PURE__ */ new Map();
  function L(i) {
    var o = R.get(i);
    if (o === void 0) {
      if (!bl.test(i))
        throw Error(W(65, i));
      o = "<" + i, R.set(i, o);
    }
    return o;
  }
  function ne(i, o, f, g, w, m, P, V, M) {
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
          i.push(de(G));
          var De = null;
        } else De = G;
        return De;
      case "g":
      case "p":
      case "li":
        break;
      case "select":
        i.push(L("select"));
        var on = null, Ze = null, He;
        for (He in f)
          if (rn.call(f, He)) {
            var je = f[He];
            if (je != null)
              switch (He) {
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
                    He,
                    je
                  );
              }
          }
        return i.push(">"), rr(i, Ze, on), on;
      case "option":
        var Xe = V.selectedValue;
        i.push(L("option"));
        var at = null, cn = null, pn = null, _n = null, en;
        for (en in f)
          if (rn.call(f, en)) {
            var vt = f[en];
            if (vt != null)
              switch (en) {
                case "children":
                  at = vt;
                  break;
                case "selected":
                  pn = vt;
                  break;
                case "dangerouslySetInnerHTML":
                  _n = vt;
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
          var Sn = cn !== null ? "" + cn : Nn(at);
          if (Me(Xe)) {
            for (var Rr = 0; Rr < Xe.length; Rr++)
              if ("" + Xe[Rr] === Sn) {
                i.push(' selected=""');
                break;
              }
          } else
            "" + Xe === Sn && i.push(' selected=""');
        } else pn && i.push(' selected=""');
        return i.push(">"), rr(i, _n, at), at;
      case "textarea":
        i.push(L("textarea"));
        var In = null, En = null, Pn = null, qe;
        for (qe in f)
          if (rn.call(f, qe)) {
            var An = f[qe];
            if (An != null)
              switch (qe) {
                case "children":
                  Pn = An;
                  break;
                case "value":
                  In = An;
                  break;
                case "defaultValue":
                  En = An;
                  break;
                case "dangerouslySetInnerHTML":
                  throw Error(W(91));
                default:
                  vn(
                    i,
                    qe,
                    An
                  );
              }
          }
        if (In === null && En !== null && (In = En), i.push(">"), Pn != null) {
          if (In != null) throw Error(W(92));
          if (Me(Pn)) {
            if (1 < Pn.length)
              throw Error(W(93));
            In = "" + Pn[0];
          }
          In = "" + Pn;
        }
        return typeof In == "string" && In[0] === `
` && i.push(`
`), In !== null && i.push(de("" + In)), null;
      case "input":
        i.push(L("input"));
        var qt = null, sn = null, pa = null, Zi = null, Cr = null, Pl = null, Al = null, Fl = null, Ei = null, Vi;
        for (Vi in f)
          if (rn.call(f, Vi)) {
            var Qt = f[Vi];
            if (Qt != null)
              switch (Vi) {
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(W(399, "input"));
                case "name":
                  qt = Qt;
                  break;
                case "formAction":
                  sn = Qt;
                  break;
                case "formEncType":
                  pa = Qt;
                  break;
                case "formMethod":
                  Zi = Qt;
                  break;
                case "formTarget":
                  Cr = Qt;
                  break;
                case "defaultChecked":
                  Ei = Qt;
                  break;
                case "defaultValue":
                  Al = Qt;
                  break;
                case "checked":
                  Fl = Qt;
                  break;
                case "value":
                  Pl = Qt;
                  break;
                default:
                  vn(
                    i,
                    Vi,
                    Qt
                  );
              }
          }
        var Ja = Da(
          i,
          g,
          w,
          sn,
          pa,
          Zi,
          Cr,
          qt
        );
        return Fl !== null ? Xl(i, "checked", Fl) : Ei !== null && Xl(i, "checked", Ei), Pl !== null ? vn(i, "value", Pl) : Al !== null && vn(i, "value", Al), i.push("/>"), Ja?.forEach(xr, i), null;
      case "button":
        i.push(L("button"));
        var Ka = null, xc = null, eu = null, Do = null, wa = null, mr = null, Ec = null, kr;
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
                  Do = Rl;
                  break;
                case "formEncType":
                  wa = Rl;
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
        var Qi = Da(
          i,
          g,
          w,
          Do,
          wa,
          mr,
          Ec,
          eu
        );
        if (i.push(">"), Qi?.forEach(xr, i), rr(i, xc, Ka), typeof Ka == "string") {
          i.push(de(Ka));
          var Rc = null;
        } else Rc = Ka;
        return Rc;
      case "form":
        i.push(L("form"));
        var Ji = null, nu = null, Lt = null, Cc = null, Ta = null, Lo = null, ja;
        for (ja in f)
          if (rn.call(f, ja)) {
            var Ot = f[ja];
            if (Ot != null)
              switch (ja) {
                case "children":
                  Ji = Ot;
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
            Ie,
            '"'
          ), Lo = Ta = Cc = Lt = null, rc(g, w));
        }
        if (Lt != null && vn(i, "action", Lt), Cc != null && vn(i, "encType", Cc), Ta != null && vn(i, "method", Ta), Lo != null && vn(i, "target", Lo), i.push(">"), un !== null && (i.push('<input type="hidden"'), Xt(i, "name", un), i.push("/>"), Cl?.forEach(xr, i)), rr(i, nu, Ji), typeof Ji == "string") {
          i.push(de(Ji));
          var No = null;
        } else No = Ji;
        return No;
      case "menuitem":
        i.push(L("menuitem"));
        for (var xa in f)
          if (rn.call(f, xa)) {
            var bt = f[xa];
            if (bt != null)
              switch (xa) {
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(W(400));
                default:
                  vn(
                    i,
                    xa,
                    bt
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
                    de(dr),
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
          i.push(de(Zr));
          var zo = null;
        } else zo = Zr;
        return zo;
      case "title":
        var Sr = V.tagScope & 1, Nu = V.tagScope & 4;
        if (V.insertionMode === 4 || Sr || f.itemProp != null)
          var $a = aa(
            i,
            f
          );
        else
          Nu ? $a = null : (aa(w.hoistableChunks, f), $a = void 0);
        return $a;
      case "link":
        var mc = V.tagScope & 1, tu = V.tagScope & 4, ru = f.rel, Ri = f.href, eo = f.precedence;
        if (V.insertionMode === 4 || mc || f.itemProp != null || typeof ru != "string" || typeof Ri != "string" || Ri === "") {
          ht(i, f);
          var no = null;
        } else if (f.rel === "stylesheet")
          if (typeof eo != "string" || f.disabled != null || f.onLoad || f.onError)
            no = ht(
              i,
              f
            );
          else {
            var Pr = w.styles.get(eo), kc = g.styleResources.hasOwnProperty(Ri) ? g.styleResources[Ri] : void 0;
            if (kc !== null) {
              g.styleResources[Ri] = null, Pr || (Pr = {
                precedence: de(eo),
                rules: [],
                hrefs: [],
                sheets: /* @__PURE__ */ new Map()
              }, w.styles.set(eo, Pr));
              var Sc = {
                state: 0,
                props: Et({}, f, {
                  "data-precedence": f.precedence,
                  precedence: null
                })
              };
              if (kc) {
                kc.length === 2 && Yc(Sc.props, kc);
                var zu = w.preloads.stylesheets.get(Ri);
                zu && 0 < zu.length ? zu.length = 0 : Sc.state = 1;
              }
              Pr.sheets.set(Ri, Sc), P && P.stylesheets.add(Sc);
            } else if (Pr) {
              var Hu = Pr.sheets.get(Ri);
              Hu && P && P.stylesheets.add(Hu);
            }
            M && i.push("<!-- -->"), no = null;
          }
        else
          f.onLoad || f.onError ? no = ht(
            i,
            f
          ) : (M && i.push("<!-- -->"), no = tu ? null : ht(w.hoistableChunks, f));
        return no;
      case "script":
        var lu = V.tagScope & 1, Bu = f.async;
        if (typeof f.src != "string" || !f.src || !Bu || typeof Bu == "function" || typeof Bu == "symbol" || f.onLoad || f.onError || V.insertionMode === 4 || lu || f.itemProp != null)
          var Uu = fi(
            i,
            f
          );
        else {
          var Nt = f.src;
          if (f.type === "module")
            var iu = g.moduleScriptResources, Pc = w.preloads.moduleScripts;
          else
            iu = g.scriptResources, Pc = w.preloads.scripts;
          var Ac = iu.hasOwnProperty(Nt) ? iu[Nt] : void 0;
          if (Ac !== null) {
            iu[Nt] = null;
            var au = f;
            if (Ac) {
              Ac.length === 2 && (au = Et({}, f), Yc(au, Ac));
              var Wu = Pc.get(Nt);
              Wu && (Wu.length = 0);
            }
            var ou = [];
            w.scripts.add(ou), fi(ou, au);
          }
          M && i.push("<!-- -->"), Uu = null;
        }
        return Uu;
      case "style":
        var cu = V.tagScope & 1, Ra = f.precedence, _l = f.href, cs = f.nonce;
        if (V.insertionMode === 4 || cu || f.itemProp != null || typeof Ra != "string" || typeof _l != "string" || _l === "") {
          i.push(L("style"));
          var to = null, Fc = null, ri;
          for (ri in f)
            if (rn.call(f, ri)) {
              var Ho = f[ri];
              if (Ho != null)
                switch (ri) {
                  case "children":
                    to = Ho;
                    break;
                  case "dangerouslySetInnerHTML":
                    Fc = Ho;
                    break;
                  default:
                    vn(
                      i,
                      ri,
                      Ho
                    );
                }
            }
          i.push(">");
          var Ca = Array.isArray(to) ? 2 > to.length ? to[0] : null : to;
          typeof Ca != "function" && typeof Ca != "symbol" && Ca !== null && Ca !== void 0 && i.push(("" + Ca).replace(To, xo)), rr(i, Fc, to), i.push(Fe("style"));
          var Oc = null;
        } else {
          var ma = w.styles.get(Ra);
          if ((g.styleResources.hasOwnProperty(_l) ? g.styleResources[_l] : void 0) !== null) {
            g.styleResources[_l] = null, ma || (ma = {
              precedence: de(Ra),
              rules: [],
              hrefs: [],
              sheets: /* @__PURE__ */ new Map()
            }, w.styles.set(Ra, ma));
            var us = w.nonce.style;
            if (!us || us === cs) {
              ma.hrefs.push(de(_l));
              var ss = ma.rules, li = null, Bo = null, ml;
              for (ml in f)
                if (rn.call(f, ml)) {
                  var ka = f[ml];
                  if (ka != null)
                    switch (ml) {
                      case "children":
                        li = ka;
                        break;
                      case "dangerouslySetInnerHTML":
                        Bo = ka;
                    }
                }
              var ro = Array.isArray(li) ? 2 > li.length ? li[0] : null : li;
              typeof ro != "function" && typeof ro != "symbol" && ro !== null && ro !== void 0 && ss.push(
                ("" + ro).replace(To, xo)
              ), rr(ss, Bo, li);
            }
          }
          ma && P && P.styles.add(ma), M && i.push("<!-- -->"), Oc = void 0;
        }
        return Oc;
      case "meta":
        var Ml = V.tagScope & 1, Yu = V.tagScope & 4;
        if (V.insertionMode === 4 || Ml || f.itemProp != null)
          var fs = el(
            i,
            f,
            "meta"
          );
        else
          M && i.push("<!-- -->"), fs = Yu ? null : typeof f.charSet == "string" ? el(w.charsetChunks, f, "meta") : f.name === "viewport" ? el(w.viewportChunks, f, "meta") : el(w.hoistableChunks, f, "meta");
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
        var p = V.tagScope & 3, C = f.src, k = f.srcSet;
        if (!(f.loading === "lazy" || !C && !k || typeof C != "string" && C != null || typeof k != "string" && k != null || f.fetchPriority === "low" || p) && (typeof C != "string" || C[4] !== ":" || C[0] !== "d" && C[0] !== "D" || C[1] !== "a" && C[1] !== "A" || C[2] !== "t" && C[2] !== "T" || C[3] !== "a" && C[3] !== "A") && (typeof k != "string" || k[4] !== ":" || k[0] !== "d" && k[0] !== "D" || k[1] !== "a" && k[1] !== "A" || k[2] !== "t" && k[2] !== "T" || k[3] !== "a" && k[3] !== "A")) {
          P !== null && V.tagScope & 64 && (P.suspenseyImages = !0);
          var z = typeof f.sizes == "string" ? f.sizes : void 0, O = k ? k + `
` + (z || "") : C, H = w.preloads.images, Z = H.get(O);
          if (Z)
            (f.fetchPriority === "high" || 10 > w.highImagePreloads.size) && (H.delete(O), w.highImagePreloads.add(Z));
          else if (!g.imageResources.hasOwnProperty(O)) {
            g.imageResources[O] = Ne;
            var K = f.crossOrigin, xe = typeof K == "string" ? K === "use-credentials" ? K : "" : void 0, we = w.headers, bn;
            we && 0 < we.remainingCapacity && typeof f.srcSet != "string" && (f.fetchPriority === "high" || 500 > we.highImagePreloads.length) && (bn = rt(C, "image", {
              imageSrcSet: f.srcSet,
              imageSizes: f.sizes,
              crossOrigin: xe,
              integrity: f.integrity,
              nonce: f.nonce,
              type: f.type,
              fetchPriority: f.fetchPriority,
              referrerPolicy: f.refererPolicy
            }), 0 <= (we.remainingCapacity -= bn.length + 2)) ? (w.resets.image[O] = Ne, we.highImagePreloads && (we.highImagePreloads += ", "), we.highImagePreloads += bn) : (Z = [], ht(Z, {
              rel: "preload",
              as: "image",
              href: k ? void 0 : C,
              imageSrcSet: k,
              imageSizes: z,
              crossOrigin: xe,
              integrity: f.integrity,
              type: f.type,
              fetchPriority: f.fetchPriority,
              referrerPolicy: f.referrerPolicy
            }), f.fetchPriority === "high" || 10 > w.highImagePreloads.size ? w.highImagePreloads.add(Z) : (w.bulkPreloads.add(Z), H.set(O, Z)));
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
        if (2 > V.insertionMode) {
          var Ve = m || w.preamble;
          if (Ve.headChunks)
            throw Error(W(545, "`<head>`"));
          m !== null && i.push("<!--head-->"), Ve.headChunks = [];
          var yn = Zl(
            Ve.headChunks,
            f,
            "head"
          );
        } else
          yn = Vl(
            i,
            f,
            "head"
          );
        return yn;
      case "body":
        if (2 > V.insertionMode) {
          var yt = m || w.preamble;
          if (yt.bodyChunks)
            throw Error(W(545, "`<body>`"));
          m !== null && i.push("<!--body-->"), yt.bodyChunks = [];
          var $n = Zl(
            yt.bodyChunks,
            f,
            "body"
          );
        } else
          $n = Vl(
            i,
            f,
            "body"
          );
        return $n;
      case "html":
        if (V.insertionMode === 0) {
          var gr = m || w.preamble;
          if (gr.htmlChunks)
            throw Error(W(545, "`<html>`"));
          m !== null && i.push("<!--html-->"), gr.htmlChunks = [""];
          var ll = Zl(
            gr.htmlChunks,
            f,
            "html"
          );
        } else
          ll = Vl(
            i,
            f,
            "html"
          );
        return ll;
      default:
        if (o.indexOf("-") !== -1) {
          i.push(L(o));
          var Il = null, Qe = null, Ar;
          for (Ar in f)
            if (rn.call(f, Ar)) {
              var _t = f[Ar];
              if (_t != null) {
                var Vr = Ar;
                switch (Ar) {
                  case "children":
                    Il = _t;
                    break;
                  case "dangerouslySetInnerHTML":
                    Qe = _t;
                    break;
                  case "style":
                    Gt(i, _t);
                    break;
                  case "suppressContentEditableWarning":
                  case "suppressHydrationWarning":
                  case "ref":
                    break;
                  case "className":
                    Vr = "class";
                  default:
                    if (qr(Ar) && typeof _t != "function" && typeof _t != "symbol" && _t !== !1) {
                      if (_t === !0) _t = "";
                      else if (typeof _t == "object") continue;
                      i.push(
                        " ",
                        Vr,
                        '="',
                        de(_t),
                        '"'
                      );
                    }
                }
              }
            }
          return i.push(">"), rr(i, Qe, Il), Il;
        }
    }
    return Vl(i, f, o);
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
  function Ql(i, o) {
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
  function yl(i) {
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
      de("_" + o.idPrefix + "R_"),
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
          var w = g.props["data-precedence"], m = g.props, P = T("" + g.props.href);
          P = oa(P), i.push(P), w = "" + w, i.push(","), w = oa(w), i.push(w);
          for (var V in m)
            if (rn.call(m, V) && (w = m[V], w != null))
              switch (V) {
                case "href":
                case "rel":
                case "precedence":
                case "data-precedence":
                  break;
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(W(399, "link"));
                default:
                  zn(
                    i,
                    V,
                    w
                  );
              }
          i.push("]"), f = ",[", g.state = 3;
        }
    }), i.push("]");
  }
  function zn(i, o, f) {
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
  function Jl(i) {
    var o = Dt || null;
    if (o) {
      var f = o.resumableState, g = o.renderState;
      if (typeof i == "string" && i) {
        if (!f.dnsResources.hasOwnProperty(i)) {
          f.dnsResources[i] = null, f = g.headers;
          var w, m;
          (m = f && 0 < f.remainingCapacity) && (m = (w = "<" + ("" + i).replace(
            Gc,
            Eo
          ) + ">; rel=dns-prefetch", 0 <= (f.remainingCapacity -= w.length + 2))), m ? (g.resets.dns[i] = null, f.preconnects && (f.preconnects += ", "), f.preconnects += w) : (w = [], ht(w, { href: i, rel: "dns-prefetch" }), g.preconnects.add(w));
        }
        Io(o);
      }
    } else me.D(i);
  }
  function sr(i, o) {
    var f = Dt || null;
    if (f) {
      var g = f.resumableState, w = f.renderState;
      if (typeof i == "string" && i) {
        var m = o === "use-credentials" ? "credentials" : typeof o == "string" ? "anonymous" : "default";
        if (!g.connectResources[m].hasOwnProperty(i)) {
          g.connectResources[m][i] = null, g = w.headers;
          var P, V;
          if (V = g && 0 < g.remainingCapacity) {
            if (V = "<" + ("" + i).replace(
              Gc,
              Eo
            ) + ">; rel=preconnect", typeof o == "string") {
              var M = ("" + o).replace(
                pl,
                za
              );
              V += '; crossorigin="' + M + '"';
            }
            V = (P = V, 0 <= (g.remainingCapacity -= P.length + 2));
          }
          V ? (w.resets.connect[m][i] = null, g.preconnects && (g.preconnects += ", "), g.preconnects += P) : (m = [], ht(m, {
            rel: "preconnect",
            href: i,
            crossOrigin: o
          }), w.preconnects.add(m));
        }
        Io(f);
      }
    } else me.C(i, o);
  }
  function Na(i, o, f) {
    var g = Dt || null;
    if (g) {
      var w = g.resumableState, m = g.renderState;
      if (o && i) {
        switch (o) {
          case "image":
            if (f)
              var P = f.imageSrcSet, V = f.imageSizes, M = f.fetchPriority;
            var G = P ? P + `
` + (V || "") : i;
            if (w.imageResources.hasOwnProperty(G)) return;
            w.imageResources[G] = Ne, w = m.headers;
            var re;
            w && 0 < w.remainingCapacity && typeof P != "string" && M === "high" && (re = rt(i, o, f), 0 <= (w.remainingCapacity -= re.length + 2)) ? (m.resets.image[G] = Ne, w.highImagePreloads && (w.highImagePreloads += ", "), w.highImagePreloads += re) : (w = [], ht(
              w,
              Et(
                { rel: "preload", href: P ? void 0 : i, as: o },
                f
              )
            ), M === "high" ? m.highImagePreloads.add(w) : (m.bulkPreloads.add(w), m.preloads.images.set(G, w)));
            break;
          case "style":
            if (w.styleResources.hasOwnProperty(i)) return;
            P = [], ht(
              P,
              Et({ rel: "preload", href: i, as: o }, f)
            ), w.styleResources[i] = !f || typeof f.crossOrigin != "string" && typeof f.integrity != "string" ? Ne : [f.crossOrigin, f.integrity], m.preloads.stylesheets.set(i, P), m.bulkPreloads.add(P);
            break;
          case "script":
            if (w.scriptResources.hasOwnProperty(i)) return;
            P = [], m.preloads.scripts.set(i, P), m.bulkPreloads.add(P), ht(
              P,
              Et({ rel: "preload", href: i, as: o }, f)
            ), w.scriptResources[i] = !f || typeof f.crossOrigin != "string" && typeof f.integrity != "string" ? Ne : [f.crossOrigin, f.integrity];
            break;
          default:
            if (w.unknownResources.hasOwnProperty(o)) {
              if (P = w.unknownResources[o], P.hasOwnProperty(i))
                return;
            } else
              P = {}, w.unknownResources[o] = P;
            P[i] = Ne, (w = m.headers) && 0 < w.remainingCapacity && o === "font" && (G = rt(i, o, f), 0 <= (w.remainingCapacity -= G.length + 2)) ? (m.resets.font[i] = Ne, w.fontPreloads && (w.fontPreloads += ", "), w.fontPreloads += G) : (w = [], i = Et({ rel: "preload", href: i, as: o }, f), ht(w, i), o) === "font" ? m.fontPreloads.add(w) : m.bulkPreloads.add(w);
        }
        Io(g);
      }
    } else me.L(i, o, f);
  }
  function Wc(i, o) {
    var f = Dt || null;
    if (f) {
      var g = f.resumableState, w = f.renderState;
      if (i) {
        var m = o && typeof o.as == "string" ? o.as : "script";
        switch (m) {
          case "script":
            if (g.moduleScriptResources.hasOwnProperty(i)) return;
            m = [], g.moduleScriptResources[i] = !o || typeof o.crossOrigin != "string" && typeof o.integrity != "string" ? Ne : [o.crossOrigin, o.integrity], w.preloads.moduleScripts.set(i, m);
            break;
          default:
            if (g.moduleUnknownResources.hasOwnProperty(m)) {
              var P = g.unknownResources[m];
              if (P.hasOwnProperty(i)) return;
            } else
              P = {}, g.moduleUnknownResources[m] = P;
            m = [], P[i] = Ne;
        }
        ht(m, Et({ rel: "modulepreload", href: i }, o)), w.bulkPreloads.add(m), Io(f);
      }
    } else me.m(i, o);
  }
  function Er(i, o, f) {
    var g = Dt || null;
    if (g) {
      var w = g.resumableState, m = g.renderState;
      if (i) {
        o = o || "default";
        var P = m.styles.get(o), V = w.styleResources.hasOwnProperty(i) ? w.styleResources[i] : void 0;
        V !== null && (w.styleResources[i] = null, P || (P = {
          precedence: de(o),
          rules: [],
          hrefs: [],
          sheets: /* @__PURE__ */ new Map()
        }, m.styles.set(o, P)), o = {
          state: 0,
          props: Et(
            { rel: "stylesheet", href: i, "data-precedence": o },
            f
          )
        }, V && (V.length === 2 && Yc(o.props, V), (m = m.preloads.stylesheets.get(i)) && 0 < m.length ? m.length = 0 : o.state = 1), P.sheets.set(i, o), Io(g));
      }
    } else me.S(i, o, f);
  }
  function ns(i, o) {
    var f = Dt || null;
    if (f) {
      var g = f.resumableState, w = f.renderState;
      if (i) {
        var m = g.scriptResources.hasOwnProperty(i) ? g.scriptResources[i] : void 0;
        m !== null && (g.scriptResources[i] = null, o = Et({ src: i, async: !0 }, o), m && (m.length === 2 && Yc(o, m), i = w.preloads.scripts.get(i)) && (i.length = 0), i = [], w.scripts.add(i), fi(i, o), Io(f));
      }
    } else me.X(i, o);
  }
  function ku(i, o) {
    var f = Dt || null;
    if (f) {
      var g = f.resumableState, w = f.renderState;
      if (i) {
        var m = g.moduleScriptResources.hasOwnProperty(
          i
        ) ? g.moduleScriptResources[i] : void 0;
        m !== null && (g.moduleScriptResources[i] = null, o = Et({ src: i, type: "module", async: !0 }, o), m && (m.length === 2 && Yc(o, m), i = w.preloads.moduleScripts.get(i)) && (i.length = 0), i = [], w.scripts.add(i), fi(i, o), Io(f));
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
      pl,
      za
    ), o = "<" + i + '>; rel=preload; as="' + o + '"';
    for (var g in f)
      rn.call(f, g) && (i = f[g], typeof i == "string" && (o += "; " + g.toLowerCase() + '="' + ("" + i).replace(
        pl,
        za
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
  var pl = /["';,\r\n]/g;
  function za(i) {
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
    var f = i.idPrefix, g = [], w = i.bootstrapScriptContent, m = i.bootstrapScripts, P = i.bootstrapModules;
    w !== void 0 && (g.push("<script"), oc(g, i), g.push(
      ">",
      ("" + w).replace(Rt, Rn),
      "<\/script>"
    )), w = f + "P:";
    var V = f + "S:";
    f += "B:";
    var M = /* @__PURE__ */ new Set(), G = /* @__PURE__ */ new Set(), re = /* @__PURE__ */ new Set(), $ = /* @__PURE__ */ new Map(), ve = /* @__PURE__ */ new Set(), De = /* @__PURE__ */ new Set(), on = /* @__PURE__ */ new Set(), Ze = {
      images: /* @__PURE__ */ new Map(),
      stylesheets: /* @__PURE__ */ new Map(),
      scripts: /* @__PURE__ */ new Map(),
      moduleScripts: /* @__PURE__ */ new Map()
    };
    if (m !== void 0)
      for (var He = 0; He < m.length; He++) {
        var je = m[He], Xe, at = void 0, cn = void 0, pn = {
          rel: "preload",
          as: "script",
          fetchPriority: "low",
          nonce: void 0
        };
        typeof je == "string" ? pn.href = Xe = je : (pn.href = Xe = je.src, pn.integrity = cn = typeof je.integrity == "string" ? je.integrity : void 0, pn.crossOrigin = at = typeof je == "string" || je.crossOrigin == null ? void 0 : je.crossOrigin === "use-credentials" ? "use-credentials" : ""), je = i;
        var _n = Xe;
        je.scriptResources[_n] = null, je.moduleScriptResources[_n] = null, je = [], ht(je, pn), ve.add(je), g.push('<script src="', de(Xe), '"'), typeof cn == "string" && g.push(
          ' integrity="',
          de(cn),
          '"'
        ), typeof at == "string" && g.push(
          ' crossorigin="',
          de(at),
          '"'
        ), oc(g, i), g.push(' async=""><\/script>');
      }
    if (P !== void 0)
      for (m = 0; m < P.length; m++)
        pn = P[m], at = Xe = void 0, cn = {
          rel: "modulepreload",
          fetchPriority: "low",
          nonce: void 0
        }, typeof pn == "string" ? cn.href = He = pn : (cn.href = He = pn.src, cn.integrity = at = typeof pn.integrity == "string" ? pn.integrity : void 0, cn.crossOrigin = Xe = typeof pn == "string" || pn.crossOrigin == null ? void 0 : pn.crossOrigin === "use-credentials" ? "use-credentials" : ""), pn = i, je = He, pn.scriptResources[je] = null, pn.moduleScriptResources[je] = null, pn = [], ht(pn, cn), ve.add(pn), g.push(
          '<script type="module" src="',
          de(He),
          '"'
        ), typeof at == "string" && g.push(
          ' integrity="',
          de(at),
          '"'
        ), typeof Xe == "string" && g.push(
          ' crossorigin="',
          de(Xe),
          '"'
        ), oc(g, i), g.push(' async=""><\/script>');
    return {
      placeholderPrefix: w,
      segmentPrefix: V,
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
      preconnects: M,
      fontPreloads: G,
      highImagePreloads: re,
      styles: $,
      bootstrapScripts: ve,
      scripts: De,
      bulkPreloads: on,
      preloads: Ze,
      nonce: { script: void 0, style: void 0 },
      stylesToHoist: !1,
      generateStaticMarkup: o
    };
  }
  function gi(i, o, f, g) {
    return f.generateStaticMarkup ? (i.push(de(o)), !1) : (o === "" ? i = g : (g && i.push("<!-- -->"), i.push(de(o)), i = !0), i);
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
      case ye:
        return "Fragment";
      case Tn:
        return "Profiler";
      case Oe:
        return "StrictMode";
      case A:
        return "Suspense";
      case D:
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
        case Be:
          var o = i.render;
          return i = i.displayName, i || (i = o.displayName || o.name || "", i = i !== "" ? "ForwardRef(" + i + ")" : "ForwardRef"), i;
        case Ae:
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
  function bi(i) {
    var o = i.parent;
    o !== null && bi(o), i.context._currentValue2 = i.value;
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
    o !== i && (o === null ? bi(i) : i === null ? Zc(o) : o.depth === i.depth ? sc(o, i) : o.depth > i.depth ? fc(o, i) : Ur(o, i), mo = i);
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
    var w = 32 - dc(g) - 1;
    g &= ~(1 << w), f += 1;
    var m = 32 - dc(o) + w;
    if (30 < m) {
      var P = w - w % 5;
      return m = (g & (1 << P) - 1).toString(32), g >>= P, w -= P, {
        id: 1 << 32 - dc(o) + w | f << w | g,
        overflow: m + i
      };
    }
    return {
      id: 1 << m | f << w | g,
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
  function Pu(i, o, f) {
    switch (f = i[f], f === void 0 ? i.push(o) : f !== o && (o.then(Kt, Kt), o = f), o.status) {
      case "fulfilled":
        return o.value;
      case "rejected":
        throw o.reason;
      default:
        switch (typeof o.status == "string" ? o.then(Kt, Kt) : (i = o, i.status = "pending", i.then(
          function(g) {
            if (o.status === "pending") {
              var w = o;
              w.status = "fulfilled", w.value = g;
            }
          },
          function(g) {
            if (o.status === "pending") {
              var w = o;
              w.status = "rejected", w.reason = g;
            }
          }
        )), o.status) {
          case "fulfilled":
            return o.value;
          case "rejected":
            throw o.reason;
        }
        throw Di = o, jn;
    }
  }
  var Di = null;
  function jl() {
    if (Di === null) throw Error(W(459));
    var i = Di;
    return Di = null, i;
  }
  function Au(i, o) {
    return i === o && (i !== 0 || 1 / i === 1 / o) || i !== i && o !== o;
  }
  var Li = typeof Object.is == "function" ? Object.is : Au, yi = null, So = null, Ni = null, zi = null, Po = null, $e = null, ql = !1, Mt = !1, pi = 0, Vt = 0, ua = -1, Ha = 0, wi = null, Hi = null, It = 0;
  function Bi() {
    if (yi === null)
      throw Error(W(321));
    return yi;
  }
  function Ui() {
    if (0 < It) throw Error(W(312));
    return { memoizedState: null, queue: null, next: null };
  }
  function Ba() {
    return $e === null ? Po === null ? (ql = !1, Po = $e = Ui()) : (ql = !0, $e = Po) : $e.next === null ? (ql = !1, $e = $e.next = Ui()) : (ql = !0, $e = $e.next), $e;
  }
  function sa() {
    var i = wi;
    return wi = null, i;
  }
  function Ua() {
    zi = Ni = So = yi = null, Mt = !1, Po = null, It = 0, $e = Hi = null;
  }
  function Gr(i, o) {
    return typeof o == "function" ? o(i) : o;
  }
  function Wa(i, o, f) {
    if (yi = Bi(), $e = Ba(), ql) {
      var g = $e.queue;
      if (o = g.dispatch, Hi !== null && (f = Hi.get(g), f !== void 0)) {
        Hi.delete(g), g = $e.memoizedState;
        do
          g = i(g, f.action), f = f.next;
        while (f !== null);
        return $e.memoizedState = g, [g, o];
      }
      return [$e.memoizedState, o];
    }
    return i = i === Gr ? typeof o == "function" ? o() : o : f !== void 0 ? f(o) : o, $e.memoizedState = i, i = $e.queue = { last: null, dispatch: null }, i = i.dispatch = Fu.bind(
      null,
      yi,
      i
    ), [$e.memoizedState, i];
  }
  function $l(i, o) {
    if (yi = Bi(), $e = Ba(), o = o === void 0 ? null : o, $e !== null) {
      var f = $e.memoizedState;
      if (f !== null && o !== null) {
        var g = f[1];
        e: if (g === null) g = !1;
        else {
          for (var w = 0; w < g.length && w < o.length; w++)
            if (!Li(o[w], g[w])) {
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
    if (25 <= It) throw Error(W(301));
    if (i === yi)
      if (Mt = !0, i = { action: f, next: null }, Hi === null && (Hi = /* @__PURE__ */ new Map()), f = Hi.get(o), f === void 0)
        Hi.set(o, i);
      else {
        for (o = f; o.next !== null; ) o = o.next;
        o.next = i;
      }
  }
  function Ou() {
    throw Error(W(440));
  }
  function _u() {
    throw Error(W(394));
  }
  function Ao() {
    throw Error(W(479));
  }
  function Fo(i, o, f) {
    Bi();
    var g = Vt++, w = Ni;
    if (typeof i.$$FORM_ACTION == "function") {
      var m = null, P = zi;
      w = w.formState;
      var V = i.$$IS_SIGNATURE_EQUAL;
      if (w !== null && typeof V == "function") {
        var M = w[1];
        V.call(i, w[2], w[3]) && (m = f !== void 0 ? "p" + f : "k" + Je(
          JSON.stringify([P, null, g]),
          0
        ), M === m && (ua = g, o = w[0]));
      }
      var G = i.bind(null, o);
      return i = function($) {
        G($);
      }, typeof G.$$FORM_ACTION == "function" && (i.$$FORM_ACTION = function($) {
        $ = G.$$FORM_ACTION($), f !== void 0 && (f += "", $.action = f);
        var ve = $.data;
        return ve && (m === null && (m = f !== void 0 ? "p" + f : "k" + Je(
          JSON.stringify([
            P,
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
    var o = Ha;
    return Ha += 1, wi === null && (wi = []), Pu(wi, i, o);
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
      return Bi(), i._currentValue2;
    },
    useMemo: $l,
    useReducer: Wa,
    useRef: function(i) {
      yi = Bi(), $e = Ba();
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
      return Bi(), o !== void 0 ? o : i;
    },
    useTransition: function() {
      return Bi(), [!1, _u];
    },
    useId: function() {
      var i = So.treeContext, o = i.overflow;
      i = i.id, i = (i & ~(1 << 32 - dc(i) - 1)).toString(32) + o;
      var f = fa;
      if (f === null) throw Error(W(404));
      return o = pi++, i = "_" + f.idPrefix + "R_" + i, 0 < o && (i += "H" + o.toString(32)), i + "_";
    },
    useSyncExternalStore: function(i, o, f) {
      if (f === void 0)
        throw Error(W(407));
      return f();
    },
    useOptimistic: function(i) {
      return Bi(), [i, Ao];
    },
    useActionState: Fo,
    useFormState: Fo,
    useHostTransitionStatus: function() {
      return Bi(), Te;
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
  }, Vc, Wi;
  function ha(i) {
    if (Vc === void 0)
      try {
        throw Error();
      } catch (f) {
        var o = f.stack.trim().match(/\n( *(at )?)/);
        Vc = o && o[1] || "", Wi = -1 < f.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < f.stack.indexOf("@") ? "@unknown:0:0" : "";
      }
    return `
` + Vc + i + Wi;
  }
  var _o = !1;
  function ei(i, o) {
    if (!i || _o) return "";
    _o = !0;
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
                } catch (De) {
                  var ve = De;
                }
                Reflect.construct(i, [], $);
              } else {
                try {
                  $.call();
                } catch (De) {
                  ve = De;
                }
                i.call($.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (De) {
                ve = De;
              }
              ($ = i()) && typeof $.catch == "function" && $.catch(function() {
              });
            }
          } catch (De) {
            if (De && ve && typeof De.stack == "string")
              return [De.stack, ve.stack];
          }
          return [null, null];
        }
      };
      g.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
      var w = Object.getOwnPropertyDescriptor(
        g.DetermineComponentFrameRoot,
        "name"
      );
      w && w.configurable && Object.defineProperty(
        g.DetermineComponentFrameRoot,
        "name",
        { value: "DetermineComponentFrameRoot" }
      );
      var m = g.DetermineComponentFrameRoot(), P = m[0], V = m[1];
      if (P && V) {
        var M = P.split(`
`), G = V.split(`
`);
        for (w = g = 0; g < M.length && !M[g].includes("DetermineComponentFrameRoot"); )
          g++;
        for (; w < G.length && !G[w].includes(
          "DetermineComponentFrameRoot"
        ); )
          w++;
        if (g === M.length || w === G.length)
          for (g = M.length - 1, w = G.length - 1; 1 <= g && 0 <= w && M[g] !== G[w]; )
            w--;
        for (; 1 <= g && 0 <= w; g--, w--)
          if (M[g] !== G[w]) {
            if (g !== 1 || w !== 1)
              do
                if (g--, w--, 0 > w || M[g] !== G[w]) {
                  var re = `
` + M[g].replace(" at new ", " at ");
                  return i.displayName && re.includes("<anonymous>") && (re = re.replace("<anonymous>", i.displayName)), re;
                }
              while (1 <= g && 0 <= w);
            break;
          }
      }
    } finally {
      _o = !1, Error.prepareStackTrace = f;
    }
    return (f = i ? i.displayName || i.name : "") ? ha(f) : "";
  }
  function da(i) {
    if (typeof i == "string") return ha(i);
    if (typeof i == "function")
      return i.prototype && i.prototype.isReactComponent ? ei(i, !0) : ei(i, !1);
    if (typeof i == "object" && i !== null) {
      switch (i.$$typeof) {
        case Be:
          return ei(i.render, !1);
        case Ae:
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
      case D:
        return ha("SuspenseList");
      case A:
        return ha("Suspense");
    }
    return "";
  }
  function ga(i, o) {
    return (500 < o.byteSize || !1) && o.contentPreamble === null;
  }
  function Mu(i) {
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
  function Es(i, o, f, g, w, m, P, V, M, G, re) {
    var $ = /* @__PURE__ */ new Set();
    this.destination = null, this.flushScheduled = !1, this.resumableState = i, this.renderState = o, this.rootFormatContext = f, this.progressiveChunkSize = g === void 0 ? 12800 : g, this.status = 10, this.fatalError = null, this.pendingRootTasks = this.allPendingTasks = this.nextSegmentId = 0, this.completedPreambleSegments = this.completedRootSegment = null, this.byteSize = 0, this.abortableTasks = $, this.pingedTasks = [], this.clientRenderedBoundaries = [], this.completedBoundaries = [], this.partialBoundaries = [], this.trackedPostpones = null, this.onError = w === void 0 ? Mu : w, this.onPostpone = G === void 0 ? Kt : G, this.onAllReady = m === void 0 ? Kt : m, this.onShellReady = P === void 0 ? Kt : P, this.onShellError = V === void 0 ? Kt : V, this.onFatalError = M === void 0 ? Kt : M, this.formState = re === void 0 ? null : re;
  }
  function Ya(i, o, f, g, w, m, P, V, M, G, re, $) {
    return o = new Es(
      o,
      f,
      g,
      w,
      m,
      P,
      V,
      M,
      G,
      re,
      $
    ), f = wl(
      o,
      0,
      null,
      g,
      !1,
      !1
    ), f.parentFlushed = !0, i = bc(
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
  var Dt = null;
  function Ti(i, o) {
    i.pingedTasks.push(o), i.pingedTasks.length === 1 && (i.flushScheduled = i.destination !== null, as(i));
  }
  function vc(i, o, f, g, w) {
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
      fallbackPreamble: w,
      trackedContentKeyPath: null,
      trackedFallbackNode: null
    }, o !== null && (o.pendingTasks++, g = o.boundaries, g !== null && (i.allPendingTasks++, f.pendingTasks++, g.push(f)), i = o.inheritedHoistables, i !== null && Ro(f.contentState, i)), f;
  }
  function bc(i, o, f, g, w, m, P, V, M, G, re, $, ve, De, on) {
    i.allPendingTasks++, w === null ? i.pendingRootTasks++ : w.pendingTasks++, De !== null && De.pendingTasks++;
    var Ze = {
      replay: null,
      node: f,
      childIndex: g,
      ping: function() {
        return Ti(i, Ze);
      },
      blockedBoundary: w,
      blockedSegment: m,
      blockedPreamble: P,
      hoistableState: V,
      abortSet: M,
      keyPath: G,
      formatContext: re,
      context: $,
      treeContext: ve,
      row: De,
      componentStack: on,
      thenableState: o
    };
    return M.add(Ze), Ze;
  }
  function Qc(i, o, f, g, w, m, P, V, M, G, re, $, ve, De) {
    i.allPendingTasks++, m === null ? i.pendingRootTasks++ : m.pendingTasks++, ve !== null && ve.pendingTasks++, f.pendingTasks++;
    var on = {
      replay: f,
      node: g,
      childIndex: w,
      ping: function() {
        return Ti(i, on);
      },
      blockedBoundary: m,
      blockedSegment: null,
      blockedPreamble: null,
      hoistableState: P,
      abortSet: V,
      keyPath: M,
      formatContext: G,
      context: re,
      treeContext: $,
      row: ve,
      componentStack: De,
      thenableState: o
    };
    return V.add(on), on;
  }
  function wl(i, o, f, g, w, m) {
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
      lastPushedText: w,
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
          var w = f;
        } catch (m) {
          w = `
Error generating stack: ` + m.message + `
` + m.stack;
        }
        return Object.defineProperty(o, "componentStack", {
          value: w
        }), w;
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
        for (var w = 0; w < g.length; w++) {
          var m = g[w];
          f !== null && Ro(m.contentState, f), Gi(i, m, null, null);
        }
      }
      if (o.pendingTasks--, 0 < o.pendingTasks) break;
      f = o.hoistables, o = o.next;
    }
  }
  function Jc(i, o) {
    var f = o.boundaries;
    if (f !== null && o.pendingTasks === f.length) {
      for (var g = !0, w = 0; w < f.length; w++) {
        var m = f[w];
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
  function jc(i, o, f, g, w) {
    var m = o.keyPath, P = o.treeContext, V = o.row;
    o.keyPath = f, f = g.length;
    var M = null;
    if (o.replay !== null) {
      var G = o.replay.slots;
      if (G !== null && typeof G == "object")
        for (var re = 0; re < f; re++) {
          var $ = w !== "backwards" && w !== "unstable_legacy-backwards" ? re : f - 1 - re, ve = g[$];
          o.row = M = Kc(
            M
          ), o.treeContext = Wr(P, f, $);
          var De = G[$];
          typeof De == "number" ? (wc(i, o, De, ve, $), delete G[$]) : lr(i, o, ve, $), --M.pendingTasks === 0 && lt(i, M);
        }
      else
        for (G = 0; G < f; G++)
          re = w !== "backwards" && w !== "unstable_legacy-backwards" ? G : f - 1 - G, $ = g[re], o.row = M = Kc(M), o.treeContext = Wr(P, f, re), lr(i, o, $, re), --M.pendingTasks === 0 && lt(i, M);
    } else if (w !== "backwards" && w !== "unstable_legacy-backwards")
      for (w = 0; w < f; w++)
        G = g[w], o.row = M = Kc(M), o.treeContext = Wr(
          P,
          f,
          w
        ), lr(i, o, G, w), --M.pendingTasks === 0 && lt(i, M);
    else {
      for (w = o.blockedSegment, G = w.children.length, re = w.chunks.length, $ = f - 1; 0 <= $; $--) {
        ve = g[$], o.row = M = Kc(
          M
        ), o.treeContext = Wr(P, f, $), De = wl(
          i,
          re,
          null,
          o.formatContext,
          $ === 0 ? w.lastPushedText : !0,
          !0
        ), w.children.splice(G, 0, De), o.blockedSegment = De;
        try {
          lr(i, o, ve, $), vi(
            De.chunks,
            i.renderState,
            De.lastPushedText,
            De.textEmbedded
          ), De.status = 1, --M.pendingTasks === 0 && lt(i, M);
        } catch (on) {
          throw De.status = i.status === 12 ? 3 : 4, on;
        }
      }
      o.blockedSegment = w, w.lastPushedText = !1;
    }
    V !== null && M !== null && 0 < M.pendingTasks && (V.pendingTasks++, M.next = V), o.treeContext = P, o.row = V, o.keyPath = m;
  }
  function yc(i, o, f, g, w, m) {
    var P = o.thenableState;
    for (o.thenableState = null, yi = {}, So = o, Ni = i, zi = f, Vt = pi = 0, ua = -1, Ha = 0, wi = P, i = g(w, m); Mt; )
      Mt = !1, Vt = pi = 0, ua = -1, Ha = 0, It += 1, $e = null, i = g(w, m);
    return Ua(), i;
  }
  function Yi(i, o, f, g, w, m, P) {
    var V = !1;
    if (m !== 0 && i.formState !== null) {
      var M = o.blockedSegment;
      if (M !== null) {
        V = !0, M = M.chunks;
        for (var G = 0; G < m; G++)
          G === P ? M.push("<!--F!-->") : M.push("<!--F-->");
      }
    }
    m = o.keyPath, o.keyPath = f, w ? (f = o.treeContext, o.treeContext = Wr(f, 1, 0), lr(i, o, g, -1), o.treeContext = f) : V ? lr(i, o, g, -1) : Xr(i, o, g, -1), o.keyPath = m;
  }
  function pc(i, o, f, g, w, m) {
    if (typeof g == "function")
      if (g.prototype && g.prototype.isReactComponent) {
        var P = w;
        if ("ref" in w) {
          P = {};
          for (var V in w)
            V !== "ref" && (P[V] = w[V]);
        }
        var M = g.defaultProps;
        if (M) {
          P === w && (P = Et({}, P, w));
          for (var G in M)
            P[G] === void 0 && (P[G] = M[G]);
        }
        w = P, P = Zt, M = g.contextType, typeof M == "object" && M !== null && (P = M._currentValue2), P = new g(w, P);
        var re = P.state !== void 0 ? P.state : null;
        if (P.updater = Su, P.props = w, P.state = re, M = { queue: [], replace: !1 }, P._reactInternals = M, m = g.contextType, P.context = typeof m == "object" && m !== null ? m._currentValue2 : Zt, m = g.getDerivedStateFromProps, typeof m == "function" && (m = m(w, re), re = m == null ? re : Et({}, re, m), P.state = re), typeof g.getDerivedStateFromProps != "function" && typeof P.getSnapshotBeforeUpdate != "function" && (typeof P.UNSAFE_componentWillMount == "function" || typeof P.componentWillMount == "function"))
          if (g = P.state, typeof P.componentWillMount == "function" && P.componentWillMount(), typeof P.UNSAFE_componentWillMount == "function" && P.UNSAFE_componentWillMount(), g !== P.state && Su.enqueueReplaceState(
            P,
            P.state,
            null
          ), M.queue !== null && 0 < M.queue.length)
            if (g = M.queue, m = M.replace, M.queue = null, M.replace = !1, m && g.length === 1)
              P.state = g[0];
            else {
              for (M = m ? g[0] : P.state, re = !0, m = m ? 1 : 0; m < g.length; m++)
                G = g[m], G = typeof G == "function" ? G.call(P, M, w, void 0) : G, G != null && (re ? (re = !1, M = Et({}, M, G)) : Et(M, G));
              P.state = M;
            }
          else M.queue = null;
        if (g = P.render(), i.status === 12) throw null;
        w = o.keyPath, o.keyPath = f, Xr(i, o, g, -1), o.keyPath = w;
      } else {
        if (g = yc(i, o, f, g, w, void 0), i.status === 12) throw null;
        Yi(
          i,
          o,
          f,
          g,
          pi !== 0,
          Vt,
          ua
        );
      }
    else if (typeof g == "string")
      if (P = o.blockedSegment, P === null)
        P = w.children, M = o.formatContext, re = o.keyPath, o.formatContext = Ia(M, g, w), o.keyPath = f, lr(i, o, P, -1), o.formatContext = M, o.keyPath = re;
      else {
        if (re = ne(
          P.chunks,
          g,
          w,
          i.resumableState,
          i.renderState,
          o.blockedPreamble,
          o.hoistableState,
          o.formatContext,
          P.lastPushedText
        ), P.lastPushedText = !1, M = o.formatContext, m = o.keyPath, o.keyPath = f, (o.formatContext = Ia(M, g, w)).insertionMode === 3) {
          f = wl(
            i,
            0,
            null,
            o.formatContext,
            !1,
            !1
          ), P.preambleChildren.push(f), o.blockedSegment = f;
          try {
            f.status = 6, lr(i, o, re, -1), vi(
              f.chunks,
              i.renderState,
              f.lastPushedText,
              f.textEmbedded
            ), f.status = 1;
          } finally {
            o.blockedSegment = P;
          }
        } else lr(i, o, re, -1);
        o.formatContext = M, o.keyPath = m;
        e: {
          switch (o = P.chunks, i = i.resumableState, g) {
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
              if (1 >= M.insertionMode) {
                i.hasBody = !0;
                break e;
              }
              break;
            case "html":
              if (M.insertionMode === 0) {
                i.hasHtml = !0;
                break e;
              }
              break;
            case "head":
              if (1 >= M.insertionMode) break e;
          }
          o.push(Fe(g));
        }
        P.lastPushedText = !1;
      }
    else {
      switch (g) {
        case tr:
        case Oe:
        case Tn:
        case ye:
          g = o.keyPath, o.keyPath = f, Xr(i, o, w.children, -1), o.keyPath = g;
          return;
        case ft:
          g = o.blockedSegment, g === null ? w.mode !== "hidden" && (g = o.keyPath, o.keyPath = f, lr(i, o, w.children, -1), o.keyPath = g) : w.mode !== "hidden" && (i.renderState.generateStaticMarkup || g.chunks.push("<!--&-->"), g.lastPushedText = !1, P = o.keyPath, o.keyPath = f, lr(i, o, w.children, -1), o.keyPath = P, i.renderState.generateStaticMarkup || g.chunks.push("<!--/&-->"), g.lastPushedText = !1);
          return;
        case D:
          e: {
            if (g = w.children, w = w.revealOrder, w === "forwards" || w === "backwards" || w === "unstable_legacy-backwards") {
              if (Me(g)) {
                jc(i, o, f, g, w);
                break e;
              }
              if ((P = Jn(g)) && (P = P.call(g))) {
                if (M = P.next(), !M.done) {
                  do
                    M = P.next();
                  while (!M.done);
                  jc(i, o, f, g, w);
                }
                break e;
              }
            }
            w === "together" ? (w = o.keyPath, P = o.row, M = o.row = Kc(null), M.boundaries = [], M.together = !0, o.keyPath = f, Xr(i, o, g, -1), --M.pendingTasks === 0 && lt(i, M), o.keyPath = w, o.row = P, P !== null && 0 < M.pendingTasks && (P.pendingTasks++, M.next = P)) : (w = o.keyPath, o.keyPath = f, Xr(i, o, g, -1), o.keyPath = w);
          }
          return;
        case Gl:
        case X:
          throw Error(W(343));
        case A:
          e: if (o.replay !== null) {
            g = o.keyPath, P = o.formatContext, M = o.row, o.keyPath = f, o.formatContext = xn(
              i.resumableState,
              P
            ), o.row = null, f = w.children;
            try {
              lr(i, o, f, -1);
            } finally {
              o.keyPath = g, o.formatContext = P, o.row = M;
            }
          } else {
            g = o.keyPath, m = o.formatContext;
            var $ = o.row, ve = o.blockedBoundary;
            G = o.blockedPreamble;
            var De = o.hoistableState;
            V = o.blockedSegment;
            var on = w.fallback;
            w = w.children;
            var Ze = /* @__PURE__ */ new Set(), He = vc(
              i,
              o.row,
              Ze,
              null,
              null
            );
            i.trackedPostpones !== null && (He.trackedContentKeyPath = f);
            var je = wl(
              i,
              V.chunks.length,
              He,
              o.formatContext,
              !1,
              !1
            );
            V.children.push(je), V.lastPushedText = !1;
            var Xe = wl(
              i,
              0,
              null,
              o.formatContext,
              !1,
              !1
            );
            if (Xe.parentFlushed = !0, i.trackedPostpones !== null) {
              P = o.componentStack, M = [f[0], "Suspense Fallback", f[2]], re = [M[1], M[2], [], null], i.trackedPostpones.workingMap.set(M, re), He.trackedFallbackNode = re, o.blockedSegment = je, o.blockedPreamble = He.fallbackPreamble, o.keyPath = M, o.formatContext = mt(
                i.resumableState,
                m
              ), o.componentStack = rl(P), je.status = 6;
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
                o.blockedSegment = V, o.blockedPreamble = G, o.keyPath = g, o.formatContext = m;
              }
              o = bc(
                i,
                null,
                w,
                -1,
                He,
                Xe,
                He.contentPreamble,
                He.contentState,
                o.abortSet,
                f,
                xn(
                  i.resumableState,
                  o.formatContext
                ),
                o.context,
                o.treeContext,
                null,
                P
              ), Tl(o), i.pingedTasks.push(o);
            } else {
              o.blockedBoundary = He, o.blockedPreamble = He.contentPreamble, o.hoistableState = He.contentState, o.blockedSegment = Xe, o.keyPath = f, o.formatContext = xn(
                i.resumableState,
                m
              ), o.row = null, Xe.status = 6;
              try {
                if (lr(i, o, w, -1), vi(
                  Xe.chunks,
                  i.renderState,
                  Xe.lastPushedText,
                  Xe.textEmbedded
                ), Xe.status = 1, fr(He, Xe), He.pendingTasks === 0 && He.status === 0) {
                  if (He.status = 1, !ga(i, He)) {
                    $ !== null && --$.pendingTasks === 0 && lt(i, $), i.pendingRootTasks === 0 && o.blockedPreamble && Va(i);
                    break e;
                  }
                } else
                  $ !== null && $.together && Jc(i, $);
              } catch (at) {
                He.status = 4, i.status === 12 ? (Xe.status = 3, P = i.fatalError) : (Xe.status = 4, P = at), M = xl(o.componentStack), re = Gn(
                  i,
                  P,
                  M
                ), He.errorDigest = re, Xa(i, He);
              } finally {
                o.blockedBoundary = ve, o.blockedPreamble = G, o.hoistableState = De, o.blockedSegment = V, o.keyPath = g, o.formatContext = m, o.row = $;
              }
              o = bc(
                i,
                null,
                on,
                -1,
                ve,
                je,
                He.fallbackPreamble,
                He.fallbackState,
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
          case Be:
            if ("ref" in w)
              for (on in P = {}, w)
                on !== "ref" && (P[on] = w[on]);
            else P = w;
            g = yc(
              i,
              o,
              f,
              g.render,
              P,
              m
            ), Yi(
              i,
              o,
              f,
              g,
              pi !== 0,
              Vt,
              ua
            );
            return;
          case Ae:
            pc(i, o, f, g.type, w, m);
            return;
          case ie:
            if (M = w.children, P = o.keyPath, w = w.value, re = g._currentValue2, g._currentValue2 = w, m = mo, mo = g = {
              parent: m,
              depth: m === null ? 0 : m.depth + 1,
              context: g,
              parentValue: re,
              value: w
            }, o.context = g, o.keyPath = f, Xr(i, o, M, -1), i = mo, i === null) throw Error(W(403));
            i.context._currentValue2 = i.parentValue, i = mo = i.parent, o.context = i, o.keyPath = P;
            return;
          case Re:
            w = w.children, g = w(g._context._currentValue2), w = o.keyPath, o.keyPath = f, Xr(i, o, g, -1), o.keyPath = w;
            return;
          case ee:
            if (P = g._init, g = P(g._payload), i.status === 12) throw null;
            pc(i, o, f, g, w, m);
            return;
        }
      throw Error(
        W(130, g == null ? g : typeof g, "")
      );
    }
  }
  function wc(i, o, f, g, w) {
    var m = o.replay, P = o.blockedBoundary, V = wl(
      i,
      0,
      null,
      o.formatContext,
      !1,
      !1
    );
    V.id = f, V.parentFlushed = !0;
    try {
      o.replay = null, o.blockedSegment = V, lr(i, o, g, w), V.status = 1, P === null ? i.completedRootSegment = V : (fr(P, V), P.parentFlushed && i.partialBoundaries.push(P));
    } finally {
      o.replay = m, o.blockedSegment = null;
    }
  }
  function Xr(i, o, f, g) {
    o.replay !== null && typeof o.replay.slots == "number" ? wc(i, o, o.replay.slots, f, g) : (o.node = f, o.childIndex = g, f = o.componentStack, Tl(o), it(i, o), o.componentStack = f);
  }
  function it(i, o) {
    var f = o.node, g = o.childIndex;
    if (f !== null) {
      if (typeof f == "object") {
        switch (f.$$typeof) {
          case ke:
            var w = f.type, m = f.key, P = f.props;
            f = P.ref;
            var V = f !== void 0 ? f : null, M = uc(w), G = m ?? (g === -1 ? 0 : g);
            if (m = [o.keyPath, M, G], o.replay !== null)
              e: {
                var re = o.replay;
                for (g = re.nodes, f = 0; f < g.length; f++) {
                  var $ = g[f];
                  if (G === $[1]) {
                    if ($.length === 4) {
                      if (M !== null && M !== $[0])
                        throw Error(
                          W(490, $[0], M)
                        );
                      var ve = $[2];
                      M = $[3], G = o.node, o.replay = {
                        nodes: ve,
                        slots: M,
                        pendingTasks: 1
                      };
                      try {
                        if (pc(i, o, m, w, P, V), o.replay.pendingTasks === 1 && 0 < o.replay.nodes.length)
                          throw Error(W(488));
                        o.replay.pendingTasks--;
                      } catch (_n) {
                        if (typeof _n == "object" && _n !== null && (_n === jn || typeof _n.then == "function"))
                          throw o.node === G ? o.replay = re : g.splice(f, 1), _n;
                        o.replay.pendingTasks--, P = xl(o.componentStack), m = i, i = o.blockedBoundary, w = _n, P = Gn(m, w, P), ti(
                          m,
                          i,
                          ve,
                          M,
                          w,
                          P
                        );
                      }
                      o.replay = re;
                    } else {
                      if (w !== A)
                        throw Error(
                          W(
                            490,
                            "Suspense",
                            uc(w) || "Unknown"
                          )
                        );
                      n: {
                        re = void 0, w = $[5], V = $[2], M = $[3], G = $[4] === null ? [] : $[4][2], $ = $[4] === null ? null : $[4][3];
                        var De = o.keyPath, on = o.formatContext, Ze = o.row, He = o.replay, je = o.blockedBoundary, Xe = o.hoistableState, at = P.children, cn = P.fallback, pn = /* @__PURE__ */ new Set();
                        P = vc(
                          i,
                          o.row,
                          pn,
                          null,
                          null
                        ), P.parentFlushed = !0, P.rootSegmentID = w, o.blockedBoundary = P, o.hoistableState = P.contentState, o.keyPath = m, o.formatContext = xn(
                          i.resumableState,
                          on
                        ), o.row = null, o.replay = {
                          nodes: V,
                          slots: M,
                          pendingTasks: 1
                        };
                        try {
                          if (lr(i, o, at, -1), o.replay.pendingTasks === 1 && 0 < o.replay.nodes.length)
                            throw Error(W(488));
                          if (o.replay.pendingTasks--, P.pendingTasks === 0 && P.status === 0) {
                            P.status = 1, i.completedBoundaries.push(P);
                            break n;
                          }
                        } catch (_n) {
                          P.status = 4, ve = xl(o.componentStack), re = Gn(
                            i,
                            _n,
                            ve
                          ), P.errorDigest = re, o.replay.pendingTasks--, i.clientRenderedBoundaries.push(P);
                        } finally {
                          o.blockedBoundary = je, o.hoistableState = Xe, o.replay = He, o.keyPath = De, o.formatContext = on, o.row = Ze;
                        }
                        ve = Qc(
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
                          P.fallbackState,
                          pn,
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
            else pc(i, o, m, w, P, V);
            return;
          case nn:
            throw Error(W(257));
          case ee:
            if (ve = f._init, f = ve(f._payload), i.status === 12) throw null;
            Xr(i, o, f, g);
            return;
        }
        if (Me(f)) {
          kn(i, o, f, g);
          return;
        }
        if ((ve = Jn(f)) && (ve = ve.call(f))) {
          if (f = ve.next(), !f.done) {
            P = [];
            do
              P.push(f.value), f = ve.next();
            while (!f.done);
            kn(i, o, P, g);
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
    var w = o.keyPath;
    if (g !== -1 && (o.keyPath = [o.keyPath, "Fragment", g], o.replay !== null)) {
      for (var m = o.replay, P = m.nodes, V = 0; V < P.length; V++) {
        var M = P[V];
        if (M[1] === g) {
          g = M[2], M = M[3], o.replay = { nodes: g, slots: M, pendingTasks: 1 };
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
              M,
              re,
              f
            );
          }
          o.replay = m, P.splice(V, 1);
          break;
        }
      }
      o.keyPath = w;
      return;
    }
    if (m = o.treeContext, P = f.length, o.replay !== null && (V = o.replay.slots, V !== null && typeof V == "object")) {
      for (g = 0; g < P; g++)
        M = f[g], o.treeContext = Wr(m, P, g), G = V[g], typeof G == "number" ? (wc(i, o, G, M, g), delete V[g]) : lr(i, o, M, g);
      o.treeContext = m, o.keyPath = w;
      return;
    }
    for (V = 0; V < P; V++)
      g = f[V], o.treeContext = Wr(m, P, V), lr(i, o, g, V);
    o.treeContext = m, o.keyPath = w;
  }
  function va(i, o, f) {
    if (f.status = 5, f.rootSegmentID = i.nextSegmentId++, i = f.trackedContentKeyPath, i === null) throw Error(W(486));
    var g = f.trackedFallbackNode, w = [], m = o.workingMap.get(i);
    return m === void 0 ? (f = [
      i[1],
      i[2],
      w,
      null,
      g,
      f.rootSegmentID
    ], o.workingMap.set(i, f), gt(f, i[0], o), f) : (m[4] = g, m[5] = f.rootSegmentID, m);
  }
  function Ga(i, o, f, g) {
    g.status = 5;
    var w = f.keyPath, m = f.blockedBoundary;
    if (m === null)
      g.id = i.nextSegmentId++, o.rootSlots = g.id, i.completedRootSegment !== null && (i.completedRootSegment.status = 5);
    else {
      if (m !== null && m.status === 0) {
        var P = va(
          i,
          o,
          m
        );
        if (m.trackedContentKeyPath === w && f.childIndex === -1) {
          g.id === -1 && (g.id = g.parentFlushed ? m.rootSegmentID : i.nextSegmentId++), P[3] = g.id;
          return;
        }
      }
      if (g.id === -1 && (g.id = g.parentFlushed && m !== null ? m.rootSegmentID : i.nextSegmentId++), f.childIndex === -1)
        w === null ? o.rootSlots = g.id : (f = o.workingMap.get(w), f === void 0 ? (f = [w[1], w[2], [], g.id], gt(f, w[0], o)) : f[3] = g.id);
      else {
        if (w === null) {
          if (i = o.rootSlots, i === null)
            i = o.rootSlots = {};
          else if (typeof i == "number")
            throw Error(W(491));
        } else if (m = o.workingMap, P = m.get(w), P === void 0)
          i = {}, P = [w[1], w[2], [], i], m.set(w, P), gt(P, w[0], o);
        else if (i = P[3], i === null)
          i = P[3] = {};
        else if (typeof i == "number")
          throw Error(W(491));
        i[f.childIndex] = g.id;
      }
    }
  }
  function Xa(i, o) {
    i = i.trackedPostpones, i !== null && (o = o.trackedContentKeyPath, o !== null && (o = i.workingMap.get(o), o !== void 0 && (o.length = 4, o[2] = [], o[3] = null)));
  }
  function ba(i, o, f) {
    return Qc(
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
  function Iu(i, o, f) {
    var g = o.blockedSegment, w = wl(
      i,
      g.chunks.length,
      null,
      o.formatContext,
      g.lastPushedText,
      !0
    );
    return g.children.push(w), g.lastPushedText = !1, bc(
      i,
      f,
      o.node,
      o.childIndex,
      o.blockedBoundary,
      w,
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
    var w = o.formatContext, m = o.context, P = o.keyPath, V = o.treeContext, M = o.componentStack, G = o.blockedSegment;
    if (G === null) {
      G = o.replay;
      try {
        return Xr(i, o, f, g);
      } catch (ve) {
        if (Ua(), f = ve === jn ? jl() : ve, i.status !== 12 && typeof f == "object" && f !== null) {
          if (typeof f.then == "function") {
            g = ve === jn ? sa() : null, i = ba(i, o, g).ping, f.then(i, i), o.formatContext = w, o.context = m, o.keyPath = P, o.treeContext = V, o.componentStack = M, o.replay = G, Kl(m);
            return;
          }
          if (f.message === "Maximum call stack size exceeded") {
            f = ve === jn ? sa() : null, f = ba(i, o, f), i.pingedTasks.push(f), o.formatContext = w, o.context = m, o.keyPath = P, o.treeContext = V, o.componentStack = M, o.replay = G, Kl(m);
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
            G = f, f = ve === jn ? sa() : null, i = Iu(i, o, f).ping, G.then(i, i), o.formatContext = w, o.context = m, o.keyPath = P, o.treeContext = V, o.componentStack = M, Kl(m);
            return;
          }
          if (f.message === "Maximum call stack size exceeded") {
            G = ve === jn ? sa() : null, G = Iu(i, o, G), i.pingedTasks.push(G), o.formatContext = w, o.context = m, o.keyPath = P, o.treeContext = V, o.componentStack = M, Kl(m);
            return;
          }
        }
      }
    }
    throw o.formatContext = w, o.context = m, o.keyPath = P, o.treeContext = V, Kl(m), f;
  }
  function Rs(i) {
    var o = i.blockedBoundary, f = i.blockedSegment;
    f !== null && (f.status = 3, Gi(this, o, i.row, f));
  }
  function ti(i, o, f, g, w, m) {
    for (var P = 0; P < f.length; P++) {
      var V = f[P];
      if (V.length === 4)
        ti(
          i,
          o,
          V[2],
          V[3],
          w,
          m
        );
      else {
        V = V[5];
        var M = i, G = m, re = vc(
          M,
          null,
          /* @__PURE__ */ new Set(),
          null,
          null
        );
        re.parentFlushed = !0, re.rootSegmentID = V, re.status = 4, re.errorDigest = G, re.parentFlushed && M.clientRenderedBoundaries.push(re);
      }
    }
    if (f.length = 0, g !== null) {
      if (o === null) throw Error(W(487));
      if (o.status !== 4 && (o.status = 4, o.errorDigest = m, o.parentFlushed && i.clientRenderedBoundaries.push(o)), typeof g == "object") for (var $ in g) delete g[$];
    }
  }
  function is(i, o, f) {
    var g = i.blockedBoundary, w = i.blockedSegment;
    if (w !== null) {
      if (w.status === 6) return;
      w.status = 3;
    }
    var m = xl(i.componentStack);
    if (g === null) {
      if (o.status !== 13 && o.status !== 14) {
        if (g = i.replay, g === null) {
          o.trackedPostpones !== null && w !== null ? (g = o.trackedPostpones, Gn(o, f, m), Ga(o, g, i, w), Gi(o, null, i.row, w)) : (Gn(o, f, m), El(o, f));
          return;
        }
        g.pendingTasks--, g.pendingTasks === 0 && 0 < g.nodes.length && (w = Gn(o, f, m), ti(
          o,
          null,
          g.nodes,
          g.slots,
          f,
          w
        )), o.pendingRootTasks--, o.pendingRootTasks === 0 && xi(o);
      }
    } else {
      var P = o.trackedPostpones;
      if (g.status !== 4) {
        if (P !== null && w !== null)
          return Gn(o, f, m), Ga(o, P, i, w), g.fallbackAbortableTasks.forEach(function(V) {
            return is(V, o, f);
          }), g.fallbackAbortableTasks.clear(), Gi(o, g, i.row, w);
        g.status = 4, w = Gn(o, f, m), g.status = 4, g.errorDigest = w, Xa(o, g), g.parentFlushed && o.clientRenderedBoundaries.push(g);
      }
      g.pendingTasks--, w = g.row, w !== null && --w.pendingTasks === 0 && lt(o, w), g.fallbackAbortableTasks.forEach(function(V) {
        return is(V, o, f);
      }), g.fallbackAbortableTasks.clear();
    }
    i = i.row, i !== null && --i.pendingTasks === 0 && lt(o, i), o.allPendingTasks--, o.allPendingTasks === 0 && Tc(o);
  }
  function Du(i, o) {
    try {
      var f = i.renderState, g = f.onHeaders;
      if (g) {
        var w = f.headers;
        if (w) {
          f.headers = null;
          var m = w.preconnects;
          if (w.fontPreloads && (m && (m += ", "), m += w.fontPreloads), w.highImagePreloads && (m && (m += ", "), m += w.highImagePreloads), !o) {
            var P = f.styles.values(), V = P.next();
            e: for (; 0 < w.remainingCapacity && !V.done; V = P.next())
              for (var M = V.value.sheets.values(), G = M.next(); 0 < w.remainingCapacity && !G.done; G = M.next()) {
                var re = G.value, $ = re.props, ve = $.href, De = re.props, on = rt(De.href, "style", {
                  crossOrigin: De.crossOrigin,
                  integrity: De.integrity,
                  nonce: De.nonce,
                  type: De.type,
                  fetchPriority: De.fetchPriority,
                  referrerPolicy: De.referrerPolicy,
                  media: De.media
                });
                if (0 <= (w.remainingCapacity -= on.length + 2))
                  f.resets.style[ve] = Ne, m && (m += ", "), m += on, f.resets.style[ve] = typeof $.crossOrigin == "string" || typeof $.integrity == "string" ? [$.crossOrigin, $.integrity] : Ne;
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
    i.trackedPostpones === null && Du(i, !0), i.trackedPostpones === null && Va(i), i.onShellError = Kt, i = i.onShellReady, i();
  }
  function Tc(i) {
    Du(
      i,
      i.trackedPostpones === null ? !0 : i.completedRootSegment === null || i.completedRootSegment.status !== 5
    ), Va(i), i = i.onAllReady, i();
  }
  function fr(i, o) {
    if (o.chunks.length === 0 && o.children.length === 1 && o.children[0].boundary === null && o.children[0].id === -1) {
      var f = o.children[0];
      f.id = o.id, f.parentFlushed = !0, f.status !== 1 && f.status !== 3 && f.status !== 4 || fr(i, f);
    } else i.completedSegments.push(o);
  }
  function Gi(i, o, f, g) {
    if (f !== null && (--f.pendingTasks === 0 ? lt(i, f) : f.together && Jc(i, f)), i.allPendingTasks--, o === null) {
      if (g !== null && g.parentFlushed) {
        if (i.completedRootSegment !== null)
          throw Error(W(389));
        i.completedRootSegment = g;
      }
      i.pendingRootTasks--, i.pendingRootTasks === 0 && xi(i);
    } else if (o.pendingTasks--, o.status !== 4)
      if (o.pendingTasks === 0) {
        if (o.status === 0 && (o.status = 1), g !== null && g.parentFlushed && (g.status === 1 || g.status === 3) && fr(o, g), o.parentFlushed && i.completedBoundaries.push(o), o.status === 1)
          f = o.row, f !== null && Ro(f.hoistables, o.contentState), ga(i, o) || (o.fallbackAbortableTasks.forEach(Rs, i), o.fallbackAbortableTasks.clear(), f !== null && --f.pendingTasks === 0 && lt(i, f)), i.pendingRootTasks === 0 && i.trackedPostpones === null && o.contentPreamble !== null && Va(i);
        else if (o.status === 5 && (o = o.row, o !== null)) {
          if (i.trackedPostpones !== null) {
            f = i.trackedPostpones;
            var w = o.next;
            if (w !== null && (g = w.boundaries, g !== null))
              for (w.boundaries = null, w = 0; w < g.length; w++) {
                var m = g[w];
                va(i, f, m), Gi(i, m, null, null);
              }
          }
          --o.pendingTasks === 0 && lt(i, o);
        }
      } else
        g === null || !g.parentFlushed || g.status !== 1 && g.status !== 3 || (fr(o, g), o.completedSegments.length === 1 && o.parentFlushed && i.partialBoundaries.push(o)), o = o.row, o !== null && o.together && Jc(i, o);
    i.allPendingTasks === 0 && Tc(i);
  }
  function as(i) {
    if (i.status !== 14 && i.status !== 13) {
      var o = mo, f = Y.H;
      Y.H = ls;
      var g = Y.A;
      Y.A = gc;
      var w = Dt;
      Dt = i;
      var m = fa;
      fa = i.resumableState;
      try {
        var P = i.pingedTasks, V;
        for (V = 0; V < P.length; V++) {
          var M = P[V], G = i, re = M.blockedSegment;
          if (re === null) {
            var $ = G;
            if (M.replay.pendingTasks !== 0) {
              Kl(M.context);
              try {
                if (typeof M.replay.slots == "number" ? wc(
                  $,
                  M,
                  M.replay.slots,
                  M.node,
                  M.childIndex
                ) : it($, M), M.replay.pendingTasks === 1 && 0 < M.replay.nodes.length)
                  throw Error(W(488));
                M.replay.pendingTasks--, M.abortSet.delete(M), Gi(
                  $,
                  M.blockedBoundary,
                  M.row,
                  null
                );
              } catch (qe) {
                Ua();
                var ve = qe === jn ? jl() : qe;
                if (typeof ve == "object" && ve !== null && typeof ve.then == "function") {
                  var De = M.ping;
                  ve.then(De, De), M.thenableState = qe === jn ? sa() : null;
                } else {
                  M.replay.pendingTasks--, M.abortSet.delete(M);
                  var on = xl(M.componentStack);
                  G = void 0;
                  var Ze = $, He = M.blockedBoundary, je = $.status === 12 ? $.fatalError : ve, Xe = M.replay.nodes, at = M.replay.slots;
                  G = Gn(
                    Ze,
                    je,
                    on
                  ), ti(
                    Ze,
                    He,
                    Xe,
                    at,
                    je,
                    G
                  ), $.pendingRootTasks--, $.pendingRootTasks === 0 && xi($), $.allPendingTasks--, $.allPendingTasks === 0 && Tc($);
                }
              }
            }
          } else if ($ = void 0, Ze = re, Ze.status === 0) {
            Ze.status = 6, Kl(M.context);
            var cn = Ze.children.length, pn = Ze.chunks.length;
            try {
              it(G, M), vi(
                Ze.chunks,
                G.renderState,
                Ze.lastPushedText,
                Ze.textEmbedded
              ), M.abortSet.delete(M), Ze.status = 1, Gi(
                G,
                M.blockedBoundary,
                M.row,
                Ze
              );
            } catch (qe) {
              Ua(), Ze.children.length = cn, Ze.chunks.length = pn;
              var _n = qe === jn ? jl() : G.status === 12 ? G.fatalError : qe;
              if (G.status === 12 && G.trackedPostpones !== null) {
                var en = G.trackedPostpones, vt = xl(M.componentStack);
                M.abortSet.delete(M), Gn(G, _n, vt), Ga(G, en, M, Ze), Gi(
                  G,
                  M.blockedBoundary,
                  M.row,
                  Ze
                );
              } else if (typeof _n == "object" && _n !== null && typeof _n.then == "function") {
                Ze.status = 0, M.thenableState = qe === jn ? sa() : null;
                var Sn = M.ping;
                _n.then(Sn, Sn);
              } else {
                var Rr = xl(M.componentStack);
                M.abortSet.delete(M), Ze.status = 4;
                var In = M.blockedBoundary, En = M.row;
                if (En !== null && --En.pendingTasks === 0 && lt(G, En), G.allPendingTasks--, $ = Gn(
                  G,
                  _n,
                  Rr
                ), In === null) El(G, _n);
                else if (In.pendingTasks--, In.status !== 4) {
                  In.status = 4, In.errorDigest = $, Xa(G, In);
                  var Pn = In.row;
                  Pn !== null && --Pn.pendingTasks === 0 && lt(G, Pn), In.parentFlushed && G.clientRenderedBoundaries.push(In), G.pendingRootTasks === 0 && G.trackedPostpones === null && In.contentPreamble !== null && Va(G);
                }
                G.allPendingTasks === 0 && Tc(G);
              }
            }
          }
        }
        P.splice(0, V), i.destination !== null && $c(i, i.destination);
      } catch (qe) {
        Gn(i, qe, {}), El(i, qe);
      } finally {
        fa = m, Y.H = f, Y.A = g, f === ls && Kl(o), Dt = w;
      }
    }
  }
  function Za(i, o, f) {
    o.preambleChildren.length && f.push(o.preambleChildren);
    for (var g = !1, w = 0; w < o.children.length; w++)
      g = qc(
        i,
        o.children[w],
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
    var w = g.contentPreamble, m = g.fallbackPreamble;
    if (w === null || m === null) return !1;
    switch (g.status) {
      case 1:
        if (ln(i.renderState, w), i.byteSize += g.byteSize, o = g.completedSegments[0], !o) throw Error(W(391));
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
  function Va(i) {
    if (i.completedRootSegment && i.completedPreambleSegments === null) {
      var o = [], f = i.byteSize, g = qc(
        i,
        i.completedRootSegment,
        o
      ), w = i.renderState.preamble;
      g === !1 || w.headChunks && w.bodyChunks ? i.completedPreambleSegments = o : i.byteSize = f;
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
        var w = !0, m = f.chunks, P = 0;
        f = f.children;
        for (var V = 0; V < f.length; V++) {
          for (w = f[V]; P < w.index; P++)
            o.push(m[P]);
          w = ya(i, o, w, g);
        }
        for (; P < m.length - 1; P++)
          o.push(m[P]);
        return P < m.length && (w = o.push(m[P])), w;
      case 3:
        return !0;
      default:
        throw Error(W(390));
    }
  }
  var ir = 0;
  function ya(i, o, f, g) {
    var w = f.boundary;
    if (w === null)
      return hr(i, o, f, g);
    if (w.parentFlushed = !0, w.status === 4) {
      var m = w.row;
      return m !== null && --m.pendingTasks === 0 && lt(i, m), i.renderState.generateStaticMarkup || (w = w.errorDigest, o.push("<!--$!-->"), o.push("<template"), w && (o.push(' data-dgst="'), w = de(w), o.push(w), o.push('"')), o.push("></template>")), hr(i, o, f, g), i = i.renderState.generateStaticMarkup ? !0 : o.push("<!--/$-->"), i;
    }
    if (w.status !== 1)
      return w.status === 0 && (w.rootSegmentID = i.nextSegmentId++), 0 < w.completedSegments.length && i.partialBoundaries.push(w), an(
        o,
        i.renderState,
        w.rootSegmentID
      ), g && Ro(g, w.fallbackState), hr(i, o, f, g), o.push("<!--/$-->");
    if (!Mo && ga(i, w) && ir + w.byteSize > i.progressiveChunkSize)
      return w.rootSegmentID = i.nextSegmentId++, i.completedBoundaries.push(w), an(
        o,
        i.renderState,
        w.rootSegmentID
      ), hr(i, o, f, g), o.push("<!--/$-->");
    if (ir += w.byteSize, g && Ro(g, w.contentState), f = w.row, f !== null && ga(i, w) && --f.pendingTasks === 0 && lt(i, f), i.renderState.generateStaticMarkup || o.push("<!--$-->"), f = w.completedSegments, f.length !== 1) throw Error(W(391));
    return ya(i, o, f[0], g), i = i.renderState.generateStaticMarkup ? !0 : o.push("<!--/$-->"), i;
  }
  function qn(i, o, f, g) {
    return We(
      o,
      i.renderState,
      f.parentFormatContext,
      f.id
    ), ya(i, o, f, g), Ql(o, f.parentFormatContext);
  }
  function Hn(i, o, f) {
    ir = f.byteSize;
    for (var g = f.completedSegments, w = 0; w < g.length; w++)
      Qa(
        i,
        o,
        f,
        g[w]
      );
    g.length = 0, g = f.row, g !== null && ga(i, f) && --g.pendingTasks === 0 && lt(i, g), lc(
      o,
      f.contentState,
      i.renderState
    ), g = i.resumableState, i = i.renderState, w = f.rootSegmentID, f = f.contentState;
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
    )), o.push('$RC("')), g = w.toString(16), o.push(i.boundaryPrefix), o.push(g), o.push('","'), o.push(i.segmentPrefix), o.push(g), m ? (o.push('",'), di(o, f)) : o.push('"'), f = o.push(")<\/script>"), Ke(o, i) && f;
  }
  function Qa(i, o, f, g) {
    if (g.status === 2) return !0;
    var w = f.contentState, m = g.id;
    if (m === -1) {
      if ((g.id = f.rootSegmentID) === -1)
        throw Error(W(392));
      return qn(i, o, g, w);
    }
    return m === f.rootSegmentID ? qn(i, o, g, w) : (qn(i, o, g, w), f = i.resumableState, i = i.renderState, o.push(i.startInlineScript), o.push(">"), (f.instructions & 1) === 0 ? (f.instructions |= 1, o.push(
      '$RS=function(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};$RS("'
    )) : o.push('$RS("'), o.push(i.segmentPrefix), m = m.toString(16), o.push(m), o.push('","'), o.push(i.placeholderPrefix), o.push(m), o = o.push('")<\/script>'), o);
  }
  var Mo = !1;
  function $c(i, o) {
    try {
      if (!(0 < i.pendingRootTasks)) {
        var f, g = i.completedRootSegment;
        if (g !== null) {
          if (g.status === 5) return;
          var w = i.completedPreambleSegments;
          if (w === null) return;
          ir = i.byteSize;
          var m = i.resumableState, P = i.renderState, V = P.preamble, M = V.htmlChunks, G = V.headChunks, re;
          if (M) {
            for (re = 0; re < M.length; re++)
              o.push(M[re]);
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
          var ve = P.charsetChunks;
          for (re = 0; re < ve.length; re++)
            o.push(ve[re]);
          ve.length = 0, P.preconnects.forEach(yl, o), P.preconnects.clear();
          var De = P.viewportChunks;
          for (re = 0; re < De.length; re++)
            o.push(De[re]);
          De.length = 0, P.fontPreloads.forEach(yl, o), P.fontPreloads.clear(), P.highImagePreloads.forEach(yl, o), P.highImagePreloads.clear(), Se = P, P.styles.forEach(dn, o), Se = null;
          var on = P.importMapChunks;
          for (re = 0; re < on.length; re++)
            o.push(on[re]);
          on.length = 0, P.bootstrapScripts.forEach(yl, o), P.scripts.forEach(yl, o), P.scripts.clear(), P.bulkPreloads.forEach(yl, o), P.bulkPreloads.clear(), m.instructions |= 32;
          var Ze = P.hoistableChunks;
          for (re = 0; re < Ze.length; re++)
            o.push(Ze[re]);
          for (m = Ze.length = 0; m < w.length; m++) {
            var He = w[m];
            for (P = 0; P < He.length; P++)
              ya(i, o, He[P], null);
          }
          var je = i.renderState.preamble, Xe = je.headChunks;
          if (je.htmlChunks || Xe) {
            var at = Fe("head");
            o.push(at);
          }
          var cn = je.bodyChunks;
          if (cn)
            for (w = 0; w < cn.length; w++)
              o.push(cn[w]);
          ya(i, o, g, null), i.completedRootSegment = null;
          var pn = i.renderState;
          if (i.allPendingTasks !== 0 || i.clientRenderedBoundaries.length !== 0 || i.completedBoundaries.length !== 0 || i.trackedPostpones !== null && (i.trackedPostpones.rootNodes.length !== 0 || i.trackedPostpones.rootSlots !== null)) {
            var _n = i.resumableState;
            if ((_n.instructions & 64) === 0) {
              if (_n.instructions |= 64, o.push(pn.startInlineScript), (_n.instructions & 32) === 0) {
                _n.instructions |= 32;
                var en = "_" + _n.idPrefix + "R_";
                o.push(' id="');
                var vt = de(en);
                o.push(vt), o.push('"');
              }
              o.push(">"), o.push(
                "requestAnimationFrame(function(){$RT=performance.now()});"
              ), o.push("<\/script>");
            }
          }
          Ke(o, pn);
        }
        var Sn = i.renderState;
        g = 0;
        var Rr = Sn.viewportChunks;
        for (g = 0; g < Rr.length; g++)
          o.push(Rr[g]);
        Rr.length = 0, Sn.preconnects.forEach(yl, o), Sn.preconnects.clear(), Sn.fontPreloads.forEach(yl, o), Sn.fontPreloads.clear(), Sn.highImagePreloads.forEach(
          yl,
          o
        ), Sn.highImagePreloads.clear(), Sn.styles.forEach(ac, o), Sn.scripts.forEach(yl, o), Sn.scripts.clear(), Sn.bulkPreloads.forEach(yl, o), Sn.bulkPreloads.clear();
        var In = Sn.hoistableChunks;
        for (g = 0; g < In.length; g++)
          o.push(In[g]);
        In.length = 0;
        var En = i.clientRenderedBoundaries;
        for (f = 0; f < En.length; f++) {
          var Pn = En[f];
          Sn = o;
          var qe = i.resumableState, An = i.renderState, qt = Pn.rootSegmentID, sn = Pn.errorDigest;
          Sn.push(An.startInlineScript), Sn.push(">"), (qe.instructions & 4) === 0 ? (qe.instructions |= 4, Sn.push(
            '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};;$RX("'
          )) : Sn.push('$RX("'), Sn.push(An.boundaryPrefix);
          var pa = qt.toString(16);
          if (Sn.push(pa), Sn.push('"'), sn) {
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
        var Pl = i.completedBoundaries;
        for (f = 0; f < Pl.length; f++)
          if (!Hn(i, o, Pl[f])) {
            i.destination = null, f++, Pl.splice(0, f);
            return;
          }
        Pl.splice(0, f), Mo = !0;
        var Al = i.partialBoundaries;
        for (f = 0; f < Al.length; f++) {
          var Fl = Al[f];
          e: {
            En = i, Pn = o, ir = Fl.byteSize;
            var Ei = Fl.completedSegments;
            for (Cr = 0; Cr < Ei.length; Cr++)
              if (!Qa(
                En,
                Pn,
                Fl,
                Ei[Cr]
              )) {
                Cr++, Ei.splice(0, Cr);
                var Vi = !1;
                break e;
              }
            Ei.splice(0, Cr);
            var Qt = Fl.row;
            Qt !== null && Qt.together && Fl.pendingTasks === 1 && (Qt.pendingTasks === 1 ? ni(
              En,
              Qt,
              Qt.hoistables
            ) : Qt.pendingTasks--), Vi = lc(
              Pn,
              Fl.contentState,
              En.renderState
            );
          }
          if (!Vi) {
            i.destination = null, f++, Al.splice(0, f);
            return;
          }
        }
        Al.splice(0, f), Mo = !1;
        var Ja = i.completedBoundaries;
        for (f = 0; f < Ja.length; f++)
          if (!Hn(i, o, Ja[f])) {
            i.destination = null, f++, Ja.splice(0, f);
            return;
          }
        Ja.splice(0, f);
      }
    } finally {
      Mo = !1, i.allPendingTasks === 0 && i.clientRenderedBoundaries.length === 0 && i.completedBoundaries.length === 0 && (i.flushScheduled = !1, f = i.resumableState, f.hasBody && (Al = Fe("body"), o.push(Al)), f.hasHtml && (f = Fe("html"), o.push(f)), i.status = 14, o.push(null), i.destination = null);
    }
  }
  function Io(i) {
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
        i.fatalError = g, f.forEach(function(w) {
          return is(w, i, g);
        }), f.clear();
      }
      i.destination !== null && $c(i, i.destination);
    } catch (w) {
      Gn(i, w, {}), El(i, w);
    }
  }
  function gt(i, o, f) {
    if (o === null) f.rootNodes.push(i);
    else {
      var g = f.workingMap, w = g.get(o);
      w === void 0 && (w = [o[1], o[2], [], null], g.set(o, w), gt(w, o[0], f)), w[2].push(i);
    }
  }
  function Xi() {
  }
  function os(i, o, f, g) {
    var w = !1, m = null, P = "", V = !1;
    if (o = tt(o ? o.identifierPrefix : void 0), i = Ya(
      i,
      o,
      Co(o, f),
      Ct(0, null, 0, null),
      1 / 0,
      Xi,
      void 0,
      function() {
        V = !0;
      },
      void 0,
      void 0,
      void 0
    ), i.flushScheduled = i.destination !== null, as(i), i.status === 10 && (i.status = 11), i.trackedPostpones === null && Du(i, i.pendingRootTasks === 0), Cs(i, g), Lu(i, {
      push: function(M) {
        return M !== null && (P += M), !0;
      },
      destroy: function(M) {
        w = !0, m = M;
      }
    }), w && m !== g) throw m;
    if (!V) throw Error(W(426));
    return P;
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
var Xf;
function oh() {
  if (Xf) return Ys;
  Xf = 1;
  var fe = _s(), ce = bf();
  function W(l) {
    var a = "https://react.dev/errors/" + l;
    if (1 < arguments.length) {
      a += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var s = 2; s < arguments.length; s++)
        a += "&args[]=" + encodeURIComponent(arguments[s]);
    }
    return "Minified React error #" + l + "; visit " + a + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  var ke = /* @__PURE__ */ Symbol.for("react.transitional.element"), nn = /* @__PURE__ */ Symbol.for("react.portal"), ye = /* @__PURE__ */ Symbol.for("react.fragment"), Oe = /* @__PURE__ */ Symbol.for("react.strict_mode"), Tn = /* @__PURE__ */ Symbol.for("react.profiler"), Re = /* @__PURE__ */ Symbol.for("react.consumer"), ie = /* @__PURE__ */ Symbol.for("react.context"), Be = /* @__PURE__ */ Symbol.for("react.forward_ref"), A = /* @__PURE__ */ Symbol.for("react.suspense"), D = /* @__PURE__ */ Symbol.for("react.suspense_list"), Ae = /* @__PURE__ */ Symbol.for("react.memo"), ee = /* @__PURE__ */ Symbol.for("react.lazy"), X = /* @__PURE__ */ Symbol.for("react.scope"), ft = /* @__PURE__ */ Symbol.for("react.activity"), tr = /* @__PURE__ */ Symbol.for("react.legacy_hidden"), Yt = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), Gl = /* @__PURE__ */ Symbol.for("react.view_transition"), Br = Symbol.iterator;
  function Jn(l) {
    return l === null || typeof l != "object" ? null : (l = Br && l[Br] || l["@@iterator"], typeof l == "function" ? l : null);
  }
  var Me = Array.isArray;
  function Je(l, a) {
    var s = l.length & 3, v = l.length - s, p = a;
    for (a = 0; a < v; ) {
      var C = l.charCodeAt(a) & 255 | (l.charCodeAt(++a) & 255) << 8 | (l.charCodeAt(++a) & 255) << 16 | (l.charCodeAt(++a) & 255) << 24;
      ++a, C = 3432918353 * (C & 65535) + ((3432918353 * (C >>> 16) & 65535) << 16) & 4294967295, C = C << 15 | C >>> 17, C = 461845907 * (C & 65535) + ((461845907 * (C >>> 16) & 65535) << 16) & 4294967295, p ^= C, p = p << 13 | p >>> 19, p = 5 * (p & 65535) + ((5 * (p >>> 16) & 65535) << 16) & 4294967295, p = (p & 65535) + 27492 + (((p >>> 16) + 58964 & 65535) << 16);
    }
    switch (C = 0, s) {
      case 3:
        C ^= (l.charCodeAt(a + 2) & 255) << 16;
      case 2:
        C ^= (l.charCodeAt(a + 1) & 255) << 8;
      case 1:
        C ^= l.charCodeAt(a) & 255, C = 3432918353 * (C & 65535) + ((3432918353 * (C >>> 16) & 65535) << 16) & 4294967295, C = C << 15 | C >>> 17, p ^= 461845907 * (C & 65535) + ((461845907 * (C >>> 16) & 65535) << 16) & 4294967295;
    }
    return p ^= l.length, p ^= p >>> 16, p = 2246822507 * (p & 65535) + ((2246822507 * (p >>> 16) & 65535) << 16) & 4294967295, p ^= p >>> 13, p = 3266489909 * (p & 65535) + ((3266489909 * (p >>> 16) & 65535) << 16) & 4294967295, (p ^ p >>> 16) >>> 0;
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
  }, nt = null, Pe = 0;
  function Q(l, a) {
    if (a.byteLength !== 0)
      if (2048 < a.byteLength)
        0 < Pe && (l.enqueue(
          new Uint8Array(nt.buffer, 0, Pe)
        ), nt = new Uint8Array(2048), Pe = 0), l.enqueue(a);
      else {
        var s = nt.length - Pe;
        s < a.byteLength && (s === 0 ? l.enqueue(nt) : (nt.set(a.subarray(0, s), Pe), l.enqueue(nt), a = a.subarray(s)), nt = new Uint8Array(2048), Pe = 0), nt.set(a, Pe), Pe += a.byteLength;
      }
  }
  function de(l, a) {
    return Q(l, a), !0;
  }
  function Tr(l) {
    nt && 0 < Pe && (l.enqueue(new Uint8Array(nt.buffer, 0, Pe)), nt = null, Pe = 0);
  }
  var vl = new TextEncoder();
  function he(l) {
    return vl.encode(l);
  }
  function T(l) {
    return vl.encode(l);
  }
  function Y(l) {
    return l.byteLength;
  }
  function pe(l, a) {
    typeof l.error == "function" ? l.error(a) : l.close();
  }
  var Te = Object.assign, me = Object.prototype.hasOwnProperty, Ne = RegExp(
    "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
  ), Se = {}, Rt = {};
  function Rn(l) {
    return me.call(Rt, l) ? !0 : me.call(Se, l) ? !1 : Ne.test(l) ? Rt[l] = !0 : (Se[l] = !0, !1);
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
  ]), Ia = /["'&<>]/;
  function Ge(l) {
    if (typeof l == "boolean" || typeof l == "number" || typeof l == "bigint")
      return "" + l;
    l = "" + l;
    var a = Ia.exec(l);
    if (a) {
      var s = "", v, p = 0;
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
        p !== v && (s += l.slice(p, v)), p = v + 1, s += a;
      }
      l = p !== v ? s + l.slice(p, v) : s;
    }
    return l;
  }
  var mt = /([A-Z])/g, xn = /^ms-/, St = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function Gt(l) {
    return St.test("" + l) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : l;
  }
  var Xl = fe.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Xt = ce.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Ie = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, xr = Xt.d;
  Xt.d = {
    f: xr.f,
    r: xr.r,
    D: is,
    C: Du,
    L: xi,
    m: Tc,
    X: Gi,
    S: fr,
    M: as
  };
  var Pt = [], $r = null;
  T('"></template>');
  var Da = T("<script"), vn = T("<\/script>"), rr = T('<script src="'), Nn = T('<script type="module" src="'), rc = T(' nonce="'), ht = T(' integrity="'), To = T(' crossorigin="'), xo = T(' async=""><\/script>'), el = T("<style"), aa = /(<\/|<)(s)(cript)/gi;
  function fi(l, a, s, v) {
    return "" + a + (s === "s" ? "\\u0073" : "\\u0053") + v;
  }
  var Zl = T(
    '<script type="importmap">'
  ), Vl = T("<\/script>");
  function bl(l, a, s, v, p, C) {
    s = typeof a == "string" ? a : a && a.script;
    var k = s === void 0 ? Da : T(
      '<script nonce="' + Ge(s) + '"'
    ), z = typeof a == "string" ? void 0 : a && a.style, O = z === void 0 ? el : T(
      '<style nonce="' + Ge(z) + '"'
    ), H = l.idPrefix, Z = [], K = l.bootstrapScriptContent, xe = l.bootstrapScripts, we = l.bootstrapModules;
    if (K !== void 0 && (Z.push(k), va(Z, l), Z.push(
      mn,
      he(
        ("" + K).replace(aa, fi)
      ),
      vn
    )), K = [], v !== void 0 && (K.push(Zl), K.push(
      he(
        ("" + JSON.stringify(v)).replace(aa, fi)
      )
    ), K.push(Vl)), v = p ? {
      preconnects: "",
      fontPreloads: "",
      highImagePreloads: "",
      remainingCapacity: 2 + (typeof C == "number" ? C : 2e3)
    } : null, p = {
      placeholderPrefix: T(H + "P:"),
      segmentPrefix: T(H + "S:"),
      boundaryPrefix: T(H + "B:"),
      startInlineScript: k,
      startInlineStyle: O,
      preamble: L(),
      externalRuntimeScript: null,
      bootstrapChunks: Z,
      importMapChunks: K,
      onHeaders: p,
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
      nonce: { script: s, style: z },
      hoistableState: null,
      stylesToHoist: !1
    }, xe !== void 0)
      for (v = 0; v < xe.length; v++)
        H = xe[v], z = k = void 0, O = {
          rel: "preload",
          as: "script",
          fetchPriority: "low",
          nonce: a
        }, typeof H == "string" ? O.href = C = H : (O.href = C = H.src, O.integrity = z = typeof H.integrity == "string" ? H.integrity : void 0, O.crossOrigin = k = typeof H == "string" || H.crossOrigin == null ? void 0 : H.crossOrigin === "use-credentials" ? "use-credentials" : ""), H = l, K = C, H.scriptResources[K] = null, H.moduleScriptResources[K] = null, H = [], rt(H, O), p.bootstrapScripts.add(H), Z.push(
          rr,
          he(Ge(C)),
          Yn
        ), s && Z.push(
          rc,
          he(Ge(s)),
          Yn
        ), typeof z == "string" && Z.push(
          ht,
          he(Ge(z)),
          Yn
        ), typeof k == "string" && Z.push(
          To,
          he(Ge(k)),
          Yn
        ), va(Z, l), Z.push(xo);
    if (we !== void 0)
      for (a = 0; a < we.length; a++)
        z = we[a], C = v = void 0, k = {
          rel: "modulepreload",
          fetchPriority: "low",
          nonce: s
        }, typeof z == "string" ? k.href = xe = z : (k.href = xe = z.src, k.integrity = C = typeof z.integrity == "string" ? z.integrity : void 0, k.crossOrigin = v = typeof z == "string" || z.crossOrigin == null ? void 0 : z.crossOrigin === "use-credentials" ? "use-credentials" : ""), z = l, O = xe, z.scriptResources[O] = null, z.moduleScriptResources[O] = null, z = [], rt(z, k), p.bootstrapScripts.add(z), Z.push(
          Nn,
          he(Ge(xe)),
          Yn
        ), s && Z.push(
          rc,
          he(Ge(s)),
          Yn
        ), typeof C == "string" && Z.push(
          ht,
          he(Ge(C)),
          Yn
        ), typeof v == "string" && Z.push(
          To,
          he(Ge(v)),
          Yn
        ), va(Z, l), Z.push(xo);
    return p;
  }
  function R(l, a, s, v, p) {
    return {
      idPrefix: l === void 0 ? "" : l,
      nextFormID: 0,
      streamingFormat: 0,
      bootstrapScriptContent: s,
      bootstrapScripts: v,
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
  function Ql(l, a, s, v) {
    return a === "" ? v : (v && l.push(We), l.push(he(Ge(a))), !0);
  }
  var nl = /* @__PURE__ */ new Map(), dt = T(' style="'), hi = T(":"), oa = T(";");
  function La(l, a) {
    if (typeof a != "object") throw Error(W(62));
    var s = !0, v;
    for (v in a)
      if (me.call(a, v)) {
        var p = a[v];
        if (p != null && typeof p != "boolean" && p !== "") {
          if (v.indexOf("--") === 0) {
            var C = he(Ge(v));
            p = he(
              Ge(("" + p).trim())
            );
          } else
            C = nl.get(v), C === void 0 && (C = T(
              Ge(
                v.replace(mt, "-$1").toLowerCase().replace(xn, "-ms-")
              )
            ), nl.set(v, C)), p = typeof p == "number" ? p === 0 || tt.has(v) ? he("" + p) : he(p + "px") : he(
              Ge(("" + p).trim())
            );
          s ? (s = !1, l.push(
            dt,
            C,
            hi,
            p
          )) : l.push(oa, C, hi, p);
        }
      }
    s || l.push(Yn);
  }
  var ur = T(" "), tl = T('="'), Yn = T('"'), lc = T('=""');
  function yl(l, a, s) {
    s && typeof s != "function" && typeof s != "symbol" && l.push(ur, he(a), lc);
  }
  function Cn(l, a, s) {
    typeof s != "function" && typeof s != "symbol" && typeof s != "boolean" && l.push(
      ur,
      he(a),
      tl,
      he(Ge(s)),
      Yn
    );
  }
  var es = T(
    Ge(
      "javascript:throw new Error('React form unexpectedly submitted.')"
    )
  ), dn = T('<input type="hidden"');
  function ic(l, a) {
    this.push(dn), ac(l), Cn(this, "name", a), Cn(this, "value", l), this.push(Jl);
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
          var p = v.data;
          p?.forEach(ac);
        }
        return v;
      } catch (C) {
        if (typeof C == "object" && C !== null && typeof C.then == "function")
          throw C;
      }
    }
    return null;
  }
  function di(l, a, s, v, p, C, k, z) {
    var O = null;
    if (typeof v == "function") {
      var H = oc(a, v);
      H !== null ? (z = H.name, v = H.action || "", p = H.encType, C = H.method, k = H.target, O = H.data) : (l.push(
        ur,
        he("formAction"),
        tl,
        es,
        Yn
      ), k = C = p = v = z = null, ns(a, s));
    }
    return z != null && zn(l, "name", z), v != null && zn(l, "formAction", v), p != null && zn(l, "formEncType", p), C != null && zn(l, "formMethod", C), k != null && zn(l, "formTarget", k), O;
  }
  function zn(l, a, s) {
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
          he(a),
          tl,
          he(Ge(s)),
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
        yl(l, a.toLowerCase(), s);
        break;
      case "xlinkHref":
        if (typeof s == "function" || typeof s == "symbol" || typeof s == "boolean")
          break;
        s = Gt("" + s), l.push(
          ur,
          he("xlink:href"),
          tl,
          he(Ge(s)),
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
          he(a),
          tl,
          he(Ge(s)),
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
          he(a),
          lc
        );
        break;
      case "capture":
      case "download":
        s === !0 ? l.push(
          ur,
          he(a),
          lc
        ) : s !== !1 && typeof s != "function" && typeof s != "symbol" && l.push(
          ur,
          he(a),
          tl,
          he(Ge(s)),
          Yn
        );
        break;
      case "cols":
      case "rows":
      case "size":
      case "span":
        typeof s != "function" && typeof s != "symbol" && !isNaN(s) && 1 <= s && l.push(
          ur,
          he(a),
          tl,
          he(Ge(s)),
          Yn
        );
        break;
      case "rowSpan":
      case "start":
        typeof s == "function" || typeof s == "symbol" || isNaN(s) || l.push(
          ur,
          he(a),
          tl,
          he(Ge(s)),
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
            he(a),
            tl,
            he(Ge(s)),
            Yn
          );
        }
    }
  }
  var mn = T(">"), Jl = T("/>");
  function sr(l, a, s) {
    if (a != null) {
      if (s != null) throw Error(W(60));
      if (typeof a != "object" || !("__html" in a))
        throw Error(W(61));
      a = a.__html, a != null && l.push(he("" + a));
    }
  }
  function Na(l) {
    var a = "";
    return fe.Children.forEach(l, function(s) {
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
              zn(l, s, v);
          }
      }
    return l.push(Jl), null;
  }
  var Gc = /(<\/|<)(s)(tyle)/gi;
  function Eo(l, a, s, v) {
    return "" + a + (s === "s" ? "\\73 " : "\\53 ") + v;
  }
  function pl(l, a, s) {
    l.push(Zt(s));
    for (var v in a)
      if (me.call(a, v)) {
        var p = a[v];
        if (p != null)
          switch (v) {
            case "children":
            case "dangerouslySetInnerHTML":
              throw Error(W(399, s));
            default:
              zn(l, v, p);
          }
      }
    return l.push(Jl), null;
  }
  function za(l, a) {
    l.push(Zt("title"));
    var s = null, v = null, p;
    for (p in a)
      if (me.call(a, p)) {
        var C = a[p];
        if (C != null)
          switch (p) {
            case "children":
              s = C;
              break;
            case "dangerouslySetInnerHTML":
              v = C;
              break;
            default:
              zn(l, p, C);
          }
      }
    return l.push(mn), a = Array.isArray(s) ? 2 > s.length ? s[0] : null : s, typeof a != "function" && typeof a != "symbol" && a !== null && a !== void 0 && l.push(he(Ge("" + a))), sr(l, v, s), l.push(bi("title")), null;
  }
  var ts = T("<!--head-->"), rs = T("<!--body-->"), Ro = T("<!--html-->");
  function Co(l, a) {
    l.push(Zt("script"));
    var s = null, v = null, p;
    for (p in a)
      if (me.call(a, p)) {
        var C = a[p];
        if (C != null)
          switch (p) {
            case "children":
              s = C;
              break;
            case "dangerouslySetInnerHTML":
              v = C;
              break;
            default:
              zn(l, p, C);
          }
      }
    return l.push(mn), sr(l, v, s), typeof s == "string" && l.push(
      he(("" + s).replace(aa, fi))
    ), l.push(bi("script")), null;
  }
  function gi(l, a, s) {
    l.push(Zt(s));
    var v = s = null, p;
    for (p in a)
      if (me.call(a, p)) {
        var C = a[p];
        if (C != null)
          switch (p) {
            case "children":
              s = C;
              break;
            case "dangerouslySetInnerHTML":
              v = C;
              break;
            default:
              zn(l, p, C);
          }
      }
    return l.push(mn), sr(l, v, s), s;
  }
  function vi(l, a, s) {
    l.push(Zt(s));
    var v = s = null, p;
    for (p in a)
      if (me.call(a, p)) {
        var C = a[p];
        if (C != null)
          switch (p) {
            case "children":
              s = C;
              break;
            case "dangerouslySetInnerHTML":
              v = C;
              break;
            default:
              zn(l, p, C);
          }
      }
    return l.push(mn), sr(l, v, s), typeof s == "string" ? (l.push(he(Ge(s))), null) : s;
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
  function sc(l, a, s, v, p, C, k, z, O) {
    switch (a) {
      case "div":
      case "span":
      case "svg":
      case "path":
        break;
      case "a":
        l.push(Zt("a"));
        var H = null, Z = null, K;
        for (K in s)
          if (me.call(s, K)) {
            var xe = s[K];
            if (xe != null)
              switch (K) {
                case "children":
                  H = xe;
                  break;
                case "dangerouslySetInnerHTML":
                  Z = xe;
                  break;
                case "href":
                  xe === "" ? Cn(l, "href", "") : zn(l, K, xe);
                  break;
                default:
                  zn(l, K, xe);
              }
          }
        if (l.push(mn), sr(l, Z, H), typeof H == "string") {
          l.push(he(Ge(H)));
          var we = null;
        } else we = H;
        return we;
      case "g":
      case "p":
      case "li":
        break;
      case "select":
        l.push(Zt("select"));
        var bn = null, Ve = null, yn;
        for (yn in s)
          if (me.call(s, yn)) {
            var yt = s[yn];
            if (yt != null)
              switch (yn) {
                case "children":
                  bn = yt;
                  break;
                case "dangerouslySetInnerHTML":
                  Ve = yt;
                  break;
                case "defaultValue":
                case "value":
                  break;
                default:
                  zn(
                    l,
                    yn,
                    yt
                  );
              }
          }
        return l.push(mn), sr(l, Ve, bn), bn;
      case "option":
        var $n = z.selectedValue;
        l.push(Zt("option"));
        var gr = null, ll = null, Il = null, Qe = null, Ar;
        for (Ar in s)
          if (me.call(s, Ar)) {
            var _t = s[Ar];
            if (_t != null)
              switch (Ar) {
                case "children":
                  gr = _t;
                  break;
                case "selected":
                  Il = _t;
                  break;
                case "dangerouslySetInnerHTML":
                  Qe = _t;
                  break;
                case "value":
                  ll = _t;
                default:
                  zn(
                    l,
                    Ar,
                    _t
                  );
              }
          }
        if ($n != null) {
          var Vr = ll !== null ? "" + ll : Na(gr);
          if (Me($n)) {
            for (var ji = 0; ji < $n.length; ji++)
              if ("" + $n[ji] === Vr) {
                l.push(Wc);
                break;
              }
          } else
            "" + $n === Vr && l.push(Wc);
        } else Il && l.push(Wc);
        return l.push(mn), sr(l, Qe, gr), gr;
      case "textarea":
        l.push(Zt("textarea"));
        var pt = null, lo = null, Dl = null, Fr;
        for (Fr in s)
          if (me.call(s, Fr)) {
            var ii = s[Fr];
            if (ii != null)
              switch (Fr) {
                case "children":
                  Dl = ii;
                  break;
                case "value":
                  pt = ii;
                  break;
                case "defaultValue":
                  lo = ii;
                  break;
                case "dangerouslySetInnerHTML":
                  throw Error(W(91));
                default:
                  zn(
                    l,
                    Fr,
                    ii
                  );
              }
          }
        if (pt === null && lo !== null && (pt = lo), l.push(mn), Dl != null) {
          if (pt != null) throw Error(W(92));
          if (Me(Dl)) {
            if (1 < Dl.length)
              throw Error(W(93));
            pt = "" + Dl[0];
          }
          pt = "" + Dl;
        }
        return typeof pt == "string" && pt[0] === `
` && l.push(Xc), pt !== null && l.push(
          he(Ge("" + pt))
        ), null;
      case "input":
        l.push(Zt("input"));
        var Or = null, io = null, Wo = null, Qr = null, Yo = null, _r = null, ao = null, Gu = null, ot = null, Go;
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
                  Qr = ai;
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
                  _r = ai;
                  break;
                default:
                  zn(
                    l,
                    Go,
                    ai
                  );
              }
          }
        var uu = di(
          l,
          v,
          p,
          io,
          Wo,
          Qr,
          Yo,
          Or
        );
        return Gu !== null ? yl(l, "checked", Gu) : ot !== null && yl(l, "checked", ot), _r !== null ? zn(l, "value", _r) : ao !== null && zn(l, "value", ao), l.push(Jl), uu?.forEach(ic, l), null;
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
                  zn(
                    l,
                    co,
                    uo
                  );
              }
          }
        var hs = di(
          l,
          v,
          p,
          Xo,
          Sa,
          hu,
          Ci,
          fu
        );
        if (l.push(mn), hs?.forEach(ic, l), sr(l, su, oo), typeof oo == "string") {
          l.push(
            he(Ge(oo))
          );
          var Ll = null;
        } else Ll = oo;
        return Ll;
      case "form":
        l.push(Zt("form"));
        var ds = null, kl = null, Pa = null, qi = null, du = null, gu = null, vu;
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
                  Pa = so;
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
                  zn(
                    l,
                    vu,
                    so
                  );
              }
          }
        var gs = null, Xu = null;
        if (typeof Pa == "function") {
          var Zo = oc(
            v,
            Pa
          );
          Zo !== null ? (Pa = Zo.action || "", qi = Zo.encType, du = Zo.method, gu = Zo.target, gs = Zo.data, Xu = Zo.name) : (l.push(
            ur,
            he("action"),
            tl,
            es,
            Yn
          ), gu = du = qi = Pa = null, ns(v, p));
        }
        if (Pa != null && zn(l, "action", Pa), qi != null && zn(l, "encType", qi), du != null && zn(l, "method", du), gu != null && zn(l, "target", gu), l.push(mn), Xu !== null && (l.push(dn), Cn(l, "name", Xu), l.push(Jl), gs?.forEach(ic, l)), sr(l, kl, ds), typeof ds == "string") {
          l.push(
            he(Ge(ds))
          );
          var vs = null;
        } else vs = ds;
        return vs;
      case "menuitem":
        l.push(Zt("menuitem"));
        for (var bu in s)
          if (me.call(s, bu)) {
            var ms = s[bu];
            if (ms != null)
              switch (bu) {
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(W(400));
                default:
                  zn(
                    l,
                    bu,
                    ms
                  );
              }
          }
        return l.push(mn), null;
      case "object":
        l.push(Zt("object"));
        var Zu = null, ks = null, yu;
        for (yu in s)
          if (me.call(s, yu)) {
            var Vo = s[yu];
            if (Vo != null)
              switch (yu) {
                case "children":
                  Zu = Vo;
                  break;
                case "dangerouslySetInnerHTML":
                  ks = Vo;
                  break;
                case "data":
                  var Ms = Gt("" + Vo);
                  if (Ms === "") break;
                  l.push(
                    ur,
                    he("data"),
                    tl,
                    he(Ge(Ms)),
                    Yn
                  );
                  break;
                default:
                  zn(
                    l,
                    yu,
                    Vo
                  );
              }
          }
        if (l.push(mn), sr(l, ks, Zu), typeof Zu == "string") {
          l.push(
            he(Ge(Zu))
          );
          var Is = null;
        } else Is = Zu;
        return Is;
      case "title":
        var mi = z.tagScope & 1, bs = z.tagScope & 4;
        if (z.insertionMode === 4 || mi || s.itemProp != null)
          var Ds = za(
            l,
            s
          );
        else
          bs ? Ds = null : (za(p.hoistableChunks, s), Ds = void 0);
        return Ds;
      case "link":
        var ar = z.tagScope & 1, $i = z.tagScope & 4, Mr = s.rel, Aa = s.href, Nl = s.precedence;
        if (z.insertionMode === 4 || ar || s.itemProp != null || typeof Mr != "string" || typeof Aa != "string" || Aa === "") {
          rt(l, s);
          var Dn = null;
        } else if (s.rel === "stylesheet")
          if (typeof Nl != "string" || s.disabled != null || s.onLoad || s.onError)
            Dn = rt(
              l,
              s
            );
          else {
            var il = p.styles.get(Nl), ea = v.styleResources.hasOwnProperty(Aa) ? v.styleResources[Aa] : void 0;
            if (ea !== null) {
              v.styleResources[Aa] = null, il || (il = {
                precedence: he(Ge(Nl)),
                rules: [],
                hrefs: [],
                sheets: /* @__PURE__ */ new Map()
              }, p.styles.set(Nl, il));
              var zt = {
                state: 0,
                props: Te({}, s, {
                  "data-precedence": s.precedence,
                  precedence: null
                })
              };
              if (ea) {
                ea.length === 2 && Za(zt.props, ea);
                var _c = p.preloads.stylesheets.get(Aa);
                _c && 0 < _c.length ? _c.length = 0 : zt.state = 1;
              }
              il.sheets.set(Aa, zt), k && k.stylesheets.add(zt);
            } else if (il) {
              var pu = il.sheets.get(Aa);
              pu && k && k.stylesheets.add(pu);
            }
            O && l.push(We), Dn = null;
          }
        else
          s.onLoad || s.onError ? Dn = rt(
            l,
            s
          ) : (O && l.push(We), Dn = $i ? null : rt(p.hoistableChunks, s));
        return Dn;
      case "script":
        var ys = z.tagScope & 1, Qo = s.async;
        if (typeof s.src != "string" || !s.src || !Qo || typeof Qo == "function" || typeof Qo == "symbol" || s.onLoad || s.onError || z.insertionMode === 4 || ys || s.itemProp != null)
          var fo = Co(
            l,
            s
          );
        else {
          var Mc = s.src;
          if (s.type === "module")
            var oi = v.moduleScriptResources, ho = p.preloads.moduleScripts;
          else
            oi = v.scriptResources, ho = p.preloads.scripts;
          var Ic = oi.hasOwnProperty(Mc) ? oi[Mc] : void 0;
          if (Ic !== null) {
            oi[Mc] = null;
            var n = s;
            if (Ic) {
              Ic.length === 2 && (n = Te({}, s), Za(n, Ic));
              var r = ho.get(Mc);
              r && (r.length = 0);
            }
            var u = [];
            p.scripts.add(u), Co(u, n);
          }
          O && l.push(We), fo = null;
        }
        return fo;
      case "style":
        var d = z.tagScope & 1, y = s.precedence, E = s.href, F = s.nonce;
        if (z.insertionMode === 4 || d || s.itemProp != null || typeof y != "string" || typeof E != "string" || E === "") {
          l.push(Zt("style"));
          var I = null, te = null, B;
          for (B in s)
            if (me.call(s, B)) {
              var j = s[B];
              if (j != null)
                switch (B) {
                  case "children":
                    I = j;
                    break;
                  case "dangerouslySetInnerHTML":
                    te = j;
                    break;
                  default:
                    zn(
                      l,
                      B,
                      j
                    );
                }
            }
          l.push(mn);
          var ge = Array.isArray(I) ? 2 > I.length ? I[0] : null : I;
          typeof ge != "function" && typeof ge != "symbol" && ge !== null && ge !== void 0 && l.push(
            he(("" + ge).replace(Gc, Eo))
          ), sr(l, te, I), l.push(bi("style"));
          var Ce = null;
        } else {
          var be = p.styles.get(y);
          if ((v.styleResources.hasOwnProperty(E) ? v.styleResources[E] : void 0) !== null) {
            v.styleResources[E] = null, be || (be = {
              precedence: he(
                Ge(y)
              ),
              rules: [],
              hrefs: [],
              sheets: /* @__PURE__ */ new Map()
            }, p.styles.set(y, be));
            var ae = p.nonce.style;
            if (!ae || ae === F) {
              be.hrefs.push(
                he(Ge(E))
              );
              var fn = be.rules, Qn = null, Ye = null, Fn;
              for (Fn in s)
                if (me.call(s, Fn)) {
                  var vr = s[Fn];
                  if (vr != null)
                    switch (Fn) {
                      case "children":
                        Qn = vr;
                        break;
                      case "dangerouslySetInnerHTML":
                        Ye = vr;
                    }
                }
              var br = Array.isArray(Qn) ? 2 > Qn.length ? Qn[0] : null : Qn;
              typeof br != "function" && typeof br != "symbol" && br !== null && br !== void 0 && fn.push(
                he(
                  ("" + br).replace(Gc, Eo)
                )
              ), sr(fn, Ye, Qn);
            }
          }
          be && k && k.styles.add(be), O && l.push(We), Ce = void 0;
        }
        return Ce;
      case "meta":
        var Mn = z.tagScope & 1, $t = z.tagScope & 4;
        if (z.insertionMode === 4 || Mn || s.itemProp != null)
          var ki = pl(
            l,
            s,
            "meta"
          );
        else
          O && l.push(We), ki = $t ? null : typeof s.charSet == "string" ? pl(p.charsetChunks, s, "meta") : s.name === "viewport" ? pl(p.viewportChunks, s, "meta") : pl(p.hoistableChunks, s, "meta");
        return ki;
      case "listing":
      case "pre":
        l.push(Zt(a));
        var Jr = null, _e = null, Bn;
        for (Bn in s)
          if (me.call(s, Bn)) {
            var Un = s[Bn];
            if (Un != null)
              switch (Bn) {
                case "children":
                  Jr = Un;
                  break;
                case "dangerouslySetInnerHTML":
                  _e = Un;
                  break;
                default:
                  zn(
                    l,
                    Bn,
                    Un
                  );
              }
          }
        if (l.push(mn), _e != null) {
          if (Jr != null) throw Error(W(60));
          if (typeof _e != "object" || !("__html" in _e))
            throw Error(W(61));
          var Xn = _e.__html;
          Xn != null && (typeof Xn == "string" && 0 < Xn.length && Xn[0] === `
` ? l.push(Xc, he(Xn)) : l.push(he("" + Xn)));
        }
        return typeof Jr == "string" && Jr[0] === `
` && l.push(Xc), Jr;
      case "img":
        var wt = z.tagScope & 3, wn = s.src, tn = s.srcSet;
        if (!(s.loading === "lazy" || !wn && !tn || typeof wn != "string" && wn != null || typeof tn != "string" && tn != null || s.fetchPriority === "low" || wt) && (typeof wn != "string" || wn[4] !== ":" || wn[0] !== "d" && wn[0] !== "D" || wn[1] !== "a" && wn[1] !== "A" || wn[2] !== "t" && wn[2] !== "T" || wn[3] !== "a" && wn[3] !== "A") && (typeof tn != "string" || tn[4] !== ":" || tn[0] !== "d" && tn[0] !== "D" || tn[1] !== "a" && tn[1] !== "A" || tn[2] !== "t" && tn[2] !== "T" || tn[3] !== "a" && tn[3] !== "A")) {
          k !== null && z.tagScope & 64 && (k.suspenseyImages = !0);
          var Ir = typeof s.sizes == "string" ? s.sizes : void 0, Wn = tn ? tn + `
` + (Ir || "") : wn, yr = p.preloads.images, ct = yr.get(Wn);
          if (ct)
            (s.fetchPriority === "high" || 10 > p.highImagePreloads.size) && (yr.delete(Wn), p.highImagePreloads.add(ct));
          else if (!v.imageResources.hasOwnProperty(Wn)) {
            v.imageResources[Wn] = Pt;
            var al = s.crossOrigin, Jo = typeof al == "string" ? al === "use-credentials" ? al : "" : void 0, ol = p.headers, Si;
            ol && 0 < ol.remainingCapacity && typeof s.srcSet != "string" && (s.fetchPriority === "high" || 500 > ol.highImagePreloads.length) && (Si = qc(wn, "image", {
              imageSrcSet: s.srcSet,
              imageSizes: s.sizes,
              crossOrigin: Jo,
              integrity: s.integrity,
              nonce: s.nonce,
              type: s.type,
              fetchPriority: s.fetchPriority,
              referrerPolicy: s.refererPolicy
            }), 0 <= (ol.remainingCapacity -= Si.length + 2)) ? (p.resets.image[Wn] = Pt, ol.highImagePreloads && (ol.highImagePreloads += ", "), ol.highImagePreloads += Si) : (ct = [], rt(ct, {
              rel: "preload",
              as: "image",
              href: tn ? void 0 : wn,
              imageSrcSet: tn,
              imageSizes: Ir,
              crossOrigin: Jo,
              integrity: s.integrity,
              type: s.type,
              fetchPriority: s.fetchPriority,
              referrerPolicy: s.referrerPolicy
            }), s.fetchPriority === "high" || 10 > p.highImagePreloads.size ? p.highImagePreloads.add(ct) : (p.bulkPreloads.add(ct), yr.set(Wn, ct)));
          }
        }
        return pl(l, s, "img");
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
        return pl(l, s, a);
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
        if (2 > z.insertionMode) {
          var Pi = C || p.preamble;
          if (Pi.headChunks)
            throw Error(W(545, "`<head>`"));
          C !== null && l.push(ts), Pi.headChunks = [];
          var Ai = gi(
            Pi.headChunks,
            s,
            "head"
          );
        } else
          Ai = vi(
            l,
            s,
            "head"
          );
        return Ai;
      case "body":
        if (2 > z.insertionMode) {
          var or = C || p.preamble;
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
        if (z.insertionMode === 0) {
          var t = C || p.preamble;
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
          var h = null, b = null, x;
          for (x in s)
            if (me.call(s, x)) {
              var S = s[x];
              if (S != null) {
                var _ = x;
                switch (x) {
                  case "children":
                    h = S;
                    break;
                  case "dangerouslySetInnerHTML":
                    b = S;
                    break;
                  case "style":
                    La(l, S);
                    break;
                  case "suppressContentEditableWarning":
                  case "suppressHydrationWarning":
                  case "ref":
                    break;
                  case "className":
                    _ = "class";
                  default:
                    if (Rn(x) && typeof S != "function" && typeof S != "symbol" && S !== !1) {
                      if (S === !0) S = "";
                      else if (typeof S == "object") continue;
                      l.push(
                        ur,
                        he(_),
                        tl,
                        he(Ge(S)),
                        Yn
                      );
                    }
                }
              }
            }
          return l.push(mn), sr(l, b, h), h;
        }
    }
    return vi(l, s, a);
  }
  var Zc = /* @__PURE__ */ new Map();
  function bi(l) {
    var a = Zc.get(l);
    return a === void 0 && (a = T("</" + l + ">"), Zc.set(l, a)), a;
  }
  function fc(l, a) {
    l = l.preamble, l.htmlChunks === null && a.htmlChunks && (l.htmlChunks = a.htmlChunks), l.headChunks === null && a.headChunks && (l.headChunks = a.headChunks), l.bodyChunks === null && a.bodyChunks && (l.bodyChunks = a.bodyChunks);
  }
  function Ur(l, a) {
    a = a.bootstrapChunks;
    for (var s = 0; s < a.length - 1; s++)
      Q(l, a[s]);
    return s < a.length ? (s = a[s], a.length = 0, de(l, s)) : !0;
  }
  var Kl = T(
    "requestAnimationFrame(function(){$RT=performance.now()});"
  ), Su = T('<template id="'), hc = T('"></template>'), Wr = T("<!--&-->"), dc = T("<!--/&-->"), ca = T("<!--$-->"), ko = T(
    '<!--$?--><template id="'
  ), Yr = T('"></template>'), Kt = T("<!--$!-->"), jn = T("<!--/$-->"), Pu = T("<template"), Di = T('"'), jl = T(' data-dgst="');
  T(' data-msg="'), T(' data-stck="'), T(' data-cstck="');
  var Au = T("></template>");
  function Li(l, a, s) {
    if (Q(l, ko), s === null) throw Error(W(395));
    return Q(l, a.boundaryPrefix), Q(l, he(s.toString(16))), de(l, Yr);
  }
  var yi = T('<div hidden id="'), So = T('">'), Ni = T("</div>"), zi = T(
    '<svg aria-hidden="true" style="display:none" id="'
  ), Po = T('">'), $e = T("</svg>"), ql = T(
    '<math aria-hidden="true" style="display:none" id="'
  ), Mt = T('">'), pi = T("</math>"), Vt = T('<table hidden id="'), ua = T('">'), Ha = T("</table>"), wi = T('<table hidden><tbody id="'), Hi = T('">'), It = T("</tbody></table>"), Bi = T('<table hidden><tr id="'), Ui = T('">'), Ba = T("</tr></table>"), sa = T(
    '<table hidden><colgroup id="'
  ), Ua = T('">'), Gr = T("</colgroup></table>");
  function Wa(l, a, s, v) {
    switch (s.insertionMode) {
      case 0:
      case 1:
      case 3:
      case 2:
        return Q(l, yi), Q(l, a.segmentPrefix), Q(l, he(v.toString(16))), de(l, So);
      case 4:
        return Q(l, zi), Q(l, a.segmentPrefix), Q(l, he(v.toString(16))), de(l, Po);
      case 5:
        return Q(l, ql), Q(l, a.segmentPrefix), Q(l, he(v.toString(16))), de(l, Mt);
      case 6:
        return Q(l, Vt), Q(l, a.segmentPrefix), Q(l, he(v.toString(16))), de(l, ua);
      case 7:
        return Q(l, wi), Q(l, a.segmentPrefix), Q(l, he(v.toString(16))), de(l, Hi);
      case 8:
        return Q(l, Bi), Q(l, a.segmentPrefix), Q(l, he(v.toString(16))), de(l, Ui);
      case 9:
        return Q(l, sa), Q(l, a.segmentPrefix), Q(l, he(v.toString(16))), de(l, Ua);
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
        return de(l, Ni);
      case 4:
        return de(l, $e);
      case 5:
        return de(l, pi);
      case 6:
        return de(l, Ha);
      case 7:
        return de(l, It);
      case 8:
        return de(l, Ba);
      case 9:
        return de(l, Gr);
      default:
        throw Error(W(397));
    }
  }
  var Fu = T(
    '$RS=function(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};$RS("'
  ), Ou = T('$RS("'), _u = T('","'), Ao = T('")<\/script>');
  T('<template data-rsi="" data-sid="'), T('" data-pid="');
  var Fo = T(
    `$RB=[];$RV=function(a){$RT=performance.now();for(var b=0;b<a.length;b+=2){var c=a[b],e=a[b+1];null!==e.parentNode&&e.parentNode.removeChild(e);var f=c.parentNode;if(f){var g=c.previousSibling,h=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d||"/&"===d)if(0===h)break;else h--;else"$"!==d&&"$?"!==d&&"$~"!==d&&"$!"!==d&&"&"!==d||h++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;e.firstChild;)f.insertBefore(e.firstChild,c);g.data="$";g._reactRetry&&requestAnimationFrame(g._reactRetry)}}a.length=0};
$RC=function(a,b){if(b=document.getElementById(b))(a=document.getElementById(a))?(a.previousSibling.data="$~",$RB.push(a,b),2===$RB.length&&("number"!==typeof $RT?requestAnimationFrame($RV.bind(null,$RB)):(a=performance.now(),setTimeout($RV.bind(null,$RB),2300>a&&2E3<a?2300-a:$RT+300-a)))):b.parentNode.removeChild(b)};`
  );
  he(
    `$RV=function(A,g){function k(a,b){var e=a.getAttribute(b);e&&(b=a.style,l.push(a,b.viewTransitionName,b.viewTransitionClass),"auto"!==e&&(b.viewTransitionClass=e),(a=a.getAttribute("vt-name"))||(a="_T_"+K++ +"_"),b.viewTransitionName=a,B=!0)}var B=!1,K=0,l=[];try{var f=document.__reactViewTransition;if(f){f.finished.finally($RV.bind(null,g));return}var m=new Map;for(f=1;f<g.length;f+=2)for(var h=g[f].querySelectorAll("[vt-share]"),d=0;d<h.length;d++){var c=h[d];m.set(c.getAttribute("vt-name"),c)}var u=[];for(h=0;h<g.length;h+=2){var C=g[h],x=C.parentNode;if(x){var v=x.getBoundingClientRect();if(v.left||v.top||v.width||v.height){c=C;for(f=0;c;){if(8===c.nodeType){var r=c.data;if("/$"===r)if(0===f)break;else f--;else"$"!==r&&"$?"!==r&&"$~"!==r&&"$!"!==r||f++}else if(1===c.nodeType){d=c;var D=d.getAttribute("vt-name"),y=m.get(D);k(d,y?"vt-share":"vt-exit");y&&(k(y,"vt-share"),m.set(D,null));var E=d.querySelectorAll("[vt-share]");for(d=0;d<E.length;d++){var F=E[d],G=F.getAttribute("vt-name"),
H=m.get(G);H&&(k(F,"vt-share"),k(H,"vt-share"),m.set(G,null))}}c=c.nextSibling}for(var I=g[h+1],t=I.firstElementChild;t;)null!==m.get(t.getAttribute("vt-name"))&&k(t,"vt-enter"),t=t.nextElementSibling;c=x;do for(var n=c.firstElementChild;n;){var J=n.getAttribute("vt-update");J&&"none"!==J&&!l.includes(n)&&k(n,"vt-update");n=n.nextElementSibling}while((c=c.parentNode)&&1===c.nodeType&&"none"!==c.getAttribute("vt-update"));u.push.apply(u,I.querySelectorAll('img[src]:not([loading="lazy"])'))}}}if(B){var z=
document.__reactViewTransition=document.startViewTransition({update:function(){A(g);for(var a=[document.documentElement.clientHeight,document.fonts.ready],b={},e=0;e<u.length;b={g:b.g},e++)if(b.g=u[e],!b.g.complete){var p=b.g.getBoundingClientRect();0<p.bottom&&0<p.right&&p.top<window.innerHeight&&p.left<window.innerWidth&&(p=new Promise(function(w){return function(q){w.g.addEventListener("load",q);w.g.addEventListener("error",q)}}(b)),a.push(p))}return Promise.race([Promise.all(a),new Promise(function(w){var q=
performance.now();setTimeout(w,2300>q&&2E3<q?2300-q:500)})])},types:[]});z.ready.finally(function(){for(var a=l.length-3;0<=a;a-=3){var b=l[a],e=b.style;e.viewTransitionName=l[a+1];e.viewTransitionClass=l[a+1];""===b.getAttribute("style")&&b.removeAttribute("style")}});z.finished.finally(function(){document.__reactViewTransition===z&&(document.__reactViewTransition=null)});$RB=[];return}}catch(a){}A(g)}.bind(null,$RV);`
  );
  var Oo = T('$RC("'), jt = T(
    `$RM=new Map;$RR=function(n,w,p){function u(q){this._p=null;q()}for(var r=new Map,t=document,h,b,e=t.querySelectorAll("link[data-precedence],style[data-precedence]"),v=[],k=0;b=e[k++];)"not all"===b.getAttribute("media")?v.push(b):("LINK"===b.tagName&&$RM.set(b.getAttribute("href"),b),r.set(b.dataset.precedence,h=b));e=0;b=[];var l,a;for(k=!0;;){if(k){var f=p[e++];if(!f){k=!1;e=0;continue}var c=!1,m=0;var d=f[m++];if(a=$RM.get(d)){var g=a._p;c=!0}else{a=t.createElement("link");a.href=d;a.rel=
"stylesheet";for(a.dataset.precedence=l=f[m++];g=f[m++];)a.setAttribute(g,f[m++]);g=a._p=new Promise(function(q,x){a.onload=u.bind(a,q);a.onerror=u.bind(a,x)});$RM.set(d,a)}d=a.getAttribute("media");!g||d&&!matchMedia(d).matches||b.push(g);if(c)continue}else{a=v[e++];if(!a)break;l=a.getAttribute("data-precedence");a.removeAttribute("media")}c=r.get(l)||h;c===h&&(h=a);r.set(l,a);c?c.parentNode.insertBefore(a,c.nextSibling):(c=t.head,c.insertBefore(a,c.firstChild))}if(p=document.getElementById(n))p.previousSibling.data=
"$~";Promise.all(b).then($RC.bind(null,n,w),$RX.bind(null,n,"CSS failed to load"))};$RR("`
  ), ls = T('$RR("'), fa = T('","'), gc = T('",'), Vc = T('"'), Wi = T(")<\/script>");
  T('<template data-rci="" data-bid="'), T('<template data-rri="" data-bid="'), T('" data-sid="'), T('" data-sty="');
  var ha = T(
    '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};'
  ), _o = T(
    '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};;$RX("'
  ), ei = T('$RX("'), da = T('"'), ga = T(","), Mu = T(")<\/script>");
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
  var Dt = /[&><\u2028\u2029]/g;
  function Ti(l) {
    return JSON.stringify(l).replace(
      Dt,
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
  ), bc = T('" data-href="'), Qc = T('">'), wl = T("</style>"), Tl = !1, rl = !0;
  function xl(l) {
    var a = l.rules, s = l.hrefs, v = 0;
    if (s.length) {
      for (Q(this, $r.startInlineStyle), Q(this, vc), Q(this, l.precedence), Q(this, bc); v < s.length - 1; v++)
        Q(this, s[v]), Q(this, yc);
      for (Q(this, s[v]), Q(this, Qc), v = 0; v < a.length; v++) Q(this, a[v]);
      rl = de(
        this,
        wl
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
    for (var a = 0; a < l.length; a++) Q(this, l[a]);
    l.length = 0;
  }
  var ni = [];
  function Jc(l) {
    rt(ni, l.props);
    for (var a = 0; a < ni.length; a++)
      Q(this, ni[a]);
    ni.length = 0, l.state = 2;
  }
  var Kc = T(' data-precedence="'), jc = T('" data-href="'), yc = T(" "), Yi = T('">'), pc = T("</style>");
  function wc(l) {
    var a = 0 < l.sheets.size;
    l.sheets.forEach(Jc, this), l.sheets.clear();
    var s = l.rules, v = l.hrefs;
    if (!a || v.length) {
      if (Q(this, $r.startInlineStyle), Q(this, Kc), Q(this, l.precedence), l = 0, v.length) {
        for (Q(this, jc); l < v.length - 1; l++)
          Q(this, v[l]), Q(this, yc);
        Q(this, v[l]);
      }
      for (Q(this, Yi), l = 0; l < s.length; l++)
        Q(this, s[l]);
      Q(this, pc), s.length = 0, v.length = 0;
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
        Q(this, ni[l]);
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
      he(Ge("_" + a.idPrefix + "R_")),
      Yn
    ));
  }
  var Ga = T("["), Xa = T(",["), ba = T(","), Iu = T("]");
  function lr(l, a) {
    Q(l, Ga);
    var s = Ga;
    a.stylesheets.forEach(function(v) {
      if (v.state !== 2)
        if (v.state === 3)
          Q(l, s), Q(
            l,
            he(
              Ti("" + v.props.href)
            )
          ), Q(l, Iu), s = Xa;
        else {
          Q(l, s);
          var p = v.props["data-precedence"], C = v.props, k = Gt("" + v.props.href);
          Q(
            l,
            he(Ti(k))
          ), p = "" + p, Q(l, ba), Q(
            l,
            he(Ti(p))
          );
          for (var z in C)
            if (me.call(C, z) && (p = C[z], p != null))
              switch (z) {
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
                    z,
                    p
                  );
              }
          Q(l, Iu), s = Xa, v.state = 3;
        }
    }), Q(l, Iu);
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
    Q(l, ba), Q(
      l,
      he(Ti(v))
    ), Q(l, ba), Q(
      l,
      he(Ti(a))
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
          var p, C;
          (C = s && 0 < s.remainingCapacity) && (C = (p = "<" + ("" + l).replace(
            Va,
            hr
          ) + ">; rel=dns-prefetch", 0 <= (s.remainingCapacity -= p.length + 2))), C ? (v.resets.dns[l] = null, s.preconnects && (s.preconnects += ", "), s.preconnects += p) : (p = [], rt(p, { href: l, rel: "dns-prefetch" }), v.preconnects.add(p));
        }
        ka(a);
      }
    } else xr.D(l);
  }
  function Du(l, a) {
    var s = un || null;
    if (s) {
      var v = s.resumableState, p = s.renderState;
      if (typeof l == "string" && l) {
        var C = a === "use-credentials" ? "credentials" : typeof a == "string" ? "anonymous" : "default";
        if (!v.connectResources[C].hasOwnProperty(l)) {
          v.connectResources[C][l] = null, v = p.headers;
          var k, z;
          if (z = v && 0 < v.remainingCapacity) {
            if (z = "<" + ("" + l).replace(
              Va,
              hr
            ) + ">; rel=preconnect", typeof a == "string") {
              var O = ("" + a).replace(
                ir,
                ya
              );
              z += '; crossorigin="' + O + '"';
            }
            z = (k = z, 0 <= (v.remainingCapacity -= k.length + 2));
          }
          z ? (p.resets.connect[C][l] = null, v.preconnects && (v.preconnects += ", "), v.preconnects += k) : (C = [], rt(C, {
            rel: "preconnect",
            href: l,
            crossOrigin: a
          }), p.preconnects.add(C));
        }
        ka(s);
      }
    } else xr.C(l, a);
  }
  function xi(l, a, s) {
    var v = un || null;
    if (v) {
      var p = v.resumableState, C = v.renderState;
      if (a && l) {
        switch (a) {
          case "image":
            if (s)
              var k = s.imageSrcSet, z = s.imageSizes, O = s.fetchPriority;
            var H = k ? k + `
` + (z || "") : l;
            if (p.imageResources.hasOwnProperty(H)) return;
            p.imageResources[H] = Pt, p = C.headers;
            var Z;
            p && 0 < p.remainingCapacity && typeof k != "string" && O === "high" && (Z = qc(l, a, s), 0 <= (p.remainingCapacity -= Z.length + 2)) ? (C.resets.image[H] = Pt, p.highImagePreloads && (p.highImagePreloads += ", "), p.highImagePreloads += Z) : (p = [], rt(
              p,
              Te(
                { rel: "preload", href: k ? void 0 : l, as: a },
                s
              )
            ), O === "high" ? C.highImagePreloads.add(p) : (C.bulkPreloads.add(p), C.preloads.images.set(H, p)));
            break;
          case "style":
            if (p.styleResources.hasOwnProperty(l)) return;
            k = [], rt(
              k,
              Te({ rel: "preload", href: l, as: a }, s)
            ), p.styleResources[l] = !s || typeof s.crossOrigin != "string" && typeof s.integrity != "string" ? Pt : [s.crossOrigin, s.integrity], C.preloads.stylesheets.set(l, k), C.bulkPreloads.add(k);
            break;
          case "script":
            if (p.scriptResources.hasOwnProperty(l)) return;
            k = [], C.preloads.scripts.set(l, k), C.bulkPreloads.add(k), rt(
              k,
              Te({ rel: "preload", href: l, as: a }, s)
            ), p.scriptResources[l] = !s || typeof s.crossOrigin != "string" && typeof s.integrity != "string" ? Pt : [s.crossOrigin, s.integrity];
            break;
          default:
            if (p.unknownResources.hasOwnProperty(a)) {
              if (k = p.unknownResources[a], k.hasOwnProperty(l))
                return;
            } else
              k = {}, p.unknownResources[a] = k;
            k[l] = Pt, (p = C.headers) && 0 < p.remainingCapacity && a === "font" && (H = qc(l, a, s), 0 <= (p.remainingCapacity -= H.length + 2)) ? (C.resets.font[l] = Pt, p.fontPreloads && (p.fontPreloads += ", "), p.fontPreloads += H) : (p = [], l = Te({ rel: "preload", href: l, as: a }, s), rt(p, l), a) === "font" ? C.fontPreloads.add(p) : C.bulkPreloads.add(p);
        }
        ka(v);
      }
    } else xr.L(l, a, s);
  }
  function Tc(l, a) {
    var s = un || null;
    if (s) {
      var v = s.resumableState, p = s.renderState;
      if (l) {
        var C = a && typeof a.as == "string" ? a.as : "script";
        switch (C) {
          case "script":
            if (v.moduleScriptResources.hasOwnProperty(l)) return;
            C = [], v.moduleScriptResources[l] = !a || typeof a.crossOrigin != "string" && typeof a.integrity != "string" ? Pt : [a.crossOrigin, a.integrity], p.preloads.moduleScripts.set(l, C);
            break;
          default:
            if (v.moduleUnknownResources.hasOwnProperty(C)) {
              var k = v.unknownResources[C];
              if (k.hasOwnProperty(l)) return;
            } else
              k = {}, v.moduleUnknownResources[C] = k;
            C = [], k[l] = Pt;
        }
        rt(C, Te({ rel: "modulepreload", href: l }, a)), p.bulkPreloads.add(C), ka(s);
      }
    } else xr.m(l, a);
  }
  function fr(l, a, s) {
    var v = un || null;
    if (v) {
      var p = v.resumableState, C = v.renderState;
      if (l) {
        a = a || "default";
        var k = C.styles.get(a), z = p.styleResources.hasOwnProperty(l) ? p.styleResources[l] : void 0;
        z !== null && (p.styleResources[l] = null, k || (k = {
          precedence: he(Ge(a)),
          rules: [],
          hrefs: [],
          sheets: /* @__PURE__ */ new Map()
        }, C.styles.set(a, k)), a = {
          state: 0,
          props: Te(
            { rel: "stylesheet", href: l, "data-precedence": a },
            s
          )
        }, z && (z.length === 2 && Za(a.props, z), (C = C.preloads.stylesheets.get(l)) && 0 < C.length ? C.length = 0 : a.state = 1), k.sheets.set(l, a), ka(v));
      }
    } else xr.S(l, a, s);
  }
  function Gi(l, a) {
    var s = un || null;
    if (s) {
      var v = s.resumableState, p = s.renderState;
      if (l) {
        var C = v.scriptResources.hasOwnProperty(l) ? v.scriptResources[l] : void 0;
        C !== null && (v.scriptResources[l] = null, a = Te({ src: l, async: !0 }, a), C && (C.length === 2 && Za(a, C), l = p.preloads.scripts.get(l)) && (l.length = 0), l = [], p.scripts.add(l), Co(l, a), ka(s));
      }
    } else xr.X(l, a);
  }
  function as(l, a) {
    var s = un || null;
    if (s) {
      var v = s.resumableState, p = s.renderState;
      if (l) {
        var C = v.moduleScriptResources.hasOwnProperty(
          l
        ) ? v.moduleScriptResources[l] : void 0;
        C !== null && (v.moduleScriptResources[l] = null, a = Te({ src: l, type: "module", async: !0 }, a), C && (C.length === 2 && Za(a, C), l = p.preloads.moduleScripts.get(l)) && (l.length = 0), l = [], p.scripts.add(l), Co(l, a), ka(s));
      }
    } else xr.M(l, a);
  }
  function Za(l, a) {
    l.crossOrigin == null && (l.crossOrigin = a[0]), l.integrity == null && (l.integrity = a[1]);
  }
  function qc(l, a, s) {
    l = ("" + l).replace(
      Va,
      hr
    ), a = ("" + a).replace(
      ir,
      ya
    ), a = "<" + l + '>; rel=preload; as="' + a + '"';
    for (var v in s)
      me.call(s, v) && (l = s[v], typeof l == "string" && (a += "; " + v.toLowerCase() + '="' + ("" + l).replace(
        ir,
        ya
      ) + '"'));
    return a;
  }
  var Va = /[<>\r\n]/g;
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
  function ya(l) {
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
  function Hn(l) {
    this.stylesheets.add(l);
  }
  function Qa(l, a) {
    a.styles.forEach(qn, l), a.stylesheets.forEach(Hn, l), a.suspenseyImages && (l.suspenseyImages = !0);
  }
  function Mo(l) {
    return 0 < l.stylesheets.size || l.suspenseyImages;
  }
  var $c = Function.prototype.bind, Io = /* @__PURE__ */ Symbol.for("react.client.reference");
  function Lu(l) {
    if (l == null) return null;
    if (typeof l == "function")
      return l.$$typeof === Io ? null : l.displayName || l.name || null;
    if (typeof l == "string") return l;
    switch (l) {
      case ye:
        return "Fragment";
      case Tn:
        return "Profiler";
      case Oe:
        return "StrictMode";
      case A:
        return "Suspense";
      case D:
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
        case Be:
          var a = l.render;
          return l = l.displayName, l || (l = a.displayName || a.name || "", l = l !== "" ? "ForwardRef(" + l + ")" : "ForwardRef"), l;
        case Ae:
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
  var w = {
    enqueueSetState: function(l, a) {
      l = l._reactInternals, l.queue !== null && l.queue.push(a);
    },
    enqueueReplaceState: function(l, a) {
      l = l._reactInternals, l.replace = !0, l.queue = [a];
    },
    enqueueForceUpdate: function() {
    }
  }, m = { id: 1, overflow: "" };
  function P(l, a, s) {
    var v = l.id;
    l = l.overflow;
    var p = 32 - V(v) - 1;
    v &= ~(1 << p), s += 1;
    var C = 32 - V(a) + p;
    if (30 < C) {
      var k = p - p % 5;
      return C = (v & (1 << k) - 1).toString(32), v >>= k, p -= k, {
        id: 1 << 32 - V(a) + p | s << p | v,
        overflow: C + l
      };
    }
    return {
      id: 1 << C | s << p | v,
      overflow: l
    };
  }
  var V = Math.clz32 ? Math.clz32 : re, M = Math.log, G = Math.LN2;
  function re(l) {
    return l >>>= 0, l === 0 ? 32 : 31 - (M(l) / G | 0) | 0;
  }
  function $() {
  }
  var ve = Error(W(460));
  function De(l, a, s) {
    switch (s = l[s], s === void 0 ? l.push(a) : s !== a && (a.then($, $), a = s), a.status) {
      case "fulfilled":
        return a.value;
      case "rejected":
        throw a.reason;
      default:
        switch (typeof a.status == "string" ? a.then($, $) : (l = a, l.status = "pending", l.then(
          function(v) {
            if (a.status === "pending") {
              var p = a;
              p.status = "fulfilled", p.value = v;
            }
          },
          function(v) {
            if (a.status === "pending") {
              var p = a;
              p.status = "rejected", p.reason = v;
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
  function He(l, a) {
    return l === a && (l !== 0 || 1 / l === 1 / a) || l !== l && a !== a;
  }
  var je = typeof Object.is == "function" ? Object.is : He, Xe = null, at = null, cn = null, pn = null, _n = null, en = null, vt = !1, Sn = !1, Rr = 0, In = 0, En = -1, Pn = 0, qe = null, An = null, qt = 0;
  function sn() {
    if (Xe === null)
      throw Error(W(321));
    return Xe;
  }
  function pa() {
    if (0 < qt) throw Error(W(312));
    return { memoizedState: null, queue: null, next: null };
  }
  function Zi() {
    return en === null ? _n === null ? (vt = !1, _n = en = pa()) : (vt = !0, en = _n) : en.next === null ? (vt = !1, en = en.next = pa()) : (vt = !0, en = en.next), en;
  }
  function Cr() {
    var l = qe;
    return qe = null, l;
  }
  function Pl() {
    pn = cn = at = Xe = null, Sn = !1, _n = null, qt = 0, en = An = null;
  }
  function Al(l, a) {
    return typeof a == "function" ? a(l) : a;
  }
  function Fl(l, a, s) {
    if (Xe = sn(), en = Zi(), vt) {
      var v = en.queue;
      if (a = v.dispatch, An !== null && (s = An.get(v), s !== void 0)) {
        An.delete(v), v = en.memoizedState;
        do
          v = l(v, s.action), s = s.next;
        while (s !== null);
        return en.memoizedState = v, [v, a];
      }
      return [en.memoizedState, a];
    }
    return l = l === Al ? typeof a == "function" ? a() : a : s !== void 0 ? s(a) : a, en.memoizedState = l, l = en.queue = { last: null, dispatch: null }, l = l.dispatch = Vi.bind(
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
          for (var p = 0; p < v.length && p < a.length; p++)
            if (!je(a[p], v[p])) {
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
  function Vi(l, a, s) {
    if (25 <= qt) throw Error(W(301));
    if (l === Xe)
      if (Sn = !0, l = { action: s, next: null }, An === null && (An = /* @__PURE__ */ new Map()), s = An.get(a), s === void 0)
        An.set(a, l);
      else {
        for (a = s; a.next !== null; ) a = a.next;
        a.next = l;
      }
  }
  function Qt() {
    throw Error(W(440));
  }
  function Ja() {
    throw Error(W(394));
  }
  function Ka() {
    throw Error(W(479));
  }
  function xc(l, a, s) {
    sn();
    var v = In++, p = cn;
    if (typeof l.$$FORM_ACTION == "function") {
      var C = null, k = pn;
      p = p.formState;
      var z = l.$$IS_SIGNATURE_EQUAL;
      if (p !== null && typeof z == "function") {
        var O = p[1];
        z.call(l, p[2], p[3]) && (C = s !== void 0 ? "p" + s : "k" + Je(
          JSON.stringify([k, null, v]),
          0
        ), O === C && (En = v, a = p[0]));
      }
      var H = l.bind(null, a);
      return l = function(K) {
        H(K);
      }, typeof H.$$FORM_ACTION == "function" && (l.$$FORM_ACTION = function(K) {
        K = H.$$FORM_ACTION(K), s !== void 0 && (s += "", K.action = s);
        var xe = K.data;
        return xe && (C === null && (C = s !== void 0 ? "p" + s : "k" + Je(
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
    var a = Pn;
    return Pn += 1, qe === null && (qe = []), De(qe, l, a);
  }
  function Do() {
    throw Error(W(393));
  }
  var wa = {
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
      return Fl(Al, l);
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
      return sn(), [!1, Ja];
    },
    useId: function() {
      var l = at.treeContext, a = l.overflow;
      l = l.id, l = (l & ~(1 << 32 - V(l) - 1)).toString(32) + a;
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
      return sn(), Ie;
    },
    useMemoCache: function(l) {
      for (var a = Array(l), s = 0; s < l; s++)
        a[s] = Yt;
      return a;
    },
    useCacheRefresh: function() {
      return Do;
    },
    useEffectEvent: function() {
      return Qt;
    }
  }, mr = null, Ec = {
    getCacheForType: function() {
      throw Error(W(248));
    },
    cacheSignal: function() {
      throw Error(W(248));
    }
  }, kr, Rl;
  function Qi(l) {
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
  function Ji(l, a) {
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
                } catch (we) {
                  var xe = we;
                }
                Reflect.construct(l, [], K);
              } else {
                try {
                  K.call();
                } catch (we) {
                  xe = we;
                }
                l.call(K.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (we) {
                xe = we;
              }
              (K = l()) && typeof K.catch == "function" && K.catch(function() {
              });
            }
          } catch (we) {
            if (we && xe && typeof we.stack == "string")
              return [we.stack, xe.stack];
          }
          return [null, null];
        }
      };
      v.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
      var p = Object.getOwnPropertyDescriptor(
        v.DetermineComponentFrameRoot,
        "name"
      );
      p && p.configurable && Object.defineProperty(
        v.DetermineComponentFrameRoot,
        "name",
        { value: "DetermineComponentFrameRoot" }
      );
      var C = v.DetermineComponentFrameRoot(), k = C[0], z = C[1];
      if (k && z) {
        var O = k.split(`
`), H = z.split(`
`);
        for (p = v = 0; v < O.length && !O[v].includes("DetermineComponentFrameRoot"); )
          v++;
        for (; p < H.length && !H[p].includes(
          "DetermineComponentFrameRoot"
        ); )
          p++;
        if (v === O.length || p === H.length)
          for (v = O.length - 1, p = H.length - 1; 1 <= v && 0 <= p && O[v] !== H[p]; )
            p--;
        for (; 1 <= v && 0 <= p; v--, p--)
          if (O[v] !== H[p]) {
            if (v !== 1 || p !== 1)
              do
                if (v--, p--, 0 > p || O[v] !== H[p]) {
                  var Z = `
` + O[v].replace(" at new ", " at ");
                  return l.displayName && Z.includes("<anonymous>") && (Z = Z.replace("<anonymous>", l.displayName)), Z;
                }
              while (1 <= v && 0 <= p);
            break;
          }
      }
    } finally {
      Rc = !1, Error.prepareStackTrace = s;
    }
    return (s = l ? l.displayName || l.name : "") ? Qi(s) : "";
  }
  function nu(l) {
    if (typeof l == "string") return Qi(l);
    if (typeof l == "function")
      return l.prototype && l.prototype.isReactComponent ? Ji(l, !0) : Ji(l, !1);
    if (typeof l == "object" && l !== null) {
      switch (l.$$typeof) {
        case Be:
          return Ji(l.render, !1);
        case Ae:
          return Ji(l.type, !1);
        case ee:
          var a = l, s = a._payload;
          a = a._init;
          try {
            l = a(s);
          } catch {
            return Qi("Lazy");
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
          s = Qi(
            s + (a ? " [" + a + "]" : "")
          );
        }
        return s;
      }
    }
    switch (l) {
      case D:
        return Qi("SuspenseList");
      case A:
        return Qi("Suspense");
    }
    return "";
  }
  function Lt(l, a) {
    return (500 < a.byteSize || Mo(a.contentState)) && a.contentPreamble === null;
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
  function Ta(l, a, s, v, p, C, k, z, O, H, Z) {
    var K = /* @__PURE__ */ new Set();
    this.destination = null, this.flushScheduled = !1, this.resumableState = l, this.renderState = a, this.rootFormatContext = s, this.progressiveChunkSize = v === void 0 ? 12800 : v, this.status = 10, this.fatalError = null, this.pendingRootTasks = this.allPendingTasks = this.nextSegmentId = 0, this.completedPreambleSegments = this.completedRootSegment = null, this.byteSize = 0, this.abortableTasks = K, this.pingedTasks = [], this.clientRenderedBoundaries = [], this.completedBoundaries = [], this.partialBoundaries = [], this.trackedPostpones = null, this.onError = p === void 0 ? Cc : p, this.onPostpone = H === void 0 ? $ : H, this.onAllReady = C === void 0 ? $ : C, this.onShellReady = k === void 0 ? $ : k, this.onShellError = z === void 0 ? $ : z, this.onFatalError = O === void 0 ? $ : O, this.formState = Z === void 0 ? null : Z;
  }
  function Lo(l, a, s, v, p, C, k, z, O, H, Z, K) {
    return a = new Ta(
      a,
      s,
      v,
      p,
      C,
      k,
      z,
      O,
      H,
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
  function ja(l, a, s, v, p, C, k, z, O, H, Z) {
    return l = Lo(
      l,
      a,
      s,
      v,
      p,
      C,
      k,
      z,
      O,
      H,
      Z,
      void 0
    ), l.trackedPostpones = {
      workingMap: /* @__PURE__ */ new Map(),
      rootNodes: [],
      rootSlots: null
    }, l;
  }
  function Ot(l, a, s, v, p, C, k, z, O) {
    return s = new Ta(
      a.resumableState,
      s,
      a.rootFormatContext,
      a.progressiveChunkSize,
      v,
      p,
      C,
      k,
      z,
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
    ), Ea(l), s.pingedTasks.push(l), s) : (l = bt(
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
  function Cl(l, a, s, v, p, C, k, z, O) {
    return l = Ot(
      l,
      a,
      s,
      v,
      p,
      C,
      k,
      z,
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
  function No(l, a, s, v, p) {
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
      fallbackPreamble: p,
      trackedContentKeyPath: null,
      trackedFallbackNode: null
    }, a !== null && (a.pendingTasks++, v = a.boundaries, v !== null && (l.allPendingTasks++, s.pendingTasks++, v.push(s)), l = a.inheritedHoistables, l !== null && Qa(s.contentState, l)), s;
  }
  function xa(l, a, s, v, p, C, k, z, O, H, Z, K, xe, we, bn) {
    l.allPendingTasks++, p === null ? l.pendingRootTasks++ : p.pendingTasks++, we !== null && we.pendingTasks++;
    var Ve = {
      replay: null,
      node: s,
      childIndex: v,
      ping: function() {
        return Ki(l, Ve);
      },
      blockedBoundary: p,
      blockedSegment: C,
      blockedPreamble: k,
      hoistableState: z,
      abortSet: O,
      keyPath: H,
      formatContext: Z,
      context: K,
      treeContext: xe,
      row: we,
      componentStack: bn,
      thenableState: a
    };
    return O.add(Ve), Ve;
  }
  function bt(l, a, s, v, p, C, k, z, O, H, Z, K, xe, we) {
    l.allPendingTasks++, C === null ? l.pendingRootTasks++ : C.pendingTasks++, xe !== null && xe.pendingTasks++, s.pendingTasks++;
    var bn = {
      replay: s,
      node: v,
      childIndex: p,
      ping: function() {
        return Ki(l, bn);
      },
      blockedBoundary: C,
      blockedSegment: null,
      blockedPreamble: null,
      hoistableState: k,
      abortSet: z,
      keyPath: O,
      formatContext: H,
      context: Z,
      treeContext: K,
      row: xe,
      componentStack: we,
      thenableState: a
    };
    return z.add(bn), bn;
  }
  function Zr(l, a, s, v, p, C) {
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
      lastPushedText: p,
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
          var p = s;
        } catch (C) {
          p = `
Error generating stack: ` + C.message + `
` + C.stack;
        }
        return Object.defineProperty(a, "componentStack", {
          value: p
        }), p;
      }
    }), a;
  }
  function dr(l, a, s) {
    if (l = l.onError, a = l(a, s), a == null || typeof a == "string") return a;
  }
  function zo(l, a) {
    var s = l.onShellError, v = l.onFatalError;
    s(a), v(a), l.destination !== null ? (l.status = 14, pe(l.destination, a)) : (l.status = 13, l.fatalError = a);
  }
  function Sr(l, a) {
    Nu(l, a.next, a.hoistables);
  }
  function Nu(l, a, s) {
    for (; a !== null; ) {
      s !== null && (Qa(a.hoistables, s), a.inheritedHoistables = s);
      var v = a.boundaries;
      if (v !== null) {
        a.boundaries = null;
        for (var p = 0; p < v.length; p++) {
          var C = v[p];
          s !== null && Qa(C.contentState, s), _l(l, C, null, null);
        }
      }
      if (a.pendingTasks--, 0 < a.pendingTasks) break;
      s = a.hoistables, a = a.next;
    }
  }
  function $a(l, a) {
    var s = a.boundaries;
    if (s !== null && a.pendingTasks === s.length) {
      for (var v = !0, p = 0; p < s.length; p++) {
        var C = s[p];
        if (C.pendingTasks !== 1 || C.parentFlushed || Lt(l, C)) {
          v = !1;
          break;
        }
      }
      v && Nu(l, a, a.hoistables);
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
  function tu(l, a, s, v, p) {
    var C = a.keyPath, k = a.treeContext, z = a.row;
    a.keyPath = s, s = v.length;
    var O = null;
    if (a.replay !== null) {
      var H = a.replay.slots;
      if (H !== null && typeof H == "object")
        for (var Z = 0; Z < s; Z++) {
          var K = p !== "backwards" && p !== "unstable_legacy-backwards" ? Z : s - 1 - Z, xe = v[K];
          a.row = O = mc(
            O
          ), a.treeContext = P(k, s, K);
          var we = H[K];
          typeof we == "number" ? (no(l, a, we, xe, K), delete H[K]) : Nt(l, a, xe, K), --O.pendingTasks === 0 && Sr(l, O);
        }
      else
        for (H = 0; H < s; H++)
          Z = p !== "backwards" && p !== "unstable_legacy-backwards" ? H : s - 1 - H, K = v[Z], a.row = O = mc(O), a.treeContext = P(k, s, Z), Nt(l, a, K, Z), --O.pendingTasks === 0 && Sr(l, O);
    } else if (p !== "backwards" && p !== "unstable_legacy-backwards")
      for (p = 0; p < s; p++)
        H = v[p], a.row = O = mc(O), a.treeContext = P(
          k,
          s,
          p
        ), Nt(l, a, H, p), --O.pendingTasks === 0 && Sr(l, O);
    else {
      for (p = a.blockedSegment, H = p.children.length, Z = p.chunks.length, K = s - 1; 0 <= K; K--) {
        xe = v[K], a.row = O = mc(
          O
        ), a.treeContext = P(k, s, K), we = Zr(
          l,
          Z,
          null,
          a.formatContext,
          K === 0 ? p.lastPushedText : !0,
          !0
        ), p.children.splice(H, 0, we), a.blockedSegment = we;
        try {
          Nt(l, a, xe, K), we.lastPushedText && we.textEmbedded && we.chunks.push(We), we.status = 1, Ra(l, a.blockedBoundary, we), --O.pendingTasks === 0 && Sr(l, O);
        } catch (bn) {
          throw we.status = l.status === 12 ? 3 : 4, bn;
        }
      }
      a.blockedSegment = p, p.lastPushedText = !1;
    }
    z !== null && O !== null && 0 < O.pendingTasks && (z.pendingTasks++, O.next = z), a.treeContext = k, a.row = z, a.keyPath = C;
  }
  function ru(l, a, s, v, p, C) {
    var k = a.thenableState;
    for (a.thenableState = null, Xe = {}, at = a, cn = l, pn = s, In = Rr = 0, En = -1, Pn = 0, qe = k, l = v(p, C); Sn; )
      Sn = !1, In = Rr = 0, En = -1, Pn = 0, qt += 1, en = null, l = v(p, C);
    return Pl(), l;
  }
  function Ri(l, a, s, v, p, C, k) {
    var z = !1;
    if (C !== 0 && l.formState !== null) {
      var O = a.blockedSegment;
      if (O !== null) {
        z = !0, O = O.chunks;
        for (var H = 0; H < C; H++)
          H === k ? O.push(ku) : O.push(Yc);
      }
    }
    C = a.keyPath, a.keyPath = s, p ? (s = a.treeContext, a.treeContext = P(s, 1, 0), Nt(l, a, v, -1), a.treeContext = s) : z ? Nt(l, a, v, -1) : Pr(l, a, v, -1), a.keyPath = C;
  }
  function eo(l, a, s, v, p, C) {
    if (typeof v == "function")
      if (v.prototype && v.prototype.isReactComponent) {
        var k = p;
        if ("ref" in p) {
          k = {};
          for (var z in p)
            z !== "ref" && (k[z] = p[z]);
        }
        var O = v.defaultProps;
        if (O) {
          k === p && (k = Te({}, k, p));
          for (var H in O)
            k[H] === void 0 && (k[H] = O[H]);
        }
        p = k, k = Cs, O = v.contextType, typeof O == "object" && O !== null && (k = O._currentValue), k = new v(p, k);
        var Z = k.state !== void 0 ? k.state : null;
        if (k.updater = w, k.props = p, k.state = Z, O = { queue: [], replace: !1 }, k._reactInternals = O, C = v.contextType, k.context = typeof C == "object" && C !== null ? C._currentValue : Cs, C = v.getDerivedStateFromProps, typeof C == "function" && (C = C(p, Z), Z = C == null ? Z : Te({}, Z, C), k.state = Z), typeof v.getDerivedStateFromProps != "function" && typeof k.getSnapshotBeforeUpdate != "function" && (typeof k.UNSAFE_componentWillMount == "function" || typeof k.componentWillMount == "function"))
          if (v = k.state, typeof k.componentWillMount == "function" && k.componentWillMount(), typeof k.UNSAFE_componentWillMount == "function" && k.UNSAFE_componentWillMount(), v !== k.state && w.enqueueReplaceState(
            k,
            k.state,
            null
          ), O.queue !== null && 0 < O.queue.length)
            if (v = O.queue, C = O.replace, O.queue = null, O.replace = !1, C && v.length === 1)
              k.state = v[0];
            else {
              for (O = C ? v[0] : k.state, Z = !0, C = C ? 1 : 0; C < v.length; C++)
                H = v[C], H = typeof H == "function" ? H.call(k, O, p, void 0) : H, H != null && (Z ? (Z = !1, O = Te({}, O, H)) : Te(O, H));
              k.state = O;
            }
          else O.queue = null;
        if (v = k.render(), l.status === 12) throw null;
        p = a.keyPath, a.keyPath = s, Pr(l, a, v, -1), a.keyPath = p;
      } else {
        if (v = ru(l, a, s, v, p, void 0), l.status === 12) throw null;
        Ri(
          l,
          a,
          s,
          v,
          Rr !== 0,
          In,
          En
        );
      }
    else if (typeof v == "string")
      if (k = a.blockedSegment, k === null)
        k = p.children, O = a.formatContext, Z = a.keyPath, a.formatContext = Fe(O, v, p), a.keyPath = s, Nt(l, a, k, -1), a.formatContext = O, a.keyPath = Z;
      else {
        if (Z = sc(
          k.chunks,
          v,
          p,
          l.resumableState,
          l.renderState,
          a.blockedPreamble,
          a.hoistableState,
          a.formatContext,
          k.lastPushedText
        ), k.lastPushedText = !1, O = a.formatContext, C = a.keyPath, a.keyPath = s, (a.formatContext = Fe(O, v, p)).insertionMode === 3) {
          s = Zr(
            l,
            0,
            null,
            a.formatContext,
            !1,
            !1
          ), k.preambleChildren.push(s), a.blockedSegment = s;
          try {
            s.status = 6, Nt(l, a, Z, -1), s.lastPushedText && s.textEmbedded && s.chunks.push(We), s.status = 1, Ra(l, a.blockedBoundary, s);
          } finally {
            a.blockedSegment = k;
          }
        } else Nt(l, a, Z, -1);
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
          a.push(bi(v));
        }
        k.lastPushedText = !1;
      }
    else {
      switch (v) {
        case tr:
        case Oe:
        case Tn:
        case ye:
          v = a.keyPath, a.keyPath = s, Pr(l, a, p.children, -1), a.keyPath = v;
          return;
        case ft:
          v = a.blockedSegment, v === null ? p.mode !== "hidden" && (v = a.keyPath, a.keyPath = s, Nt(l, a, p.children, -1), a.keyPath = v) : p.mode !== "hidden" && (v.chunks.push(Wr), v.lastPushedText = !1, k = a.keyPath, a.keyPath = s, Nt(l, a, p.children, -1), a.keyPath = k, v.chunks.push(dc), v.lastPushedText = !1);
          return;
        case D:
          e: {
            if (v = p.children, p = p.revealOrder, p === "forwards" || p === "backwards" || p === "unstable_legacy-backwards") {
              if (Me(v)) {
                tu(l, a, s, v, p);
                break e;
              }
              if ((k = Jn(v)) && (k = k.call(v))) {
                if (O = k.next(), !O.done) {
                  do
                    O = k.next();
                  while (!O.done);
                  tu(l, a, s, v, p);
                }
                break e;
              }
            }
            p === "together" ? (p = a.keyPath, k = a.row, O = a.row = mc(null), O.boundaries = [], O.together = !0, a.keyPath = s, Pr(l, a, v, -1), --O.pendingTasks === 0 && Sr(l, O), a.keyPath = p, a.row = k, k !== null && 0 < O.pendingTasks && (k.pendingTasks++, O.next = k)) : (p = a.keyPath, a.keyPath = s, Pr(l, a, v, -1), a.keyPath = p);
          }
          return;
        case Gl:
        case X:
          throw Error(W(343));
        case A:
          e: if (a.replay !== null) {
            v = a.keyPath, k = a.formatContext, O = a.row, a.keyPath = s, a.formatContext = an(
              l.resumableState,
              k
            ), a.row = null, s = p.children;
            try {
              Nt(l, a, s, -1);
            } finally {
              a.keyPath = v, a.formatContext = k, a.row = O;
            }
          } else {
            v = a.keyPath, C = a.formatContext;
            var K = a.row;
            H = a.blockedBoundary, z = a.blockedPreamble;
            var xe = a.hoistableState, we = a.blockedSegment, bn = p.fallback;
            p = p.children;
            var Ve = /* @__PURE__ */ new Set(), yn = 2 > a.formatContext.insertionMode ? No(
              l,
              a.row,
              Ve,
              L(),
              L()
            ) : No(
              l,
              a.row,
              Ve,
              null,
              null
            );
            l.trackedPostpones !== null && (yn.trackedContentKeyPath = s);
            var yt = Zr(
              l,
              we.chunks.length,
              yn,
              a.formatContext,
              !1,
              !1
            );
            we.children.push(yt), we.lastPushedText = !1;
            var $n = Zr(
              l,
              0,
              null,
              a.formatContext,
              !1,
              !1
            );
            if ($n.parentFlushed = !0, l.trackedPostpones !== null) {
              k = a.componentStack, O = [s[0], "Suspense Fallback", s[2]], Z = [O[1], O[2], [], null], l.trackedPostpones.workingMap.set(O, Z), yn.trackedFallbackNode = Z, a.blockedSegment = yt, a.blockedPreamble = yn.fallbackPreamble, a.keyPath = O, a.formatContext = Ke(
                l.resumableState,
                C
              ), a.componentStack = qa(k), yt.status = 6;
              try {
                Nt(l, a, bn, -1), yt.lastPushedText && yt.textEmbedded && yt.chunks.push(We), yt.status = 1, Ra(l, H, yt);
              } catch (gr) {
                throw yt.status = l.status === 12 ? 3 : 4, gr;
              } finally {
                a.blockedSegment = we, a.blockedPreamble = z, a.keyPath = v, a.formatContext = C;
              }
              a = xa(
                l,
                null,
                p,
                -1,
                yn,
                $n,
                yn.contentPreamble,
                yn.contentState,
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
              a.blockedBoundary = yn, a.blockedPreamble = yn.contentPreamble, a.hoistableState = yn.contentState, a.blockedSegment = $n, a.keyPath = s, a.formatContext = an(
                l.resumableState,
                C
              ), a.row = null, $n.status = 6;
              try {
                if (Nt(l, a, p, -1), $n.lastPushedText && $n.textEmbedded && $n.chunks.push(We), $n.status = 1, Ra(l, yn, $n), cu(yn, $n), yn.pendingTasks === 0 && yn.status === 0) {
                  if (yn.status = 1, !Lt(l, yn)) {
                    K !== null && --K.pendingTasks === 0 && Sr(l, K), l.pendingRootTasks === 0 && a.blockedPreamble && ri(l);
                    break e;
                  }
                } else
                  K !== null && K.together && $a(l, K);
              } catch (gr) {
                yn.status = 4, l.status === 12 ? ($n.status = 3, k = l.fatalError) : ($n.status = 4, k = gr), O = Ol(a.componentStack), Z = dr(
                  l,
                  k,
                  O
                ), yn.errorDigest = Z, lu(l, yn);
              } finally {
                a.blockedBoundary = H, a.blockedPreamble = z, a.hoistableState = xe, a.blockedSegment = we, a.keyPath = v, a.formatContext = C, a.row = K;
              }
              a = xa(
                l,
                null,
                bn,
                -1,
                H,
                yt,
                yn.fallbackPreamble,
                yn.fallbackState,
                Ve,
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
          case Be:
            if ("ref" in p)
              for (we in k = {}, p)
                we !== "ref" && (k[we] = p[we]);
            else k = p;
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
              In,
              En
            );
            return;
          case Ae:
            eo(l, a, s, v.type, p, C);
            return;
          case ie:
            if (O = p.children, k = a.keyPath, p = p.value, Z = v._currentValue, v._currentValue = p, C = gt, gt = v = {
              parent: C,
              depth: C === null ? 0 : C.depth + 1,
              context: v,
              parentValue: Z,
              value: p
            }, a.context = v, a.keyPath = s, Pr(l, a, O, -1), l = gt, l === null) throw Error(W(403));
            l.context._currentValue = l.parentValue, l = gt = l.parent, a.context = l, a.keyPath = k;
            return;
          case Re:
            p = p.children, v = p(v._context._currentValue), p = a.keyPath, a.keyPath = s, Pr(l, a, v, -1), a.keyPath = p;
            return;
          case ee:
            if (k = v._init, v = k(v._payload), l.status === 12) throw null;
            eo(l, a, s, v, p, C);
            return;
        }
      throw Error(
        W(130, v == null ? v : typeof v, "")
      );
    }
  }
  function no(l, a, s, v, p) {
    var C = a.replay, k = a.blockedBoundary, z = Zr(
      l,
      0,
      null,
      a.formatContext,
      !1,
      !1
    );
    z.id = s, z.parentFlushed = !0;
    try {
      a.replay = null, a.blockedSegment = z, Nt(l, a, v, p), z.status = 1, Ra(l, k, z), k === null ? l.completedRootSegment = z : (cu(k, z), k.parentFlushed && l.partialBoundaries.push(k));
    } finally {
      a.replay = C, a.blockedSegment = null;
    }
  }
  function Pr(l, a, s, v) {
    a.replay !== null && typeof a.replay.slots == "number" ? no(l, a, a.replay.slots, s, v) : (a.node = s, a.childIndex = v, s = a.componentStack, Ea(a), kc(l, a), a.componentStack = s);
  }
  function kc(l, a) {
    var s = a.node, v = a.childIndex;
    if (s !== null) {
      if (typeof s == "object") {
        switch (s.$$typeof) {
          case ke:
            var p = s.type, C = s.key, k = s.props;
            s = k.ref;
            var z = s !== void 0 ? s : null, O = Lu(p), H = C ?? (v === -1 ? 0 : v);
            if (C = [a.keyPath, O, H], a.replay !== null)
              e: {
                var Z = a.replay;
                for (v = Z.nodes, s = 0; s < v.length; s++) {
                  var K = v[s];
                  if (H === K[1]) {
                    if (K.length === 4) {
                      if (O !== null && O !== K[0])
                        throw Error(
                          W(490, K[0], O)
                        );
                      var xe = K[2];
                      O = K[3], H = a.node, a.replay = {
                        nodes: xe,
                        slots: O,
                        pendingTasks: 1
                      };
                      try {
                        if (eo(l, a, C, p, k, z), a.replay.pendingTasks === 1 && 0 < a.replay.nodes.length)
                          throw Error(W(488));
                        a.replay.pendingTasks--;
                      } catch (Qe) {
                        if (typeof Qe == "object" && Qe !== null && (Qe === ve || typeof Qe.then == "function"))
                          throw a.node === H ? a.replay = Z : v.splice(s, 1), Qe;
                        a.replay.pendingTasks--, k = Ol(a.componentStack), C = l, l = a.blockedBoundary, p = Qe, k = dr(C, p, k), Pc(
                          C,
                          l,
                          xe,
                          O,
                          p,
                          k
                        );
                      }
                      a.replay = Z;
                    } else {
                      if (p !== A)
                        throw Error(
                          W(
                            490,
                            "Suspense",
                            Lu(p) || "Unknown"
                          )
                        );
                      n: {
                        Z = void 0, p = K[5], z = K[2], O = K[3], H = K[4] === null ? [] : K[4][2], K = K[4] === null ? null : K[4][3];
                        var we = a.keyPath, bn = a.formatContext, Ve = a.row, yn = a.replay, yt = a.blockedBoundary, $n = a.hoistableState, gr = k.children, ll = k.fallback, Il = /* @__PURE__ */ new Set();
                        k = 2 > a.formatContext.insertionMode ? No(
                          l,
                          a.row,
                          Il,
                          L(),
                          L()
                        ) : No(
                          l,
                          a.row,
                          Il,
                          null,
                          null
                        ), k.parentFlushed = !0, k.rootSegmentID = p, a.blockedBoundary = k, a.hoistableState = k.contentState, a.keyPath = C, a.formatContext = an(
                          l.resumableState,
                          bn
                        ), a.row = null, a.replay = {
                          nodes: z,
                          slots: O,
                          pendingTasks: 1
                        };
                        try {
                          if (Nt(l, a, gr, -1), a.replay.pendingTasks === 1 && 0 < a.replay.nodes.length)
                            throw Error(W(488));
                          if (a.replay.pendingTasks--, k.pendingTasks === 0 && k.status === 0) {
                            k.status = 1, l.completedBoundaries.push(k);
                            break n;
                          }
                        } catch (Qe) {
                          k.status = 4, xe = Ol(a.componentStack), Z = dr(
                            l,
                            Qe,
                            xe
                          ), k.errorDigest = Z, a.replay.pendingTasks--, l.clientRenderedBoundaries.push(k);
                        } finally {
                          a.blockedBoundary = yt, a.hoistableState = $n, a.replay = yn, a.keyPath = we, a.formatContext = bn, a.row = Ve;
                        }
                        xe = bt(
                          l,
                          null,
                          {
                            nodes: H,
                            slots: K,
                            pendingTasks: 0
                          },
                          ll,
                          -1,
                          yt,
                          k.fallbackState,
                          Il,
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
            else eo(l, a, C, p, k, z);
            return;
          case nn:
            throw Error(W(257));
          case ee:
            if (xe = s._init, s = xe(s._payload), l.status === 12) throw null;
            Pr(l, a, s, v);
            return;
        }
        if (Me(s)) {
          Sc(l, a, s, v);
          return;
        }
        if ((xe = Jn(s)) && (xe = xe.call(s))) {
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
          return a.thenableState = null, Pr(l, a, eu(s), v);
        if (s.$$typeof === ie)
          return Pr(
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
      typeof s == "string" ? (v = a.blockedSegment, v !== null && (v.lastPushedText = Ql(
        v.chunks,
        s,
        l.renderState,
        v.lastPushedText
      ))) : (typeof s == "number" || typeof s == "bigint") && (v = a.blockedSegment, v !== null && (v.lastPushedText = Ql(
        v.chunks,
        "" + s,
        l.renderState,
        v.lastPushedText
      )));
    }
  }
  function Sc(l, a, s, v) {
    var p = a.keyPath;
    if (v !== -1 && (a.keyPath = [a.keyPath, "Fragment", v], a.replay !== null)) {
      for (var C = a.replay, k = C.nodes, z = 0; z < k.length; z++) {
        var O = k[z];
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
            var H = a.blockedBoundary, Z = K;
            s = dr(l, Z, s), Pc(
              l,
              H,
              v,
              O,
              Z,
              s
            );
          }
          a.replay = C, k.splice(z, 1);
          break;
        }
      }
      a.keyPath = p;
      return;
    }
    if (C = a.treeContext, k = s.length, a.replay !== null && (z = a.replay.slots, z !== null && typeof z == "object")) {
      for (v = 0; v < k; v++)
        O = s[v], a.treeContext = P(C, k, v), H = z[v], typeof H == "number" ? (no(l, a, H, O, v), delete z[v]) : Nt(l, a, O, v);
      a.treeContext = C, a.keyPath = p;
      return;
    }
    for (z = 0; z < k; z++)
      v = s[z], a.treeContext = P(C, k, z), Nt(l, a, v, z);
    a.treeContext = C, a.keyPath = p;
  }
  function zu(l, a, s) {
    if (s.status = 5, s.rootSegmentID = l.nextSegmentId++, l = s.trackedContentKeyPath, l === null) throw Error(W(486));
    var v = s.trackedFallbackNode, p = [], C = a.workingMap.get(l);
    return C === void 0 ? (s = [
      l[1],
      l[2],
      p,
      null,
      v,
      s.rootSegmentID
    ], a.workingMap.set(l, s), Yu(s, l[0], a), s) : (C[4] = v, C[5] = s.rootSegmentID, C);
  }
  function Hu(l, a, s, v) {
    v.status = 5;
    var p = s.keyPath, C = s.blockedBoundary;
    if (C === null)
      v.id = l.nextSegmentId++, a.rootSlots = v.id, l.completedRootSegment !== null && (l.completedRootSegment.status = 5);
    else {
      if (C !== null && C.status === 0) {
        var k = zu(
          l,
          a,
          C
        );
        if (C.trackedContentKeyPath === p && s.childIndex === -1) {
          v.id === -1 && (v.id = v.parentFlushed ? C.rootSegmentID : l.nextSegmentId++), k[3] = v.id;
          return;
        }
      }
      if (v.id === -1 && (v.id = v.parentFlushed && C !== null ? C.rootSegmentID : l.nextSegmentId++), s.childIndex === -1)
        p === null ? a.rootSlots = v.id : (s = a.workingMap.get(p), s === void 0 ? (s = [p[1], p[2], [], v.id], Yu(s, p[0], a)) : s[3] = v.id);
      else {
        if (p === null) {
          if (l = a.rootSlots, l === null)
            l = a.rootSlots = {};
          else if (typeof l == "number")
            throw Error(W(491));
        } else if (C = a.workingMap, k = C.get(p), k === void 0)
          l = {}, k = [p[1], p[2], [], l], C.set(p, k), Yu(k, p[0], a);
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
  function Bu(l, a, s) {
    return bt(
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
    var v = a.blockedSegment, p = Zr(
      l,
      v.chunks.length,
      null,
      a.formatContext,
      v.lastPushedText,
      !0
    );
    return v.children.push(p), v.lastPushedText = !1, xa(
      l,
      s,
      a.node,
      a.childIndex,
      a.blockedBoundary,
      p,
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
  function Nt(l, a, s, v) {
    var p = a.formatContext, C = a.context, k = a.keyPath, z = a.treeContext, O = a.componentStack, H = a.blockedSegment;
    if (H === null) {
      H = a.replay;
      try {
        return Pr(l, a, s, v);
      } catch (xe) {
        if (Pl(), s = xe === ve ? Ze() : xe, l.status !== 12 && typeof s == "object" && s !== null) {
          if (typeof s.then == "function") {
            v = xe === ve ? Cr() : null, l = Bu(l, a, v).ping, s.then(l, l), a.formatContext = p, a.context = C, a.keyPath = k, a.treeContext = z, a.componentStack = O, a.replay = H, g(C);
            return;
          }
          if (s.message === "Maximum call stack size exceeded") {
            s = xe === ve ? Cr() : null, s = Bu(l, a, s), l.pingedTasks.push(s), a.formatContext = p, a.context = C, a.keyPath = k, a.treeContext = z, a.componentStack = O, a.replay = H, g(C);
            return;
          }
        }
      }
    } else {
      var Z = H.children.length, K = H.chunks.length;
      try {
        return Pr(l, a, s, v);
      } catch (xe) {
        if (Pl(), H.children.length = Z, H.chunks.length = K, s = xe === ve ? Ze() : xe, l.status !== 12 && typeof s == "object" && s !== null) {
          if (typeof s.then == "function") {
            H = s, s = xe === ve ? Cr() : null, l = Uu(l, a, s).ping, H.then(l, l), a.formatContext = p, a.context = C, a.keyPath = k, a.treeContext = z, a.componentStack = O, g(C);
            return;
          }
          if (s.message === "Maximum call stack size exceeded") {
            H = xe === ve ? Cr() : null, H = Uu(l, a, H), l.pingedTasks.push(H), a.formatContext = p, a.context = C, a.keyPath = k, a.treeContext = z, a.componentStack = O, g(C);
            return;
          }
        }
      }
    }
    throw a.formatContext = p, a.context = C, a.keyPath = k, a.treeContext = z, g(C), s;
  }
  function iu(l) {
    var a = l.blockedBoundary, s = l.blockedSegment;
    s !== null && (s.status = 3, _l(this, a, l.row, s));
  }
  function Pc(l, a, s, v, p, C) {
    for (var k = 0; k < s.length; k++) {
      var z = s[k];
      if (z.length === 4)
        Pc(
          l,
          a,
          z[2],
          z[3],
          p,
          C
        );
      else {
        z = z[5];
        var O = l, H = C, Z = No(
          O,
          null,
          /* @__PURE__ */ new Set(),
          null,
          null
        );
        Z.parentFlushed = !0, Z.rootSegmentID = z, Z.status = 4, Z.errorDigest = H, Z.parentFlushed && O.clientRenderedBoundaries.push(Z);
      }
    }
    if (s.length = 0, v !== null) {
      if (a === null) throw Error(W(487));
      if (a.status !== 4 && (a.status = 4, a.errorDigest = C, a.parentFlushed && l.clientRenderedBoundaries.push(a)), typeof v == "object") for (var K in v) delete v[K];
    }
  }
  function Ac(l, a, s) {
    var v = l.blockedBoundary, p = l.blockedSegment;
    if (p !== null) {
      if (p.status === 6) return;
      p.status = 3;
    }
    var C = Ol(l.componentStack);
    if (v === null) {
      if (a.status !== 13 && a.status !== 14) {
        if (v = l.replay, v === null) {
          a.trackedPostpones !== null && p !== null ? (v = a.trackedPostpones, dr(a, s, C), Hu(a, v, l, p), _l(a, null, l.row, p)) : (dr(a, s, C), zo(a, s));
          return;
        }
        v.pendingTasks--, v.pendingTasks === 0 && 0 < v.nodes.length && (p = dr(a, s, C), Pc(
          a,
          null,
          v.nodes,
          v.slots,
          s,
          p
        )), a.pendingRootTasks--, a.pendingRootTasks === 0 && Wu(a);
      }
    } else {
      var k = a.trackedPostpones;
      if (v.status !== 4) {
        if (k !== null && p !== null)
          return dr(a, s, C), Hu(a, k, l, p), v.fallbackAbortableTasks.forEach(function(z) {
            return Ac(z, a, s);
          }), v.fallbackAbortableTasks.clear(), _l(a, v, l.row, p);
        v.status = 4, p = dr(a, s, C), v.status = 4, v.errorDigest = p, lu(a, v), v.parentFlushed && a.clientRenderedBoundaries.push(v);
      }
      v.pendingTasks--, p = v.row, p !== null && --p.pendingTasks === 0 && Sr(a, p), v.fallbackAbortableTasks.forEach(function(z) {
        return Ac(z, a, s);
      }), v.fallbackAbortableTasks.clear();
    }
    l = l.row, l !== null && --l.pendingTasks === 0 && Sr(a, l), a.allPendingTasks--, a.allPendingTasks === 0 && ou(a);
  }
  function au(l, a) {
    try {
      var s = l.renderState, v = s.onHeaders;
      if (v) {
        var p = s.headers;
        if (p) {
          s.headers = null;
          var C = p.preconnects;
          if (p.fontPreloads && (C && (C += ", "), C += p.fontPreloads), p.highImagePreloads && (C && (C += ", "), C += p.highImagePreloads), !a) {
            var k = s.styles.values(), z = k.next();
            e: for (; 0 < p.remainingCapacity && !z.done; z = k.next())
              for (var O = z.value.sheets.values(), H = O.next(); 0 < p.remainingCapacity && !H.done; H = O.next()) {
                var Z = H.value, K = Z.props, xe = K.href, we = Z.props, bn = qc(we.href, "style", {
                  crossOrigin: we.crossOrigin,
                  integrity: we.integrity,
                  nonce: we.nonce,
                  type: we.type,
                  fetchPriority: we.fetchPriority,
                  referrerPolicy: we.referrerPolicy,
                  media: we.media
                });
                if (0 <= (p.remainingCapacity -= bn.length + 2))
                  s.resets.style[xe] = Pt, C && (C += ", "), C += bn, s.resets.style[xe] = typeof K.crossOrigin == "string" || typeof K.integrity == "string" ? [K.crossOrigin, K.integrity] : Pt;
                else break e;
              }
          }
          v(C ? { Link: C } : {});
        }
      }
    } catch (Ve) {
      dr(l, Ve, {});
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
      for (var v = 0, p = 0; p < s.length; p++)
        v += s[p].byteLength;
      a === null ? l.byteSize += v : a.byteSize += v;
    }
  }
  function _l(l, a, s, v) {
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
          s = a.row, s !== null && Qa(s.hoistables, a.contentState), Lt(l, a) || (a.fallbackAbortableTasks.forEach(iu, l), a.fallbackAbortableTasks.clear(), s !== null && --s.pendingTasks === 0 && Sr(l, s)), l.pendingRootTasks === 0 && l.trackedPostpones === null && a.contentPreamble !== null && ri(l);
        else if (a.status === 5 && (a = a.row, a !== null)) {
          if (l.trackedPostpones !== null) {
            s = l.trackedPostpones;
            var p = a.next;
            if (p !== null && (v = p.boundaries, v !== null))
              for (p.boundaries = null, p = 0; p < v.length; p++) {
                var C = v[p];
                zu(l, s, C), _l(l, C, null, null);
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
      Xl.H = wa;
      var v = Xl.A;
      Xl.A = Ec;
      var p = un;
      un = l;
      var C = mr;
      mr = l.resumableState;
      try {
        var k = l.pingedTasks, z;
        for (z = 0; z < k.length; z++) {
          var O = k[z], H = l, Z = O.blockedSegment;
          if (Z === null) {
            var K = H;
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
                O.replay.pendingTasks--, O.abortSet.delete(O), _l(
                  K,
                  O.blockedBoundary,
                  O.row,
                  null
                );
              } catch (Fr) {
                Pl();
                var xe = Fr === ve ? Ze() : Fr;
                if (typeof xe == "object" && xe !== null && typeof xe.then == "function") {
                  var we = O.ping;
                  xe.then(we, we), O.thenableState = Fr === ve ? Cr() : null;
                } else {
                  O.replay.pendingTasks--, O.abortSet.delete(O);
                  var bn = Ol(O.componentStack);
                  H = void 0;
                  var Ve = K, yn = O.blockedBoundary, yt = K.status === 12 ? K.fatalError : xe, $n = O.replay.nodes, gr = O.replay.slots;
                  H = dr(
                    Ve,
                    yt,
                    bn
                  ), Pc(
                    Ve,
                    yn,
                    $n,
                    gr,
                    yt,
                    H
                  ), K.pendingRootTasks--, K.pendingRootTasks === 0 && Wu(K), K.allPendingTasks--, K.allPendingTasks === 0 && ou(K);
                }
              }
            }
          } else if (K = void 0, Ve = Z, Ve.status === 0) {
            Ve.status = 6, g(O.context);
            var ll = Ve.children.length, Il = Ve.chunks.length;
            try {
              kc(H, O), Ve.lastPushedText && Ve.textEmbedded && Ve.chunks.push(We), O.abortSet.delete(O), Ve.status = 1, Ra(H, O.blockedBoundary, Ve), _l(
                H,
                O.blockedBoundary,
                O.row,
                Ve
              );
            } catch (Fr) {
              Pl(), Ve.children.length = ll, Ve.chunks.length = Il;
              var Qe = Fr === ve ? Ze() : H.status === 12 ? H.fatalError : Fr;
              if (H.status === 12 && H.trackedPostpones !== null) {
                var Ar = H.trackedPostpones, _t = Ol(O.componentStack);
                O.abortSet.delete(O), dr(H, Qe, _t), Hu(H, Ar, O, Ve), _l(
                  H,
                  O.blockedBoundary,
                  O.row,
                  Ve
                );
              } else if (typeof Qe == "object" && Qe !== null && typeof Qe.then == "function") {
                Ve.status = 0, O.thenableState = Fr === ve ? Cr() : null;
                var Vr = O.ping;
                Qe.then(Vr, Vr);
              } else {
                var ji = Ol(O.componentStack);
                O.abortSet.delete(O), Ve.status = 4;
                var pt = O.blockedBoundary, lo = O.row;
                if (lo !== null && --lo.pendingTasks === 0 && Sr(H, lo), H.allPendingTasks--, K = dr(
                  H,
                  Qe,
                  ji
                ), pt === null) zo(H, Qe);
                else if (pt.pendingTasks--, pt.status !== 4) {
                  pt.status = 4, pt.errorDigest = K, lu(H, pt);
                  var Dl = pt.row;
                  Dl !== null && --Dl.pendingTasks === 0 && Sr(H, Dl), pt.parentFlushed && H.clientRenderedBoundaries.push(pt), H.pendingRootTasks === 0 && H.trackedPostpones === null && pt.contentPreamble !== null && ri(H);
                }
                H.allPendingTasks === 0 && ou(H);
              }
            }
          }
        }
        k.splice(0, z), l.destination !== null && Bo(l, l.destination);
      } catch (Fr) {
        dr(l, Fr, {}), zo(l, Fr);
      } finally {
        mr = C, Xl.H = s, Xl.A = v, s === wa && g(a), un = p;
      }
    }
  }
  function to(l, a, s) {
    a.preambleChildren.length && s.push(a.preambleChildren);
    for (var v = !1, p = 0; p < a.children.length; p++)
      v = Fc(
        l,
        a.children[p],
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
    var p = v.contentPreamble, C = v.fallbackPreamble;
    if (p === null || C === null) return !1;
    switch (v.status) {
      case 1:
        if (fc(l.renderState, p), l.byteSize += v.byteSize, a = v.completedSegments[0], !a) throw Error(W(391));
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
      ), p = l.renderState.preamble;
      v === !1 || p.headChunks && p.bodyChunks ? l.completedPreambleSegments = a : l.byteSize = s;
    }
  }
  function Ho(l, a, s, v) {
    switch (s.parentFlushed = !0, s.status) {
      case 0:
        s.id = l.nextSegmentId++;
      case 5:
        return v = s.id, s.lastPushedText = !1, s.textEmbedded = !1, l = l.renderState, Q(a, Su), Q(a, l.placeholderPrefix), l = he(v.toString(16)), Q(a, l), de(a, hc);
      case 1:
        s.status = 2;
        var p = !0, C = s.chunks, k = 0;
        s = s.children;
        for (var z = 0; z < s.length; z++) {
          for (p = s[z]; k < p.index; k++)
            Q(a, C[k]);
          p = Oc(l, a, p, v);
        }
        for (; k < C.length - 1; k++)
          Q(a, C[k]);
        return k < C.length && (p = de(a, C[k])), p;
      case 3:
        return !0;
      default:
        throw Error(W(390));
    }
  }
  var Ca = 0;
  function Oc(l, a, s, v) {
    var p = s.boundary;
    if (p === null)
      return Ho(l, a, s, v);
    if (p.parentFlushed = !0, p.status === 4) {
      var C = p.row;
      C !== null && --C.pendingTasks === 0 && Sr(l, C), p = p.errorDigest, de(a, Kt), Q(a, Pu), p && (Q(a, jl), Q(a, he(Ge(p))), Q(
        a,
        Di
      )), de(a, Au), Ho(l, a, s, v);
    } else if (p.status !== 1)
      p.status === 0 && (p.rootSegmentID = l.nextSegmentId++), 0 < p.completedSegments.length && l.partialBoundaries.push(p), Li(
        a,
        l.renderState,
        p.rootSegmentID
      ), v && Qa(v, p.fallbackState), Ho(l, a, s, v);
    else if (!li && Lt(l, p) && (Ca + p.byteSize > l.progressiveChunkSize || Mo(p.contentState)))
      p.rootSegmentID = l.nextSegmentId++, l.completedBoundaries.push(p), Li(
        a,
        l.renderState,
        p.rootSegmentID
      ), Ho(l, a, s, v);
    else {
      if (Ca += p.byteSize, v && Qa(v, p.contentState), s = p.row, s !== null && Lt(l, p) && --s.pendingTasks === 0 && Sr(l, s), de(a, ca), s = p.completedSegments, s.length !== 1) throw Error(W(391));
      Oc(l, a, s[0], v);
    }
    return de(a, jn);
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
    for (var v = s.completedSegments, p = 0; p < v.length; p++)
      ss(
        l,
        a,
        s,
        v[p]
      );
    v.length = 0, v = s.row, v !== null && Lt(l, s) && --v.pendingTasks === 0 && Sr(l, v), El(
      a,
      s.contentState,
      l.renderState
    ), v = l.resumableState, l = l.renderState, p = s.rootSegmentID, s = s.contentState;
    var C = l.stylesToHoist;
    return l.stylesToHoist = !1, Q(a, l.startInlineScript), Q(a, mn), C ? ((v.instructions & 4) === 0 && (v.instructions |= 4, Q(a, ha)), (v.instructions & 2) === 0 && (v.instructions |= 2, Q(a, Fo)), (v.instructions & 8) === 0 ? (v.instructions |= 8, Q(a, jt)) : Q(a, ls)) : ((v.instructions & 2) === 0 && (v.instructions |= 2, Q(a, Fo)), Q(a, Oo)), v = he(p.toString(16)), Q(a, l.boundaryPrefix), Q(a, v), Q(a, fa), Q(a, l.segmentPrefix), Q(a, v), C ? (Q(a, gc), lr(a, s)) : Q(a, Vc), s = de(a, Wi), Ur(a, l) && s;
  }
  function ss(l, a, s, v) {
    if (v.status === 2) return !0;
    var p = s.contentState, C = v.id;
    if (C === -1) {
      if ((v.id = s.rootSegmentID) === -1)
        throw Error(W(392));
      return ma(l, a, v, p);
    }
    return C === s.rootSegmentID ? ma(l, a, v, p) : (ma(l, a, v, p), s = l.resumableState, l = l.renderState, Q(a, l.startInlineScript), Q(a, mn), (s.instructions & 1) === 0 ? (s.instructions |= 1, Q(a, Fu)) : Q(a, Ou), Q(a, l.segmentPrefix), C = he(C.toString(16)), Q(a, C), Q(a, _u), Q(a, l.placeholderPrefix), Q(a, C), a = de(a, Ao), a);
  }
  var li = !1;
  function Bo(l, a) {
    nt = new Uint8Array(2048), Pe = 0;
    try {
      if (!(0 < l.pendingRootTasks)) {
        var s, v = l.completedRootSegment;
        if (v !== null) {
          if (v.status === 5) return;
          var p = l.completedPreambleSegments;
          if (p === null) return;
          Ca = l.byteSize;
          var C = l.resumableState, k = l.renderState, z = k.preamble, O = z.htmlChunks, H = z.headChunks, Z;
          if (O) {
            for (Z = 0; Z < O.length; Z++)
              Q(a, O[Z]);
            if (H)
              for (Z = 0; Z < H.length; Z++)
                Q(a, H[Z]);
            else
              Q(a, Zt("head")), Q(a, mn);
          } else if (H)
            for (Z = 0; Z < H.length; Z++)
              Q(a, H[Z]);
          var K = k.charsetChunks;
          for (Z = 0; Z < K.length; Z++)
            Q(a, K[Z]);
          K.length = 0, k.preconnects.forEach(lt, a), k.preconnects.clear();
          var xe = k.viewportChunks;
          for (Z = 0; Z < xe.length; Z++)
            Q(a, xe[Z]);
          xe.length = 0, k.fontPreloads.forEach(lt, a), k.fontPreloads.clear(), k.highImagePreloads.forEach(lt, a), k.highImagePreloads.clear(), $r = k, k.styles.forEach(wc, a), $r = null;
          var we = k.importMapChunks;
          for (Z = 0; Z < we.length; Z++)
            Q(a, we[Z]);
          we.length = 0, k.bootstrapScripts.forEach(lt, a), k.scripts.forEach(lt, a), k.scripts.clear(), k.bulkPreloads.forEach(lt, a), k.bulkPreloads.clear(), O || H || (C.instructions |= 32);
          var bn = k.hoistableChunks;
          for (Z = 0; Z < bn.length; Z++)
            Q(a, bn[Z]);
          for (C = bn.length = 0; C < p.length; C++) {
            var Ve = p[C];
            for (k = 0; k < Ve.length; k++)
              Oc(l, a, Ve[k], null);
          }
          var yn = l.renderState.preamble, yt = yn.headChunks;
          (yn.htmlChunks || yt) && Q(a, bi("head"));
          var $n = yn.bodyChunks;
          if ($n)
            for (p = 0; p < $n.length; p++)
              Q(a, $n[p]);
          Oc(l, a, v, null), l.completedRootSegment = null;
          var gr = l.renderState;
          if (l.allPendingTasks !== 0 || l.clientRenderedBoundaries.length !== 0 || l.completedBoundaries.length !== 0 || l.trackedPostpones !== null && (l.trackedPostpones.rootNodes.length !== 0 || l.trackedPostpones.rootSlots !== null)) {
            var ll = l.resumableState;
            if ((ll.instructions & 64) === 0) {
              if (ll.instructions |= 64, Q(a, gr.startInlineScript), (ll.instructions & 32) === 0) {
                ll.instructions |= 32;
                var Il = "_" + ll.idPrefix + "R_";
                Q(a, kn), Q(
                  a,
                  he(Ge(Il))
                ), Q(a, Yn);
              }
              Q(a, mn), Q(a, Kl), de(a, vn);
            }
          }
          Ur(a, gr);
        }
        var Qe = l.renderState;
        v = 0;
        var Ar = Qe.viewportChunks;
        for (v = 0; v < Ar.length; v++)
          Q(a, Ar[v]);
        Ar.length = 0, Qe.preconnects.forEach(lt, a), Qe.preconnects.clear(), Qe.fontPreloads.forEach(lt, a), Qe.fontPreloads.clear(), Qe.highImagePreloads.forEach(
          lt,
          a
        ), Qe.highImagePreloads.clear(), Qe.styles.forEach(it, a), Qe.scripts.forEach(lt, a), Qe.scripts.clear(), Qe.bulkPreloads.forEach(lt, a), Qe.bulkPreloads.clear();
        var _t = Qe.hoistableChunks;
        for (v = 0; v < _t.length; v++)
          Q(a, _t[v]);
        _t.length = 0;
        var Vr = l.clientRenderedBoundaries;
        for (s = 0; s < Vr.length; s++) {
          var ji = Vr[s];
          Qe = a;
          var pt = l.resumableState, lo = l.renderState, Dl = ji.rootSegmentID, Fr = ji.errorDigest;
          Q(
            Qe,
            lo.startInlineScript
          ), Q(Qe, mn), (pt.instructions & 4) === 0 ? (pt.instructions |= 4, Q(Qe, _o)) : Q(Qe, ei), Q(Qe, lo.boundaryPrefix), Q(Qe, he(Dl.toString(16))), Q(Qe, da), Fr && (Q(
            Qe,
            ga
          ), Q(
            Qe,
            he(
              Ya(Fr || "")
            )
          ));
          var ii = de(
            Qe,
            Mu
          );
          if (!ii) {
            l.destination = null, s++, Vr.splice(0, s);
            return;
          }
        }
        Vr.splice(0, s);
        var Or = l.completedBoundaries;
        for (s = 0; s < Or.length; s++)
          if (!us(l, a, Or[s])) {
            l.destination = null, s++, Or.splice(0, s);
            return;
          }
        Or.splice(0, s), Tr(a), nt = new Uint8Array(2048), Pe = 0, li = !0;
        var io = l.partialBoundaries;
        for (s = 0; s < io.length; s++) {
          var Wo = io[s];
          e: {
            Vr = l, ji = a, Ca = Wo.byteSize;
            var Qr = Wo.completedSegments;
            for (ii = 0; ii < Qr.length; ii++)
              if (!ss(
                Vr,
                ji,
                Wo,
                Qr[ii]
              )) {
                ii++, Qr.splice(0, ii);
                var Yo = !1;
                break e;
              }
            Qr.splice(0, ii);
            var _r = Wo.row;
            _r !== null && _r.together && Wo.pendingTasks === 1 && (_r.pendingTasks === 1 ? Nu(
              Vr,
              _r,
              _r.hoistables
            ) : _r.pendingTasks--), Yo = El(
              ji,
              Wo.contentState,
              Vr.renderState
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
      li = !1, l.allPendingTasks === 0 && l.clientRenderedBoundaries.length === 0 && l.completedBoundaries.length === 0 ? (l.flushScheduled = !1, s = l.resumableState, s.hasBody && Q(a, bi("body")), s.hasHtml && Q(a, bi("html")), Tr(a), l.status = 14, a.close(), l.destination = null) : Tr(a);
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
      a ? Bo(l, a) : l.flushScheduled = !1;
    }));
  }
  function ro(l, a) {
    if (l.status === 13)
      l.status = 14, pe(a, l.fatalError);
    else if (l.status !== 14 && l.destination === null) {
      l.destination = a;
      try {
        Bo(l, a);
      } catch (s) {
        dr(l, s, {}), zo(l, s);
      }
    }
  }
  function Ml(l, a) {
    (l.status === 11 || l.status === 10) && (l.status = 12);
    try {
      var s = l.abortableTasks;
      if (0 < s.size) {
        var v = a === void 0 ? Error(W(432)) : typeof a == "object" && a !== null && typeof a.then == "function" ? Error(W(530)) : a;
        l.fatalError = v, s.forEach(function(p) {
          return Ac(p, l, v);
        }), s.clear();
      }
      l.destination !== null && Bo(l, l.destination);
    } catch (p) {
      dr(l, p, {}), zo(l, p);
    }
  }
  function Yu(l, a, s) {
    if (a === null) s.rootNodes.push(l);
    else {
      var v = s.workingMap, p = v.get(a);
      p === void 0 && (p = [a[1], a[2], [], null], v.set(a, p), Yu(p, a[0], s)), p[2].push(l);
    }
  }
  function fs(l) {
    var a = l.trackedPostpones;
    if (a === null || a.rootNodes.length === 0 && a.rootSlots === null)
      return l.trackedPostpones = null;
    if (l.completedRootSegment === null || l.completedRootSegment.status !== 5 && l.completedPreambleSegments !== null) {
      var s = l.nextSegmentId, v = a.rootSlots, p = l.resumableState;
      p.bootstrapScriptContent = void 0, p.bootstrapScripts = void 0, p.bootstrapModules = void 0;
    } else {
      s = 0, v = -1, p = l.resumableState;
      var C = l.renderState;
      p.nextFormID = 0, p.hasBody = !1, p.hasHtml = !1, p.unknownResources = { font: C.resets.font }, p.dnsResources = C.resets.dns, p.connectResources = C.resets.connect, p.imageResources = C.resets.image, p.styleResources = C.resets.style, p.scriptResources = {}, p.moduleUnknownResources = {}, p.moduleScriptResources = {}, p.instructions = 0;
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
    var l = fe.version;
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
      var p = a ? a.onHeaders : void 0, C;
      p && (C = function(Z) {
        p(new Headers(Z));
      });
      var k = R(
        a ? a.identifierPrefix : void 0,
        a ? a.unstable_externalRuntimeSrc : void 0,
        a ? a.bootstrapScriptContent : void 0,
        a ? a.bootstrapScripts : void 0,
        a ? a.bootstrapModules : void 0
      ), z = ja(
        l,
        k,
        bl(
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
                ro(z, K);
              },
              cancel: function(K) {
                z.destination = null, Ml(z, K);
              }
            },
            { highWaterMark: 0 }
          );
          Z = { postponed: fs(z), prelude: Z }, s(Z);
        },
        void 0,
        void 0,
        v,
        a ? a.onPostpone : void 0
      );
      if (a && a.signal) {
        var O = a.signal;
        if (O.aborted) Ml(z, O.reason);
        else {
          var H = function() {
            Ml(z, O.reason), O.removeEventListener("abort", H);
          };
          O.addEventListener("abort", H);
        }
      }
      ml(z);
    });
  }, Ys.renderToReadableStream = function(l, a) {
    return new Promise(function(s, v) {
      var p, C, k = new Promise(function(we, bn) {
        C = we, p = bn;
      }), z = a ? a.onHeaders : void 0, O;
      z && (O = function(we) {
        z(new Headers(we));
      });
      var H = R(
        a ? a.identifierPrefix : void 0,
        a ? a.unstable_externalRuntimeSrc : void 0,
        a ? a.bootstrapScriptContent : void 0,
        a ? a.bootstrapScripts : void 0,
        a ? a.bootstrapModules : void 0
      ), Z = Lo(
        l,
        H,
        bl(
          H,
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
          var we = new ReadableStream(
            {
              type: "bytes",
              pull: function(bn) {
                ro(Z, bn);
              },
              cancel: function(bn) {
                Z.destination = null, Ml(Z, bn);
              }
            },
            { highWaterMark: 0 }
          );
          we.allReady = k, s(we);
        },
        function(we) {
          k.catch(function() {
          }), v(we);
        },
        p,
        a ? a.onPostpone : void 0,
        a ? a.formState : void 0
      );
      if (a && a.signal) {
        var K = a.signal;
        if (K.aborted) Ml(Z, K.reason);
        else {
          var xe = function() {
            Ml(Z, K.reason), K.removeEventListener("abort", xe);
          };
          K.addEventListener("abort", xe);
        }
      }
      ml(Z);
    });
  }, Ys.resume = function(l, a, s) {
    return new Promise(function(v, p) {
      var C, k, z = new Promise(function(K, xe) {
        k = K, C = xe;
      }), O = Ot(
        l,
        a,
        bl(
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
                O.destination = null, Ml(O, xe);
              }
            },
            { highWaterMark: 0 }
          );
          K.allReady = z, v(K);
        },
        function(K) {
          z.catch(function() {
          }), p(K);
        },
        C,
        s ? s.onPostpone : void 0
      );
      if (s && s.signal) {
        var H = s.signal;
        if (H.aborted) Ml(O, H.reason);
        else {
          var Z = function() {
            Ml(O, H.reason), H.removeEventListener("abort", Z);
          };
          H.addEventListener("abort", Z);
        }
      }
      ml(O);
    });
  }, Ys.resumeAndPrerender = function(l, a, s) {
    return new Promise(function(v, p) {
      var C = Cl(
        l,
        a,
        bl(
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
              pull: function(H) {
                ro(C, H);
              },
              cancel: function(H) {
                C.destination = null, Ml(C, H);
              }
            },
            { highWaterMark: 0 }
          );
          O = { postponed: fs(C), prelude: O }, v(O);
        },
        void 0,
        void 0,
        p,
        s ? s.onPostpone : void 0
      );
      if (s && s.signal) {
        var k = s.signal;
        if (k.aborted) Ml(C, k.reason);
        else {
          var z = function() {
            Ml(C, k.reason), k.removeEventListener("abort", z);
          };
          k.addEventListener("abort", z);
        }
      }
      ml(C);
    });
  }, Ys.version = "19.2.6", Ys;
}
var lf = {};
var Zf;
function ch() {
  return Zf || (Zf = 1, process.env.NODE_ENV !== "production" && (function() {
    function fe(n, r, u, d) {
      return "" + r + (u === "s" ? "\\73 " : "\\53 ") + d;
    }
    function ce(n, r, u, d) {
      return "" + r + (u === "s" ? "\\u0073" : "\\u0053") + d;
    }
    function W(n) {
      return n === null || typeof n != "object" ? null : (n = yc && n[yc] || n["@@iterator"], typeof n == "function" ? n : null);
    }
    function ke(n) {
      return n = Object.prototype.toString.call(n), n.slice(8, n.length - 1);
    }
    function nn(n) {
      var r = JSON.stringify(n);
      return '"' + n + '"' === r ? n : r;
    }
    function ye(n) {
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
      var d = -1, y = 0;
      if (Yi(n))
        if (wc.has(n)) {
          var E = wc.get(n);
          u = "<" + Oe(E) + ">";
          for (var F = 0; F < n.length; F++) {
            var I = n[F];
            I = typeof I == "string" ? I : typeof I == "object" && I !== null ? "{" + Tn(I) + "}" : "{" + ye(I) + "}", "" + F === r ? (d = u.length, y = I.length, u += I) : u = 15 > I.length && 40 > u.length + I.length ? u + I : u + "{...}";
          }
          u += "</" + Oe(E) + ">";
        } else {
          for (u = "[", E = 0; E < n.length; E++)
            0 < E && (u += ", "), F = n[E], F = typeof F == "object" && F !== null ? Tn(F) : ye(F), "" + E === r ? (d = u.length, y = F.length, u += F) : u = 10 > F.length && 40 > u.length + F.length ? u + F : u + "...";
          u += "]";
        }
      else if (n.$$typeof === Ya)
        u = "<" + Oe(n.type) + "/>";
      else {
        if (n.$$typeof === Xr) return "client";
        if (pc.has(n)) {
          for (u = pc.get(n), u = "<" + (Oe(u) || "..."), E = Object.keys(n), F = 0; F < E.length; F++) {
            u += " ", I = E[F], u += nn(I) + "=";
            var te = n[I], B = I === r && typeof te == "object" && te !== null ? Tn(te) : ye(te);
            typeof te != "string" && (B = "{" + B + "}"), I === r ? (d = u.length, y = B.length, u += B) : u = 10 > B.length && 40 > u.length + B.length ? u + B : u + "...";
          }
          u += ">";
        } else {
          for (u = "{", E = Object.keys(n), F = 0; F < E.length; F++)
            0 < F && (u += ", "), I = E[F], u += nn(I) + ": ", te = n[I], te = typeof te == "object" && te !== null ? Tn(te) : ye(te), I === r ? (d = u.length, y = te.length, u += te) : u = 10 > te.length && 40 > u.length + te.length ? u + te : u + "...";
          u += "}";
        }
      }
      return r === void 0 ? u : -1 < d && 0 < y ? (n = " ".repeat(d) + "^".repeat(y), `
  ` + u + `
  ` + n) : `
  ` + u;
    }
    function Re(n, r) {
      var u = n.length & 3, d = n.length - u, y = r;
      for (r = 0; r < d; ) {
        var E = n.charCodeAt(r) & 255 | (n.charCodeAt(++r) & 255) << 8 | (n.charCodeAt(++r) & 255) << 16 | (n.charCodeAt(++r) & 255) << 24;
        ++r, E = 3432918353 * (E & 65535) + ((3432918353 * (E >>> 16) & 65535) << 16) & 4294967295, E = E << 15 | E >>> 17, E = 461845907 * (E & 65535) + ((461845907 * (E >>> 16) & 65535) << 16) & 4294967295, y ^= E, y = y << 13 | y >>> 19, y = 5 * (y & 65535) + ((5 * (y >>> 16) & 65535) << 16) & 4294967295, y = (y & 65535) + 27492 + (((y >>> 16) + 58964 & 65535) << 16);
      }
      switch (E = 0, u) {
        case 3:
          E ^= (n.charCodeAt(r + 2) & 255) << 16;
        case 2:
          E ^= (n.charCodeAt(r + 1) & 255) << 8;
        case 1:
          E ^= n.charCodeAt(r) & 255, E = 3432918353 * (E & 65535) + ((3432918353 * (E >>> 16) & 65535) << 16) & 4294967295, E = E << 15 | E >>> 17, y ^= 461845907 * (E & 65535) + ((461845907 * (E >>> 16) & 65535) << 16) & 4294967295;
      }
      return y ^= n.length, y ^= y >>> 16, y = 2246822507 * (y & 65535) + ((2246822507 * (y >>> 16) & 65535) << 16) & 4294967295, y ^= y >>> 13, y = 3266489909 * (y & 65535) + ((3266489909 * (y >>> 16) & 65535) << 16) & 4294967295, (y ^ y >>> 16) >>> 0;
    }
    function ie(n) {
      return typeof Symbol == "function" && Symbol.toStringTag && n[Symbol.toStringTag] || n.constructor.name || "Object";
    }
    function Be(n) {
      try {
        return A(n), !1;
      } catch {
        return !0;
      }
    }
    function A(n) {
      return "" + n;
    }
    function D(n, r) {
      if (Be(n))
        return console.error(
          "The provided `%s` attribute is an unsupported type %s. This value must be coerced to a string before using it here.",
          r,
          ie(n)
        ), A(n);
    }
    function Ae(n, r) {
      if (Be(n))
        return console.error(
          "The provided `%s` CSS property is an unsupported type %s. This value must be coerced to a string before using it here.",
          r,
          ie(n)
        ), A(n);
    }
    function ee(n) {
      if (Be(n))
        return console.error(
          "The provided HTML markup uses a value of unsupported type %s. This value must be coerced to a string before using it here.",
          ie(n)
        ), A(n);
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
      if (Du.test(r)) {
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
      r = u.map(function(y) {
        return "`" + y + "`";
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
      var y = r.toLowerCase();
      if (y === "onfocusin" || y === "onfocusout")
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
      if (y === "innerhtml")
        return console.error(
          "Directly setting property `innerHTML` is not permitted. For more information, lookup documentation on `dangerouslySetInnerHTML`."
        ), fr[r] = !0;
      if (y === "aria")
        return console.error(
          "The `aria` attribute is reserved for future use in React. Pass individual `aria-` attributes instead."
        ), fr[r] = !0;
      if (y === "is" && u !== null && u !== void 0 && typeof u != "string")
        return console.error(
          "Received a `%s` for a string attribute `is`. If this is expected, cast the value to a string.",
          typeof u
        ), fr[r] = !0;
      if (typeof u == "number" && isNaN(u))
        return console.error(
          "Received NaN for the `%s` attribute. If this is expected, cast the value to a string.",
          r
        ), fr[r] = !0;
      if (Tc.hasOwnProperty(y)) {
        if (y = Tc[y], y !== r)
          return console.error(
            "Invalid DOM property `%s`. Did you mean `%s`?",
            r,
            y
          ), fr[r] = !0;
      } else if (r !== y)
        return console.error(
          "React does not recognize the `%s` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `%s` instead. If you accidentally passed it from a parent component, remove it from the DOM element.",
          r,
          y
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
              return y = r.toLowerCase().slice(0, 5), y === "data-" || y === "aria-" ? !0 : (u ? console.error(
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
    function Br(n, r, u) {
      var d = [], y;
      for (y in r)
        Gl(n, y, r[y]) || d.push(y);
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
    function Jn(n) {
      return n.replace(ir, function(r, u) {
        return u.toUpperCase();
      });
    }
    function Me(n) {
      if (typeof n == "boolean" || typeof n == "number" || typeof n == "bigint")
        return "" + n;
      ee(n), n = "" + n;
      var r = $c.exec(n);
      if (r) {
        var u = "", d, y = 0;
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
          y !== d && (u += n.slice(y, d)), y = d + 1, u += r;
        }
        n = y !== d ? u + n.slice(y, d) : u;
      }
      return n;
    }
    function Je(n) {
      return Cs.test("" + n) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : n;
    }
    function Et(n) {
      return ee(n), ("" + n).replace(ve, ce);
    }
    function rn(n, r, u, d, y) {
      return {
        idPrefix: n === void 0 ? "" : n,
        nextFormID: 0,
        streamingFormat: 0,
        bootstrapScriptContent: u,
        bootstrapScripts: d,
        bootstrapModules: y,
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
          return Kn(He, null, d | 1, null);
        case "select":
          return Kn(
            He,
            u.value != null ? u.value : u.defaultValue,
            d,
            null
          );
        case "svg":
          return Kn(Xe, null, d, null);
        case "picture":
          return Kn(He, null, d | 2, null);
        case "math":
          return Kn(at, null, d, null);
        case "foreignObject":
          return Kn(He, null, d, null);
        case "table":
          return Kn(cn, null, d, null);
        case "thead":
        case "tbody":
        case "tfoot":
          return Kn(
            pn,
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
            _n,
            null,
            d,
            null
          );
        case "head":
          if (n.insertionMode < He)
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
      return n.insertionMode >= cn || n.insertionMode < He ? Kn(He, null, d, null) : n.tagScope !== d ? Kn(
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
    function Pe(n, r) {
      if (typeof r != "object")
        throw Error(
          "The `style` prop expects a mapping from style properties to values, not a string. For example, style={{marginRight: spacing + 'em'}} when using JSX."
        );
      var u = !0, d;
      for (d in r)
        if (kn.call(r, d)) {
          var y = r[d];
          if (y != null && typeof y != "boolean" && y !== "") {
            if (d.indexOf("--") === 0) {
              var E = Me(d);
              Ae(y, d), y = Me(("" + y).trim());
            } else {
              E = d;
              var F = y;
              if (-1 < E.indexOf("-")) {
                var I = E;
                qn.hasOwnProperty(I) && qn[I] || (qn[I] = !0, console.error(
                  "Unsupported style property %s. Did you mean %s?",
                  I,
                  Jn(I.replace(hr, "ms-"))
                ));
              } else if (Va.test(E))
                I = E, qn.hasOwnProperty(I) && qn[I] || (qn[I] = !0, console.error(
                  "Unsupported vendor-prefixed style property %s. Did you mean %s?",
                  I,
                  I.charAt(0).toUpperCase() + I.slice(1)
                ));
              else if (ya.test(F)) {
                I = E;
                var te = F;
                Hn.hasOwnProperty(te) && Hn[te] || (Hn[te] = !0, console.error(
                  `Style property values shouldn't contain a semicolon. Try "%s: %s" instead.`,
                  I,
                  te.replace(
                    ya,
                    ""
                  )
                ));
              }
              typeof F == "number" && (isNaN(F) ? Qa || (Qa = !0, console.error(
                "`NaN` is an invalid value for the `%s` css style property.",
                E
              )) : isFinite(F) || Mo || (Mo = !0, console.error(
                "`Infinity` is an invalid value for the `%s` css style property.",
                E
              ))), E = d, F = vt.get(E), F !== void 0 || (F = Me(
                E.replace(Io, "-$1").toLowerCase().replace(Lu, "-ms-")
              ), vt.set(E, F)), E = F, typeof y == "number" ? y = y === 0 || ba.has(d) ? "" + y : y + "px" : (Ae(y, d), y = Me(
                ("" + y).trim()
              ));
            }
            u ? (u = !1, n.push(
              Sn,
              E,
              Rr,
              y
            )) : n.push(In, E, Rr, y);
          }
        }
      u || n.push(qe);
    }
    function Q(n, r, u) {
      u && typeof u != "function" && typeof u != "symbol" && n.push(En, r, An);
    }
    function de(n, r, u) {
      typeof u != "function" && typeof u != "symbol" && typeof u != "boolean" && n.push(
        En,
        r,
        Pn,
        Me(u),
        qe
      );
    }
    function Tr(n, r) {
      this.push('<input type="hidden"'), vl(n), de(this, "name", r), de(this, "value", n), this.push(pa);
    }
    function vl(n) {
      if (typeof n != "string")
        throw Error(
          "File/Blob fields are not yet supported in progressive forms. Will fallback to client hydration."
        );
    }
    function he(n, r) {
      if (typeof r.$$FORM_ACTION == "function") {
        var u = n.nextFormID++;
        n = n.idPrefix + u;
        try {
          var d = r.$$FORM_ACTION(n);
          if (d) {
            var y = d.data;
            y?.forEach(vl);
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
    function T(n, r, u, d, y, E, F, I) {
      var te = null;
      if (typeof d == "function") {
        I === null || Ja || (Ja = !0, console.error(
          'Cannot specify a "name" prop for a button that specifies a function as a formAction. React needs it to encode which action should be invoked. It will get overridden.'
        )), y === null && E === null || xc || (xc = !0, console.error(
          "Cannot specify a formEncType or formMethod for a button that specifies a function as a formAction. React provides those automatically. They will get overridden."
        )), F === null || Ka || (Ka = !0, console.error(
          "Cannot specify a formTarget for a button that specifies a function as a formAction. The function will always be executed in the same window."
        ));
        var B = he(r, d);
        B !== null ? (I = B.name, d = B.action || "", y = B.encType, E = B.method, F = B.target, te = B.data) : (n.push(
          En,
          "formAction",
          Pn,
          qt,
          qe
        ), F = E = y = d = I = null, Ne(r, u));
      }
      return I != null && Y(n, "name", I), d != null && Y(n, "formAction", d), y != null && Y(n, "formEncType", y), E != null && Y(n, "formMethod", E), F != null && Y(n, "formTarget", F), te;
    }
    function Y(n, r, u) {
      switch (r) {
        case "className":
          de(n, "class", u);
          break;
        case "tabIndex":
          de(n, "tabindex", u);
          break;
        case "dir":
        case "role":
        case "viewBox":
        case "width":
        case "height":
          de(n, r, u);
          break;
        case "style":
          Pe(n, u);
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
          D(u, r), u = Je("" + u), n.push(
            En,
            r,
            Pn,
            Me(u),
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
          Q(n, r.toLowerCase(), u);
          break;
        case "xlinkHref":
          if (typeof u == "function" || typeof u == "symbol" || typeof u == "boolean")
            break;
          D(u, r), u = Je("" + u), n.push(
            En,
            "xlink:href",
            Pn,
            Me(u),
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
            Pn,
            Me(u),
            qe
          );
          break;
        case "inert":
          u !== "" || De[r] || (De[r] = !0, console.error(
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
          u && typeof u != "function" && typeof u != "symbol" && n.push(En, r, An);
          break;
        case "capture":
        case "download":
          u === !0 ? n.push(En, r, An) : u !== !1 && typeof u != "function" && typeof u != "symbol" && n.push(
            En,
            r,
            Pn,
            Me(u),
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
            Pn,
            Me(u),
            qe
          );
          break;
        case "rowSpan":
        case "start":
          typeof u == "function" || typeof u == "symbol" || isNaN(u) || n.push(
            En,
            r,
            Pn,
            Me(u),
            qe
          );
          break;
        case "xlinkActuate":
          de(n, "xlink:actuate", u);
          break;
        case "xlinkArcrole":
          de(n, "xlink:arcrole", u);
          break;
        case "xlinkRole":
          de(n, "xlink:role", u);
          break;
        case "xlinkShow":
          de(n, "xlink:show", u);
          break;
        case "xlinkTitle":
          de(n, "xlink:title", u);
          break;
        case "xlinkType":
          de(n, "xlink:type", u);
          break;
        case "xmlBase":
          de(n, "xml:base", u);
          break;
        case "xmlLang":
          de(n, "xml:lang", u);
          break;
        case "xmlSpace":
          de(n, "xml:space", u);
          break;
        default:
          if ((!(2 < r.length) || r[0] !== "o" && r[0] !== "O" || r[1] !== "n" && r[1] !== "N") && (r = Iu.get(r) || r, X(r))) {
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
              Pn,
              Me(u),
              qe
            );
          }
      }
    }
    function pe(n, r, u) {
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
      return Mu.Children.forEach(n, function(u) {
        u != null && (r += u, Fl || typeof u == "string" || typeof u == "number" || typeof u == "bigint" || (Fl = !0, console.error(
          "Cannot infer the option value of complex children. Pass a `value` prop or use a plain string as children to <option>."
        )));
      }), r;
    }
    function Ne(n, r) {
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
      return n.push(pa), null;
    }
    function Rt(n) {
      return ee(n), ("" + n).replace(Do, fe);
    }
    function Rn(n, r, u) {
      n.push(mt(u));
      for (var d in r)
        if (kn.call(r, d)) {
          var y = r[d];
          if (y != null)
            switch (d) {
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(
                  u + " is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
                );
              default:
                Y(n, d, y);
            }
        }
      return n.push(pa), null;
    }
    function tt(n, r) {
      n.push(mt("title"));
      var u = null, d = null, y;
      for (y in r)
        if (kn.call(r, y)) {
          var E = r[y];
          if (E != null)
            switch (y) {
              case "children":
                u = E;
                break;
              case "dangerouslySetInnerHTML":
                d = E;
                break;
              default:
                Y(n, y, E);
            }
        }
      return n.push(sn), r = Array.isArray(u) ? 2 > u.length ? u[0] : null : u, typeof r != "function" && typeof r != "symbol" && r !== null && r !== void 0 && n.push(Me("" + r)), pe(n, d, u), n.push(St("title")), null;
    }
    function Ct(n, r) {
      n.push(mt("script"));
      var u = null, d = null, y;
      for (y in r)
        if (kn.call(r, y)) {
          var E = r[y];
          if (E != null)
            switch (y) {
              case "children":
                u = E;
                break;
              case "dangerouslySetInnerHTML":
                d = E;
                break;
              default:
                Y(n, y, E);
            }
        }
      return n.push(sn), u != null && typeof u != "string" && (r = typeof u == "number" ? "a number for children" : Array.isArray(u) ? "an array for children" : "something unexpected for children", console.error(
        "A script element was rendered with %s. If script element has children it must be a single string. Consider using dangerouslySetInnerHTML or passing a plain string as children.",
        r
      )), pe(n, d, u), typeof u == "string" && n.push(Et(u)), n.push(St("script")), null;
    }
    function Ia(n, r, u) {
      n.push(mt(u));
      var d = u = null, y;
      for (y in r)
        if (kn.call(r, y)) {
          var E = r[y];
          if (E != null)
            switch (y) {
              case "children":
                u = E;
                break;
              case "dangerouslySetInnerHTML":
                d = E;
                break;
              default:
                Y(n, y, E);
            }
        }
      return n.push(sn), pe(n, d, u), u;
    }
    function Ge(n, r, u) {
      n.push(mt(u));
      var d = u = null, y;
      for (y in r)
        if (kn.call(r, y)) {
          var E = r[y];
          if (E != null)
            switch (y) {
              case "children":
                u = E;
                break;
              case "dangerouslySetInnerHTML":
                d = E;
                break;
              default:
                Y(n, y, E);
            }
        }
      return n.push(sn), pe(n, d, u), typeof u == "string" ? (n.push(Me(u)), null) : u;
    }
    function mt(n) {
      var r = Ec.get(n);
      if (r === void 0) {
        if (!mr.test(n)) throw Error("Invalid tag: " + n);
        r = "<" + n, Ec.set(n, r);
      }
      return r;
    }
    function xn(n, r, u, d, y, E, F, I, te) {
      Yt(r, u), r !== "input" && r !== "textarea" && r !== "select" || u == null || u.value !== null || xi || (xi = !0, r === "select" && u.multiple ? console.error(
        "`value` prop on `%s` should not be null. Consider using an empty array when `multiple` is set to `true` to clear the component or `undefined` for uncontrolled components.",
        r
      ) : console.error(
        "`value` prop on `%s` should not be null. Consider using an empty string to clear the component or `undefined` for uncontrolled components.",
        r
      ));
      e: if (r.indexOf("-") === -1) var B = !1;
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
            B = !1;
            break e;
          default:
            B = !0;
        }
      switch (B || typeof u.is == "string" || Br(r, u), !u.suppressContentEditableWarning && u.contentEditable && u.children != null && console.error(
        "A component is `contentEditable` and contains `children` managed by React. It is now your responsibility to guarantee that none of those nodes are unexpectedly modified or duplicated. This is probably not intentional."
      ), I.insertionMode !== Xe && I.insertionMode !== at && r.indexOf("-") === -1 && r.toLowerCase() !== r && console.error(
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
              var be = u[Ce];
              if (be != null)
                switch (Ce) {
                  case "children":
                    j = be;
                    break;
                  case "dangerouslySetInnerHTML":
                    ge = be;
                    break;
                  case "href":
                    be === "" ? de(n, "href", "") : Y(n, Ce, be);
                    break;
                  default:
                    Y(n, Ce, be);
                }
            }
          if (n.push(sn), pe(n, ge, j), typeof j == "string") {
            n.push(Me(j));
            var ae = null;
          } else ae = j;
          return ae;
        case "g":
        case "p":
        case "li":
          break;
        case "select":
          ft("select", u), Te(u, "value"), Te(u, "defaultValue"), u.value === void 0 || u.defaultValue === void 0 || Pl || (console.error(
            "Select elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled select element and remove one of these props. More info: https://react.dev/link/controlled-components"
          ), Pl = !0), n.push(mt("select"));
          var fn = null, Qn = null, Ye;
          for (Ye in u)
            if (kn.call(u, Ye)) {
              var Fn = u[Ye];
              if (Fn != null)
                switch (Ye) {
                  case "children":
                    fn = Fn;
                    break;
                  case "dangerouslySetInnerHTML":
                    Qn = Fn;
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
          return n.push(sn), pe(n, Qn, fn), fn;
        case "option":
          var vr = I.selectedValue;
          n.push(mt("option"));
          var br = null, Mn = null, $t = null, ki = null, Jr;
          for (Jr in u)
            if (kn.call(u, Jr)) {
              var _e = u[Jr];
              if (_e != null)
                switch (Jr) {
                  case "children":
                    br = _e;
                    break;
                  case "selected":
                    $t = _e, Vi || (console.error(
                      "Use the `defaultValue` or `value` props on <select> instead of setting `selected` on <option>."
                    ), Vi = !0);
                    break;
                  case "dangerouslySetInnerHTML":
                    ki = _e;
                    break;
                  case "value":
                    Mn = _e;
                  default:
                    Y(
                      n,
                      Jr,
                      _e
                    );
                }
            }
          if (vr != null) {
            if (Mn !== null) {
              D(Mn, "value");
              var Bn = "" + Mn;
            } else
              ki === null || Ei || (Ei = !0, console.error(
                "Pass a `value` prop if you set dangerouslyInnerHTML so React knows which value should be selected."
              )), Bn = me(br);
            if (Yi(vr)) {
              for (var Un = 0; Un < vr.length; Un++)
                if (D(vr[Un], "value"), "" + vr[Un] === Bn) {
                  n.push(' selected=""');
                  break;
                }
            } else
              D(vr, "select.value"), "" + vr === Bn && n.push(' selected=""');
          } else $t && n.push(' selected=""');
          return n.push(sn), pe(n, ki, br), br;
        case "textarea":
          ft("textarea", u), u.value === void 0 || u.defaultValue === void 0 || Al || (console.error(
            "Textarea elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled textarea and remove one of these props. More info: https://react.dev/link/controlled-components"
          ), Al = !0), n.push(mt("textarea"));
          var Xn = null, wt = null, wn = null, tn;
          for (tn in u)
            if (kn.call(u, tn)) {
              var Ir = u[tn];
              if (Ir != null)
                switch (tn) {
                  case "children":
                    wn = Ir;
                    break;
                  case "value":
                    Xn = Ir;
                    break;
                  case "defaultValue":
                    wt = Ir;
                    break;
                  case "dangerouslySetInnerHTML":
                    throw Error(
                      "`dangerouslySetInnerHTML` does not make sense on <textarea>."
                    );
                  default:
                    Y(
                      n,
                      tn,
                      Ir
                    );
                }
            }
          if (Xn === null && wt !== null && (Xn = wt), n.push(sn), wn != null) {
            if (console.error(
              "Use the `defaultValue` or `value` props instead of setting children on <textarea>."
            ), Xn != null)
              throw Error(
                "If you supply `defaultValue` on a <textarea>, do not pass children."
              );
            if (Yi(wn)) {
              if (1 < wn.length)
                throw Error("<textarea> can only have at most one child.");
              ee(wn[0]), Xn = "" + wn[0];
            }
            ee(wn), Xn = "" + wn;
          }
          return typeof Xn == "string" && Xn[0] === `
` && n.push(wa), Xn !== null && (D(Xn, "value"), n.push(Me("" + Xn))), null;
        case "input":
          ft("input", u), n.push(mt("input"));
          var Wn = null, yr = null, ct = null, al = null, Jo = null, ol = null, Si = null, Pi = null, Ai = null, or;
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
                    yr = e;
                    break;
                  case "formEncType":
                    ct = e;
                    break;
                  case "formMethod":
                    al = e;
                    break;
                  case "formTarget":
                    Jo = e;
                    break;
                  case "defaultChecked":
                    Ai = e;
                    break;
                  case "defaultValue":
                    Si = e;
                    break;
                  case "checked":
                    Pi = e;
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
          yr === null || u.type === "image" || u.type === "submit" || Qt || (Qt = !0, console.error(
            'An input can only specify a formAction along with type="submit" or type="image".'
          ));
          var t = T(
            n,
            d,
            y,
            yr,
            ct,
            al,
            Jo,
            Wn
          );
          return Pi === null || Ai === null || Cr || (console.error(
            "%s contains an input of type %s with both checked and defaultChecked props. Input elements must be either controlled or uncontrolled (specify either the checked prop, or the defaultChecked prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://react.dev/link/controlled-components",
            "A component",
            u.type
          ), Cr = !0), ol === null || Si === null || Zi || (console.error(
            "%s contains an input of type %s with both value and defaultValue props. Input elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://react.dev/link/controlled-components",
            "A component",
            u.type
          ), Zi = !0), Pi !== null ? Q(n, "checked", Pi) : Ai !== null && Q(n, "checked", Ai), ol !== null ? Y(n, "value", ol) : Si !== null && Y(n, "value", Si), n.push(pa), t?.forEach(Tr, n), null;
        case "button":
          n.push(mt("button"));
          var c = null, h = null, b = null, x = null, S = null, _ = null, J = null, N;
          for (N in u)
            if (kn.call(u, N)) {
              var U = u[N];
              if (U != null)
                switch (N) {
                  case "children":
                    c = U;
                    break;
                  case "dangerouslySetInnerHTML":
                    h = U;
                    break;
                  case "name":
                    b = U;
                    break;
                  case "formAction":
                    x = U;
                    break;
                  case "formEncType":
                    S = U;
                    break;
                  case "formMethod":
                    _ = U;
                    break;
                  case "formTarget":
                    J = U;
                    break;
                  default:
                    Y(
                      n,
                      N,
                      U
                    );
                }
            }
          x === null || u.type == null || u.type === "submit" || Qt || (Qt = !0, console.error(
            'A button can only specify a formAction along with type="submit" or no type.'
          ));
          var oe = T(
            n,
            d,
            y,
            x,
            S,
            _,
            J,
            b
          );
          if (n.push(sn), oe?.forEach(Tr, n), pe(n, h, c), typeof c == "string") {
            n.push(Me(c));
            var se = null;
          } else se = c;
          return se;
        case "form":
          n.push(mt("form"));
          var ue = null, le = null, Ue = null, Zn = null, ze = null, hn = null, At;
          for (At in u)
            if (kn.call(u, At)) {
              var Ht = u[At];
              if (Ht != null)
                switch (At) {
                  case "children":
                    ue = Ht;
                    break;
                  case "dangerouslySetInnerHTML":
                    le = Ht;
                    break;
                  case "action":
                    Ue = Ht;
                    break;
                  case "encType":
                    Zn = Ht;
                    break;
                  case "method":
                    ze = Ht;
                    break;
                  case "target":
                    hn = Ht;
                    break;
                  default:
                    Y(
                      n,
                      At,
                      Ht
                    );
                }
            }
          var On = null, Le = null;
          if (typeof Ue == "function") {
            Zn === null && ze === null || xc || (xc = !0, console.error(
              "Cannot specify a encType or method for a form that specifies a function as the action. React provides those automatically. They will get overridden."
            )), hn === null || Ka || (Ka = !0, console.error(
              "Cannot specify a target for a form that specifies a function as the action. The function will always be executed in the same window."
            ));
            var Bt = he(
              d,
              Ue
            );
            Bt !== null ? (Ue = Bt.action || "", Zn = Bt.encType, ze = Bt.method, hn = Bt.target, On = Bt.data, Le = Bt.name) : (n.push(
              En,
              "action",
              Pn,
              qt,
              qe
            ), hn = ze = Zn = Ue = null, Ne(d, y));
          }
          if (Ue != null && Y(n, "action", Ue), Zn != null && Y(n, "encType", Zn), ze != null && Y(n, "method", ze), hn != null && Y(n, "target", hn), n.push(sn), Le !== null && (n.push('<input type="hidden"'), de(n, "name", Le), n.push(pa), On?.forEach(
            Tr,
            n
          )), pe(n, le, ue), typeof ue == "string") {
            n.push(Me(ue));
            var Dr = null;
          } else Dr = ue;
          return Dr;
        case "menuitem":
          n.push(mt("menuitem"));
          for (var Vn in u)
            if (kn.call(u, Vn)) {
              var ut = u[Vn];
              if (ut != null)
                switch (Vn) {
                  case "children":
                  case "dangerouslySetInnerHTML":
                    throw Error(
                      "menuitems cannot have `children` nor `dangerouslySetInnerHTML`."
                    );
                  default:
                    Y(
                      n,
                      Vn,
                      ut
                    );
                }
            }
          return n.push(sn), null;
        case "object":
          n.push(mt("object"));
          var cl = null, pr = null, er;
          for (er in u)
            if (kn.call(u, er)) {
              var st = u[er];
              if (st != null)
                switch (er) {
                  case "children":
                    cl = st;
                    break;
                  case "dangerouslySetInnerHTML":
                    pr = st;
                    break;
                  case "data":
                    D(st, "data");
                    var Jt = Je("" + st);
                    if (Jt === "") {
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
                      Pn,
                      Me(Jt),
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
          if (n.push(sn), pe(n, pr, cl), typeof cl == "string") {
            n.push(Me(cl));
            var ul = null;
          } else ul = cl;
          return ul;
        case "title":
          var Sl = I.tagScope & 1, nr = I.tagScope & 4;
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
          if (I.insertionMode === Xe || Sl || u.itemProp != null)
            var sl = tt(
              n,
              u
            );
          else
            nr ? sl = null : (tt(y.hoistableChunks, u), sl = void 0);
          return sl;
        case "link":
          var Nr = I.tagScope & 1, na = I.tagScope & 4, fl = u.rel, Ut = u.href, zl = u.precedence;
          if (I.insertionMode === Xe || Nr || u.itemProp != null || typeof fl != "string" || typeof Ut != "string" || Ut === "") {
            fl === "stylesheet" && typeof u.precedence == "string" && (typeof Ut == "string" && Ut || console.error(
              'React encountered a `<link rel="stylesheet" .../>` with a `precedence` prop and expected the `href` prop to be a non-empty string but ecountered %s instead. If your intent was to have React hoist and deduplciate this stylesheet using the `precedence` prop ensure there is a non-empty string `href` prop as well, otherwise remove the `precedence` prop.',
              Ut === null ? "`null`" : Ut === void 0 ? "`undefined`" : Ut === "" ? "an empty string" : 'something with type "' + typeof Ut + '"'
            )), Se(n, u);
            var cr = null;
          } else if (u.rel === "stylesheet")
            if (typeof zl != "string" || u.disabled != null || u.onLoad || u.onError) {
              if (typeof zl == "string") {
                if (u.disabled != null)
                  console.error(
                    'React encountered a `<link rel="stylesheet" .../>` with a `precedence` prop and a `disabled` prop. The presence of the `disabled` prop indicates an intent to manage the stylesheet active state from your from your Component code and React will not hoist or deduplicate this stylesheet. If your intent was to have React hoist and deduplciate this stylesheet using the `precedence` prop remove the `disabled` prop, otherwise remove the `precedence` prop.'
                  );
                else if (u.onLoad || u.onError) {
                  var Vu = u.onLoad && u.onError ? "`onLoad` and `onError` props" : u.onLoad ? "`onLoad` prop" : "`onError` prop";
                  console.error(
                    'React encountered a `<link rel="stylesheet" .../>` with a `precedence` prop and %s. The presence of loading and error handlers indicates an intent to manage the stylesheet loading state from your from your Component code and React will not hoist or deduplicate this stylesheet. If your intent was to have React hoist and deduplciate this stylesheet using the `precedence` prop remove the %s, otherwise remove the `precedence` prop.',
                    Vu,
                    Vu
                  );
                }
              }
              cr = Se(
                n,
                u
              );
            } else {
              var Fi = y.styles.get(zl), Ft = d.styleResources.hasOwnProperty(
                Ut
              ) ? d.styleResources[Ut] : void 0;
              if (Ft !== M) {
                d.styleResources[Ut] = M, Fi || (Fi = {
                  precedence: Me(zl),
                  rules: [],
                  hrefs: [],
                  sheets: /* @__PURE__ */ new Map()
                }, y.styles.set(zl, Fi));
                var Hl = {
                  state: p,
                  props: it({}, u, {
                    "data-precedence": u.precedence,
                    precedence: null
                  })
                };
                if (Ft) {
                  Ft.length === 2 && bl(Hl.props, Ft);
                  var zr = y.preloads.stylesheets.get(Ut);
                  zr && 0 < zr.length ? zr.length = 0 : Hl.state = C;
                }
                Fi.sheets.set(Ut, Hl), F && F.stylesheets.add(Hl);
              } else if (Fi) {
                var Dc = Fi.sheets.get(Ut);
                Dc && F && F.stylesheets.add(Dc);
              }
              te && n.push("<!-- -->"), cr = null;
            }
          else
            u.onLoad || u.onError ? cr = Se(
              n,
              u
            ) : (te && n.push("<!-- -->"), cr = na ? null : Se(y.hoistableChunks, u));
          return cr;
        case "script":
          var Ko = I.tagScope & 1, ci = u.async;
          if (typeof u.src != "string" || !u.src || !ci || typeof ci == "function" || typeof ci == "symbol" || u.onLoad || u.onError || I.insertionMode === Xe || Ko || u.itemProp != null)
            var jo = Ct(
              n,
              u
            );
          else {
            var hl = u.src;
            if (u.type === "module")
              var Lc = d.moduleScriptResources, Qu = y.preloads.moduleScripts;
            else
              Lc = d.scriptResources, Qu = y.preloads.scripts;
            var Bl = Lc.hasOwnProperty(hl) ? Lc[hl] : void 0;
            if (Bl !== M) {
              Lc[hl] = M;
              var Nc = u;
              if (Bl) {
                Bl.length === 2 && (Nc = it({}, u), bl(Nc, Bl));
                var Hr = Qu.get(hl);
                Hr && (Hr.length = 0);
              }
              var qo = [];
              y.scripts.add(qo), Ct(qo, Nc);
            }
            te && n.push("<!-- -->"), jo = null;
          }
          return jo;
        case "style":
          var go = I.tagScope & 1;
          if (kn.call(u, "children")) {
            var Fa = u.children, Ul = Array.isArray(Fa) ? 2 > Fa.length ? Fa[0] : null : Fa;
            (typeof Ul == "function" || typeof Ul == "symbol" || Array.isArray(Ul)) && console.error(
              "React expect children of <style> tags to be a string, number, or object with a `toString` method but found %s instead. In browsers style Elements can only have `Text` Nodes as children.",
              typeof Ul == "function" ? "a Function" : typeof Ul == "symbol" ? "a Sybmol" : "an Array"
            );
          }
          var Wl = u.precedence, Oi = u.href, dl = u.nonce;
          if (I.insertionMode === Xe || go || u.itemProp != null || typeof Wl != "string" || typeof Oi != "string" || Oi === "") {
            n.push(mt("style"));
            var wr = null, Oa = null, _i;
            for (_i in u)
              if (kn.call(u, _i)) {
                var vo = u[_i];
                if (vo != null)
                  switch (_i) {
                    case "children":
                      wr = vo;
                      break;
                    case "dangerouslySetInnerHTML":
                      Oa = vo;
                      break;
                    default:
                      Y(
                        n,
                        _i,
                        vo
                      );
                  }
              }
            n.push(sn);
            var ta = Array.isArray(wr) ? 2 > wr.length ? wr[0] : null : wr;
            typeof ta != "function" && typeof ta != "symbol" && ta !== null && ta !== void 0 && n.push(Rt(ta)), pe(
              n,
              Oa,
              wr
            ), n.push(St("style"));
            var ps = null;
          } else {
            Oi.includes(" ") && console.error(
              'React expected the `href` prop for a <style> tag opting into hoisting semantics using the `precedence` prop to not have any spaces but ecountered spaces instead. using spaces in this prop will cause hydration of this style to fail on the client. The href for the <style> where this ocurred is "%s".',
              Oi
            );
            var Kr = y.styles.get(Wl), ui = d.styleResources.hasOwnProperty(Oi) ? d.styleResources[Oi] : void 0;
            if (ui !== M) {
              d.styleResources[Oi] = M, ui && console.error(
                'React encountered a hoistable style tag for the same href as a preload: "%s". When using a style tag to inline styles you should not also preload it as a stylsheet.',
                Oi
              ), Kr || (Kr = {
                precedence: Me(Wl),
                rules: [],
                hrefs: [],
                sheets: /* @__PURE__ */ new Map()
              }, y.styles.set(
                Wl,
                Kr
              ));
              var zc = y.nonce.style;
              if (zc && zc !== dl)
                console.error(
                  'React encountered a style tag with `precedence` "%s" and `nonce` "%s". When React manages style rules using `precedence` it will only include rules if the nonce matches the style nonce "%s" that was included with this render.',
                  Wl,
                  dl,
                  zc
                );
              else {
                !zc && dl && console.error(
                  'React encountered a style tag with `precedence` "%s" and `nonce` "%s". When React manages style rules using `precedence` it will only include a nonce attributes if you also provide the same style nonce value as a render option.',
                  Wl,
                  dl
                ), Kr.hrefs.push(
                  Me(Oi)
                );
                var wu = Kr.rules, Tu = null, Xs = null, bo;
                for (bo in u)
                  if (kn.call(u, bo)) {
                    var $o = u[bo];
                    if ($o != null)
                      switch (bo) {
                        case "children":
                          Tu = $o;
                          break;
                        case "dangerouslySetInnerHTML":
                          Xs = $o;
                      }
                  }
                var yo = Array.isArray(Tu) ? 2 > Tu.length ? Tu[0] : null : Tu;
                typeof yo != "function" && typeof yo != "symbol" && yo !== null && yo !== void 0 && wu.push(Rt(yo)), pe(wu, Xs, Tu);
              }
            }
            Kr && F && F.styles.add(Kr), te && n.push("<!-- -->"), ps = void 0;
          }
          return ps;
        case "meta":
          var xu = I.tagScope & 1, Ls = I.tagScope & 4;
          if (I.insertionMode === Xe || xu || u.itemProp != null)
            var Ss = Rn(
              n,
              u,
              "meta"
            );
          else
            te && n.push("<!-- -->"), Ss = Ls ? null : typeof u.charSet == "string" ? Rn(y.charsetChunks, u, "meta") : u.name === "viewport" ? Rn(y.viewportChunks, u, "meta") : Rn(
              y.hoistableChunks,
              u,
              "meta"
            );
          return Ss;
        case "listing":
        case "pre":
          n.push(mt(r));
          var jr = null, Mi = null, po;
          for (po in u)
            if (kn.call(u, po)) {
              var Ju = u[po];
              if (Ju != null)
                switch (po) {
                  case "children":
                    jr = Ju;
                    break;
                  case "dangerouslySetInnerHTML":
                    Mi = Ju;
                    break;
                  default:
                    Y(
                      n,
                      po,
                      Ju
                    );
                }
            }
          if (n.push(sn), Mi != null) {
            if (jr != null)
              throw Error(
                "Can only set one of `children` or `props.dangerouslySetInnerHTML`."
              );
            if (typeof Mi != "object" || !("__html" in Mi))
              throw Error(
                "`props.dangerouslySetInnerHTML` must be in the form `{__html: ...}`. Please visit https://react.dev/link/dangerously-set-inner-html for more information."
              );
            var Yl = Mi.__html;
            Yl != null && (typeof Yl == "string" && 0 < Yl.length && Yl[0] === `
` ? n.push(wa, Yl) : (ee(Yl), n.push("" + Yl)));
          }
          return typeof jr == "string" && jr[0] === `
` && n.push(wa), jr;
        case "img":
          var Wt = I.tagScope & 3, xt = u.src, et = u.srcSet;
          if (!(u.loading === "lazy" || !xt && !et || typeof xt != "string" && xt != null || typeof et != "string" && et != null || u.fetchPriority === "low" || Wt) && (typeof xt != "string" || xt[4] !== ":" || xt[0] !== "d" && xt[0] !== "D" || xt[1] !== "a" && xt[1] !== "A" || xt[2] !== "t" && xt[2] !== "T" || xt[3] !== "a" && xt[3] !== "A") && (typeof et != "string" || et[4] !== ":" || et[0] !== "d" && et[0] !== "D" || et[1] !== "a" && et[1] !== "A" || et[2] !== "t" && et[2] !== "T" || et[3] !== "a" && et[3] !== "A")) {
            F !== null && I.tagScope & 64 && (F.suspenseyImages = !0);
            var Ps = typeof u.sizes == "string" ? u.sizes : void 0, ec = et ? et + `
` + (Ps || "") : xt, Ku = y.preloads.images, nc = Ku.get(ec);
            if (nc)
              (u.fetchPriority === "high" || 10 > y.highImagePreloads.size) && (Ku.delete(ec), y.highImagePreloads.add(nc));
            else if (!d.imageResources.hasOwnProperty(ec)) {
              d.imageResources[ec] = G;
              var Hc = u.crossOrigin, ju = typeof Hc == "string" ? Hc === "use-credentials" ? Hc : "" : void 0, Bc = y.headers, Eu;
              Bc && 0 < Bc.remainingCapacity && typeof u.srcSet != "string" && (u.fetchPriority === "high" || 500 > Bc.highImagePreloads.length) && (Eu = R(xt, "image", {
                imageSrcSet: u.srcSet,
                imageSizes: u.sizes,
                crossOrigin: ju,
                integrity: u.integrity,
                nonce: u.nonce,
                type: u.type,
                fetchPriority: u.fetchPriority,
                referrerPolicy: u.refererPolicy
              }), 0 <= (Bc.remainingCapacity -= Eu.length + 2)) ? (y.resets.image[ec] = G, Bc.highImagePreloads && (Bc.highImagePreloads += ", "), Bc.highImagePreloads += Eu) : (nc = [], Se(nc, {
                rel: "preload",
                as: "image",
                href: et ? void 0 : xt,
                imageSrcSet: et,
                imageSizes: Ps,
                crossOrigin: ju,
                integrity: u.integrity,
                type: u.type,
                fetchPriority: u.fetchPriority,
                referrerPolicy: u.referrerPolicy
              }), u.fetchPriority === "high" || 10 > y.highImagePreloads.size ? y.highImagePreloads.add(nc) : (y.bulkPreloads.add(nc), Ku.set(ec, nc)));
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
          if (I.insertionMode < He) {
            var Ru = E || y.preamble;
            if (Ru.headChunks)
              throw Error("The `<head>` tag may only be rendered once.");
            E !== null && n.push("<!--head-->"), Ru.headChunks = [];
            var ws = Ia(
              Ru.headChunks,
              u,
              "head"
            );
          } else
            ws = Ge(
              n,
              u,
              "head"
            );
          return ws;
        case "body":
          if (I.insertionMode < He) {
            var As = E || y.preamble;
            if (As.bodyChunks)
              throw Error("The `<body>` tag may only be rendered once.");
            E !== null && n.push("<!--body-->"), As.bodyChunks = [];
            var Ns = Ia(
              As.bodyChunks,
              u,
              "body"
            );
          } else
            Ns = Ge(
              n,
              u,
              "body"
            );
          return Ns;
        case "html":
          if (I.insertionMode === on) {
            var qu = E || y.preamble;
            if (qu.htmlChunks)
              throw Error("The `<html>` tag may only be rendered once.");
            E !== null && n.push("<!--html-->"), qu.htmlChunks = [Z];
            var $u = Ia(
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
            var Uc = null, wo = null, _a;
            for (_a in u)
              if (kn.call(u, _a)) {
                var gl = u[_a];
                if (gl != null) {
                  var Cu = _a;
                  switch (_a) {
                    case "children":
                      Uc = gl;
                      break;
                    case "dangerouslySetInnerHTML":
                      wo = gl;
                      break;
                    case "style":
                      Pe(n, gl);
                      break;
                    case "suppressContentEditableWarning":
                    case "suppressHydrationWarning":
                    case "ref":
                      break;
                    case "className":
                      Cu = "class";
                    default:
                      if (X(_a) && typeof gl != "function" && typeof gl != "symbol" && gl !== !1) {
                        if (gl === !0)
                          gl = "";
                        else if (typeof gl == "object")
                          continue;
                        n.push(
                          En,
                          Cu,
                          Pn,
                          Me(gl),
                          qe
                        );
                      }
                  }
                }
              }
            return n.push(sn), pe(
              n,
              wo,
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
    function Ie(n, r, u, d) {
      switch (u.insertionMode) {
        case on:
        case Ze:
        case je:
        case He:
          return n.push(xa), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(bt);
        case Xe:
          return n.push(Ea), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(qa);
        case at:
          return n.push(dr), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(zo);
        case cn:
          return n.push(Nu), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push($a);
        case pn:
          return n.push(tu), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(ru);
        case _n:
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
        case He:
          return n.push(Zr);
        case Xe:
          return n.push(Ol);
        case at:
          return n.push(Sr);
        case cn:
          return n.push(mc);
        case pn:
          return n.push(Ri);
        case _n:
          return n.push(Pr);
        case en:
          return n.push(zu);
        default:
          throw Error("Unknown insertion mode. This is a bug in React.");
      }
    }
    function Pt(n) {
      return JSON.stringify(n).replace(
        Ho,
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
    function Da(n) {
      var r = n.rules, u = n.hrefs;
      0 < r.length && u.length === 0 && console.error(
        "React expected to have at least one href for an a hoistable style but found none. This is a bug in React."
      );
      var d = 0;
      if (u.length) {
        for (this.push(re.startInlineStyle), this.push(Oc), this.push(n.precedence), this.push(ma); d < u.length - 1; d++)
          this.push(u[d]), this.push(Ml);
        for (this.push(u[d]), this.push(us), d = 0; d < r.length; d++) this.push(r[d]);
        Bo = this.push(ss), li = !0, r.length = 0, u.length = 0;
      }
    }
    function vn(n) {
      return n.state !== k ? li = !0 : !1;
    }
    function rr(n, r, u) {
      return li = !1, Bo = !0, re = u, r.styles.forEach(Da, n), re = null, r.stylesheets.forEach(vn), li && (u.stylesToHoist = !0), Bo;
    }
    function Nn(n) {
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
            this.push(d[n]), this.push(Ml);
          this.push(d[n]);
        }
        for (this.push(Yu), n = 0; n < u.length; n++)
          this.push(u[n]);
        this.push(fs), u.length = 0, d.length = 0;
      }
    }
    function To(n) {
      if (n.state === p) {
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
      (r.instructions & P) === o && (r.instructions |= P, n.push(
        Uo,
        Me("_" + r.idPrefix + "R_"),
        qe
      ));
    }
    function aa(n, r) {
      n.push(l);
      var u = l;
      r.stylesheets.forEach(function(d) {
        if (d.state !== k)
          if (d.state === z)
            n.push(u), d = d.props.href, D(d, "href"), d = $r("" + d), n.push(d), n.push(v), u = a;
          else {
            n.push(u);
            var y = d.props["data-precedence"], E = d.props, F = Je("" + d.props.href);
            F = $r(F), n.push(F), D(y, "precedence"), y = "" + y, n.push(s), y = $r(y), n.push(y);
            for (var I in E)
              if (kn.call(E, I) && (y = E[I], y != null))
                switch (I) {
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
                      I,
                      y
                    );
                }
            n.push(v), u = a, d.state = z;
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
          d = "class", D(u, d), r = "" + u;
          break;
        case "hidden":
          if (u === !1) return;
          r = "";
          break;
        case "src":
        case "href":
          u = Je(u), D(u, d), r = "" + u;
          break;
        default:
          if (2 < r.length && (r[0] === "o" || r[0] === "O") && (r[1] === "n" || r[1] === "N") || !X(r))
            return;
          D(u, d), r = "" + u;
      }
      n.push(s), d = $r(d), n.push(d), n.push(s), d = $r(r), n.push(d);
    }
    function Zl() {
      return { styles: /* @__PURE__ */ new Set(), stylesheets: /* @__PURE__ */ new Set(), suspenseyImages: !1 };
    }
    function Vl(n, r, u, d) {
      (n.scriptResources.hasOwnProperty(u) || n.moduleScriptResources.hasOwnProperty(u)) && console.error(
        'Internal React Error: React expected bootstrap script or module with src "%s" to not have been preloaded already. please file an issue',
        u
      ), n.scriptResources[u] = M, n.moduleScriptResources[u] = M, n = [], Se(n, d), r.bootstrapScripts.add(n);
    }
    function bl(n, r) {
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
      return D(n, "href"), ("" + n).replace(
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
      return Be(n) && (console.error(
        "The provided `%s` option is an unsupported type %s. This value must be coerced to a string before using it here.",
        r,
        ie(n)
      ), A(n)), ("" + n).replace(
        H,
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
      var u = n.idPrefix, d = [], y = n.bootstrapScriptContent, E = n.bootstrapScripts, F = n.bootstrapModules;
      if (y !== void 0 && (d.push("<script"), el(d, n), d.push(
        sn,
        Et(y),
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
        for (y = 0; y < E.length; y++) {
          var I = E[y], te, B = void 0, j = void 0, ge = {
            rel: "preload",
            as: "script",
            fetchPriority: "low",
            nonce: void 0
          };
          typeof I == "string" ? ge.href = te = I : (ge.href = te = I.src, ge.integrity = j = typeof I.integrity == "string" ? I.integrity : void 0, ge.crossOrigin = B = typeof I == "string" || I.crossOrigin == null ? void 0 : I.crossOrigin === "use-credentials" ? "use-credentials" : ""), Vl(n, u, te, ge), d.push(
            '<script src="',
            Me(te),
            qe
          ), typeof j == "string" && d.push(
            ' integrity="',
            Me(j),
            qe
          ), typeof B == "string" && d.push(
            ' crossorigin="',
            Me(B),
            qe
          ), el(d, n), d.push(' async=""><\/script>');
        }
      if (F !== void 0)
        for (E = 0; E < F.length; E++)
          y = F[E], B = te = void 0, j = {
            rel: "modulepreload",
            fetchPriority: "low",
            nonce: void 0
          }, typeof y == "string" ? j.href = I = y : (j.href = I = y.src, j.integrity = B = typeof y.integrity == "string" ? y.integrity : void 0, j.crossOrigin = te = typeof y == "string" || y.crossOrigin == null ? void 0 : y.crossOrigin === "use-credentials" ? "use-credentials" : ""), Vl(
            n,
            u,
            I,
            j
          ), d.push(
            '<script type="module" src="',
            Me(I),
            qe
          ), typeof B == "string" && d.push(
            ' integrity="',
            Me(B),
            qe
          ), typeof te == "string" && d.push(
            ' crossorigin="',
            Me(te),
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
    function Ql(n, r, u, d) {
      return u.generateStaticMarkup ? (n.push(Me(r)), !1) : (r === "" ? n = d : (d && n.push("<!-- -->"), n.push(Me(r)), n = !0), n);
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
        case bc:
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
          case Dt:
            return "Portal";
          case wl:
            return n.displayName || "Context";
          case Qc:
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
      var r = Ve;
      r !== n && (r === null ? La(n) : n === null ? oa(r) : r.depth === n.depth ? hi(r, n) : r.depth > n.depth ? ur(r, n) : tl(r, n), Ve = n);
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
    function yl(n, r) {
      n = (n = n.constructor) && dt(n) || "ReactClass";
      var u = n + "." + r;
      yn[u] || (console.error(
        `Can only update a mounting component. This usually means you called %s() outside componentWillMount() on the server. This is a no-op.

Please check the code for the %s component.`,
        r,
        n
      ), yn[u] = !0);
    }
    function Cn(n, r, u) {
      var d = n.id;
      n = n.overflow;
      var y = 32 - Dl(d) - 1;
      d &= ~(1 << y), u += 1;
      var E = 32 - Dl(r) + y;
      if (30 < E) {
        var F = y - y % 5;
        return E = (d & (1 << F) - 1).toString(32), d >>= F, y -= F, {
          id: 1 << 32 - Dl(r) + y | u << y | d,
          overflow: E + n
        };
      }
      return {
        id: 1 << E | u << y | d,
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
                var y = r;
                y.status = "fulfilled", y.value = d;
              }
            },
            function(d) {
              if (r.status === "pending") {
                var y = r;
                y.status = "rejected", y.reason = d;
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
      if (Qr === null)
        throw Error(
          `Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:
1. You might have mismatching versions of React and the renderer (such as React DOM)
2. You might be breaking the Rules of Hooks
3. You might have more than one copy of React in the same app
See https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.`
        );
      return Ci && console.error(
        "Do not call Hooks inside useEffect(...), useMemo(...), or other built-in Hooks. You can only call Hooks at the top level of your React function. For more information, see https://react.dev/link/rules-of-hooks"
      ), Qr;
    }
    function zn() {
      if (0 < hu)
        throw Error("Rendered more hooks than during the previous render");
      return { memoizedState: null, queue: null, next: null };
    }
    function mn() {
      return ot === null ? Gu === null ? (Go = !1, Gu = ot = zn()) : (Go = !0, ot = Gu) : ot.next === null ? (Go = !1, ot = ot.next = zn()) : (Go = !0, ot = ot.next), ot;
    }
    function Jl() {
      var n = Xo;
      return Xo = null, n;
    }
    function sr() {
      Ci = !1, ao = _r = Yo = Qr = null, ai = !1, Gu = null, hu = 0, ot = Sa = null;
    }
    function Na(n) {
      return Ci && console.error(
        "Context can only be read while React is rendering. In classes, you can read it in the render method or getDerivedStateFromProps. In function components, you can read it directly in the function body, but not inside Hooks like useReducer() or useMemo()."
      ), n._currentValue2;
    }
    function Wc(n, r) {
      return typeof r == "function" ? r(n) : r;
    }
    function Er(n, r, u) {
      if (n !== Wc && (co = "useReducer"), Qr = di(), ot = mn(), Go) {
        if (u = ot.queue, r = u.dispatch, Sa !== null) {
          var d = Sa.get(u);
          if (d !== void 0) {
            Sa.delete(u), u = ot.memoizedState;
            do {
              var y = d.action;
              Ci = !0, u = n(u, y), Ci = !1, d = d.next;
            } while (d !== null);
            return ot.memoizedState = u, [u, r];
          }
        }
        return [ot.memoizedState, r];
      }
      return Ci = !0, n = n === Wc ? typeof r == "function" ? r() : r : u !== void 0 ? u(r) : r, Ci = !1, ot.memoizedState = n, n = ot.queue = { last: null, dispatch: null }, n = n.dispatch = ku.bind(
        null,
        Qr,
        n
      ), [ot.memoizedState, n];
    }
    function ns(n, r) {
      if (Qr = di(), ot = mn(), r = r === void 0 ? null : r, ot !== null) {
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
              for (var y = 0; y < d.length && y < r.length; y++)
                if (!Wo(r[y], d[y])) {
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
      if (n === Qr)
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
      var d = oo++, y = _r;
      if (typeof n.$$FORM_ACTION == "function") {
        var E = null, F = ao;
        y = y.formState;
        var I = n.$$IS_SIGNATURE_EQUAL;
        if (y !== null && typeof I == "function") {
          var te = y[1];
          I.call(n, y[2], y[3]) && (E = u !== void 0 ? "p" + u : "k" + Re(
            JSON.stringify([
              F,
              null,
              d
            ]),
            0
          ), te === E && (su = d, r = y[0]));
        }
        var B = n.bind(null, r);
        return n = function(ge) {
          B(ge);
        }, typeof B.$$FORM_ACTION == "function" && (n.$$FORM_ACTION = function(ge) {
          ge = B.$$FORM_ACTION(ge), u !== void 0 && (D(u, "target"), u += "", ge.action = u);
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
    function pl(n) {
      var r = fu;
      return fu += 1, Xo === null && (Xo = []), ic(Xo, n, r);
    }
    function za() {
      throw Error("Cache cannot be refreshed during server rendering.");
    }
    function ts() {
    }
    function rs() {
      if (kl === 0) {
        Pa = console.log, qi = console.info, du = console.warn, gu = console.error, vu = console.group, so = console.groupCollapsed, gs = console.groupEnd;
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
          log: it({}, n, { value: Pa }),
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
      var u = bu.get(n);
      if (u !== void 0) return u;
      vs = !0, u = Error.prepareStackTrace, Error.prepareStackTrace = void 0;
      var d = null;
      d = gt.H, gt.H = null, rs();
      try {
        var y = {
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
                    var be = ae;
                  }
                  Reflect.construct(n, [], Ce);
                } else {
                  try {
                    Ce.call();
                  } catch (ae) {
                    be = ae;
                  }
                  n.call(Ce.prototype);
                }
              } else {
                try {
                  throw Error();
                } catch (ae) {
                  be = ae;
                }
                (Ce = n()) && typeof Ce.catch == "function" && Ce.catch(function() {
                });
              }
            } catch (ae) {
              if (ae && be && typeof ae.stack == "string")
                return [ae.stack, be.stack];
            }
            return [null, null];
          }
        };
        y.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
        var E = Object.getOwnPropertyDescriptor(
          y.DetermineComponentFrameRoot,
          "name"
        );
        E && E.configurable && Object.defineProperty(
          y.DetermineComponentFrameRoot,
          "name",
          { value: "DetermineComponentFrameRoot" }
        );
        var F = y.DetermineComponentFrameRoot(), I = F[0], te = F[1];
        if (I && te) {
          var B = I.split(`
`), j = te.split(`
`);
          for (F = E = 0; E < B.length && !B[E].includes(
            "DetermineComponentFrameRoot"
          ); )
            E++;
          for (; F < j.length && !j[F].includes(
            "DetermineComponentFrameRoot"
          ); )
            F++;
          if (E === B.length || F === j.length)
            for (E = B.length - 1, F = j.length - 1; 1 <= E && 0 <= F && B[E] !== j[F]; )
              F--;
          for (; 1 <= E && 0 <= F; E--, F--)
            if (B[E] !== j[F]) {
              if (E !== 1 || F !== 1)
                do
                  if (E--, F--, 0 > F || B[E] !== j[F]) {
                    var ge = `
` + B[E].replace(
                      " at new ",
                      " at "
                    );
                    return n.displayName && ge.includes("<anonymous>") && (ge = ge.replace("<anonymous>", n.displayName)), typeof n == "function" && bu.set(n, ge), ge;
                  }
                while (1 <= E && 0 <= F);
              break;
            }
        }
      } finally {
        vs = !1, gt.H = d, Ro(), Error.prepareStackTrace = u;
      }
      return B = (B = n ? n.displayName || n.name : "") ? gi(B) : "", typeof n == "function" && bu.set(n, B), B;
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
    function Zt(n, r, u, d, y, E, F, I, te, B, j) {
      var ge = /* @__PURE__ */ new Set();
      this.destination = null, this.flushScheduled = !1, this.resumableState = n, this.renderState = r, this.rootFormatContext = u, this.progressiveChunkSize = d === void 0 ? 12800 : d, this.status = 10, this.fatalError = null, this.pendingRootTasks = this.allPendingTasks = this.nextSegmentId = 0, this.completedPreambleSegments = this.completedRootSegment = null, this.byteSize = 0, this.abortableTasks = ge, this.pingedTasks = [], this.clientRenderedBoundaries = [], this.completedBoundaries = [], this.partialBoundaries = [], this.trackedPostpones = null, this.onError = y === void 0 ? uc : y, this.onPostpone = B === void 0 ? dn : B, this.onAllReady = E === void 0 ? dn : E, this.onShellReady = F === void 0 ? dn : F, this.onShellError = I === void 0 ? dn : I, this.onFatalError = te === void 0 ? dn : te, this.formState = j === void 0 ? null : j, this.didWarnForKey = null;
    }
    function mo(n, r, u, d, y, E, F, I, te, B, j, ge) {
      var Ce = bs();
      return 1e3 < Ce - Is && (gt.recentlyCreatedOwnerStacks = 0, Is = Ce), r = new Zt(
        r,
        u,
        d,
        y,
        E,
        F,
        I,
        te,
        B,
        j,
        ge
      ), u = Ur(
        r,
        0,
        null,
        d,
        !1,
        !1
      ), u.parentFlushed = !0, n = bi(
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
        we,
        null
      ), Wr(n), r.pingedTasks.push(n), r;
    }
    function sc(n, r) {
      n.pingedTasks.push(r), n.pingedTasks.length === 1 && (n.flushScheduled = n.destination !== null, Fu(n));
    }
    function Zc(n, r, u, d, y) {
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
        fallbackPreamble: y,
        trackedContentKeyPath: null,
        trackedFallbackNode: null,
        errorMessage: null,
        errorStack: null,
        errorComponentStack: null
      }, r !== null && (r.pendingTasks++, d = r.boundaries, d !== null && (n.allPendingTasks++, u.pendingTasks++, d.push(u)), n = r.inheritedHoistables, n !== null && an(u.contentState, n)), u;
    }
    function bi(n, r, u, d, y, E, F, I, te, B, j, ge, Ce, be, ae, fn, Qn) {
      n.allPendingTasks++, y === null ? n.pendingRootTasks++ : y.pendingTasks++, be !== null && be.pendingTasks++;
      var Ye = {
        replay: null,
        node: u,
        childIndex: d,
        ping: function() {
          return sc(n, Ye);
        },
        blockedBoundary: y,
        blockedSegment: E,
        blockedPreamble: F,
        hoistableState: I,
        abortSet: te,
        keyPath: B,
        formatContext: j,
        context: ge,
        treeContext: Ce,
        row: be,
        componentStack: ae,
        thenableState: r
      };
      return Ye.debugTask = Qn, te.add(Ye), Ye;
    }
    function fc(n, r, u, d, y, E, F, I, te, B, j, ge, Ce, be, ae, fn) {
      n.allPendingTasks++, E === null ? n.pendingRootTasks++ : E.pendingTasks++, Ce !== null && Ce.pendingTasks++, u.pendingTasks++;
      var Qn = {
        replay: u,
        node: d,
        childIndex: y,
        ping: function() {
          return sc(n, Qn);
        },
        blockedBoundary: E,
        blockedSegment: null,
        blockedPreamble: null,
        hoistableState: F,
        abortSet: I,
        keyPath: te,
        formatContext: B,
        context: j,
        treeContext: ge,
        row: Ce,
        componentStack: be,
        thenableState: r
      };
      return Qn.debugTask = fn, I.add(Qn), Qn;
    }
    function Ur(n, r, u, d, y, E) {
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
        lastPushedText: y,
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
            var u = r, d = n.type, y = d ? d.displayName || d.name : "", E = y ? gi(y) : "";
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
      } catch (I) {
        F = `
Error generating stack: ` + I.message + `
` + I.stack;
      }
      return F;
    }
    function Su(n, r) {
      if (r != null)
        for (var u = r.length - 1; 0 <= u; u--) {
          var d = r[u];
          if (typeof d.name == "string" || typeof d.time == "number") break;
          if (d.awaited != null) {
            var y = d.debugStack == null ? d.awaited : d;
            if (y.debugStack !== void 0) {
              n.componentStack = {
                parent: n.componentStack,
                type: d,
                owner: y.owner,
                stack: y.debugStack
              }, n.debugTask = y.debugTask;
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
            var u = r.type, d = r._owner, y = r._debugStack;
            hc(n, r._debugInfo), n.debugTask = r._debugTask, n.componentStack = {
              parent: n.componentStack,
              type: u,
              owner: d,
              stack: y
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
            var y = u;
          } catch (E) {
            y = `
Error generating stack: ` + E.message + `
` + E.stack;
          }
          return Object.defineProperty(r, "componentStack", {
            value: y
          }), y;
        }
      }), r;
    }
    function ko(n, r, u, d, y) {
      n.errorDigest = r, u instanceof Error ? (r = String(u.message), u = String(u.stack)) : (r = typeof u == "object" && u !== null ? Tn(u) : String(u), u = null), y = y ? `Switched to client rendering because the server rendering aborted due to:

` : `Switched to client rendering because the server rendering errored:

`, n.errorMessage = y + r, n.errorStack = u !== null ? y + u : null, n.errorComponentStack = d.componentStack;
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
      var y = n.onFatalError;
      d ? (d.run(u.bind(null, r)), d.run(y.bind(null, r))) : (u(r), y(r)), n.destination !== null ? (n.status = ea, n.destination.destroy(r)) : (n.status = 13, n.fatalError = r);
    }
    function jn(n, r) {
      Pu(n, r.next, r.hoistables);
    }
    function Pu(n, r, u) {
      for (; r !== null; ) {
        u !== null && (an(r.hoistables, u), r.inheritedHoistables = u);
        var d = r.boundaries;
        if (d !== null) {
          r.boundaries = null;
          for (var y = 0; y < d.length; y++) {
            var E = d[y];
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
    function Di(n, r) {
      var u = r.boundaries;
      if (u !== null && r.pendingTasks === u.length) {
        for (var d = !0, y = 0; y < u.length; y++) {
          var E = u[y];
          if (E.pendingTasks !== 1 || E.parentFlushed || cc(n, E)) {
            d = !1;
            break;
          }
        }
        d && Pu(n, r, r.hoistables);
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
    function Au(n, r, u, d, y) {
      var E = r.keyPath, F = r.treeContext, I = r.row, te = r.componentStack, B = r.debugTask;
      hc(r, r.node.props.children._debugInfo), r.keyPath = u, u = d.length;
      var j = null;
      if (r.replay !== null) {
        var ge = r.replay.slots;
        if (ge !== null && typeof ge == "object")
          for (var Ce = 0; Ce < u; Ce++) {
            var be = y !== "backwards" && y !== "unstable_legacy-backwards" ? Ce : u - 1 - Ce, ae = d[be];
            r.row = j = jl(
              j
            ), r.treeContext = Cn(F, u, be);
            var fn = ge[be];
            typeof fn == "number" ? (Ni(n, r, fn, ae, be), delete ge[be]) : It(n, r, ae, be), --j.pendingTasks === 0 && jn(n, j);
          }
        else
          for (ge = 0; ge < u; ge++)
            Ce = y !== "backwards" && y !== "unstable_legacy-backwards" ? ge : u - 1 - ge, be = d[Ce], Mt(n, r, be), r.row = j = jl(j), r.treeContext = Cn(F, u, Ce), It(n, r, be, Ce), --j.pendingTasks === 0 && jn(n, j);
      } else if (y !== "backwards" && y !== "unstable_legacy-backwards")
        for (y = 0; y < u; y++)
          ge = d[y], Mt(n, r, ge), r.row = j = jl(j), r.treeContext = Cn(
            F,
            u,
            y
          ), It(n, r, ge, y), --j.pendingTasks === 0 && jn(n, j);
      else {
        for (y = r.blockedSegment, ge = y.children.length, Ce = y.chunks.length, be = u - 1; 0 <= be; be--) {
          ae = d[be], r.row = j = jl(
            j
          ), r.treeContext = Cn(F, u, be), fn = Ur(
            n,
            Ce,
            null,
            r.formatContext,
            be === 0 ? y.lastPushedText : !0,
            !0
          ), y.children.splice(ge, 0, fn), r.blockedSegment = fn, Mt(n, r, ae);
          try {
            It(n, r, ae, be), nl(
              fn.chunks,
              n.renderState,
              fn.lastPushedText,
              fn.textEmbedded
            ), fn.status = Mr, --j.pendingTasks === 0 && jn(n, j);
          } catch (Qn) {
            throw fn.status = n.status === 12 ? Nl : Dn, Qn;
          }
        }
        r.blockedSegment = y, y.lastPushedText = !1;
      }
      I !== null && j !== null && 0 < j.pendingTasks && (I.pendingTasks++, j.next = I), r.treeContext = F, r.row = I, r.keyPath = E, r.componentStack = te, r.debugTask = B;
    }
    function Li(n, r, u, d, y, E) {
      var F = r.thenableState;
      for (r.thenableState = null, Qr = {}, Yo = r, _r = n, ao = u, Ci = !1, oo = uu = 0, su = -1, fu = 0, Xo = F, n = Zu(d, y, E); ai; )
        ai = !1, oo = uu = 0, su = -1, fu = 0, hu += 1, ot = null, n = d(y, E);
      return sr(), n;
    }
    function yi(n, r, u, d, y, E, F) {
      var I = !1;
      if (E !== 0 && n.formState !== null) {
        var te = r.blockedSegment;
        if (te !== null) {
          I = !0, te = te.chunks;
          for (var B = 0; B < E; B++)
            B === F ? te.push("<!--F!-->") : te.push("<!--F-->");
        }
      }
      E = r.keyPath, r.keyPath = u, y ? (u = r.treeContext, r.treeContext = Cn(u, 1, 0), It(n, r, d, -1), r.treeContext = u) : I ? It(n, r, d, -1) : $e(n, r, d, -1), r.keyPath = E;
    }
    function So(n, r, u, d, y, E) {
      if (typeof d == "function")
        if (d.prototype && d.prototype.isReactComponent) {
          var F = y;
          if ("ref" in y) {
            F = {};
            for (var I in y)
              I !== "ref" && (F[I] = y[I]);
          }
          var te = d.defaultProps;
          if (te) {
            F === y && (F = it({}, F, y));
            for (var B in te)
              F[B] === void 0 && (F[B] = te[B]);
          }
          var j = F, ge = we, Ce = d.contextType;
          if ("contextType" in d && Ce !== null && (Ce === void 0 || Ce.$$typeof !== wl) && !Vr.has(d)) {
            Vr.add(d);
            var be = Ce === void 0 ? " However, it is set to undefined. This can be caused by a typo or by mixing up named and default imports. This can also happen due to a circular dependency, so try moving the createContext() call to a separate file." : typeof Ce != "object" ? " However, it is set to a " + typeof Ce + "." : Ce.$$typeof === Qc ? " Did you accidentally pass the Context.Consumer instead?" : " However, it is set to an object with keys {" + Object.keys(Ce).join(", ") + "}.";
            console.error(
              "%s defines an invalid contextType. contextType should point to the Context object returned by React.createContext().%s",
              dt(d) || "Component",
              be
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
            var Qn = null, Ye = null, Fn = null;
            if (typeof ae.componentWillMount == "function" && ae.componentWillMount.__suppressDeprecationWarning !== !0 ? Qn = "componentWillMount" : typeof ae.UNSAFE_componentWillMount == "function" && (Qn = "UNSAFE_componentWillMount"), typeof ae.componentWillReceiveProps == "function" && ae.componentWillReceiveProps.__suppressDeprecationWarning !== !0 ? Ye = "componentWillReceiveProps" : typeof ae.UNSAFE_componentWillReceiveProps == "function" && (Ye = "UNSAFE_componentWillReceiveProps"), typeof ae.componentWillUpdate == "function" && ae.componentWillUpdate.__suppressDeprecationWarning !== !0 ? Fn = "componentWillUpdate" : typeof ae.UNSAFE_componentWillUpdate == "function" && (Fn = "UNSAFE_componentWillUpdate"), Qn !== null || Ye !== null || Fn !== null) {
              var vr = dt(d) || "Component", br = typeof d.getDerivedStateFromProps == "function" ? "getDerivedStateFromProps()" : "getSnapshotBeforeUpdate()";
              ll.has(vr) || (ll.add(
                vr
              ), console.error(
                `Unsafe legacy lifecycles will not be called for components using new component APIs.

%s uses %s but also contains the following legacy lifecycles:%s%s%s

The above lifecycles should be removed. Learn more about this warning here:
https://react.dev/link/unsafe-component-lifecycles`,
                vr,
                br,
                Qn !== null ? `
  ` + Qn : "",
                Ye !== null ? `
  ` + Ye : "",
                Fn !== null ? `
  ` + Fn : ""
              ));
            }
          }
          var Mn = dt(d) || "Component";
          ae.render || (d.prototype && typeof d.prototype.render == "function" ? console.error(
            "No `render` method found on the %s instance: did you accidentally return an object from the constructor?",
            Mn
          ) : console.error(
            "No `render` method found on the %s instance: you may have forgotten to define `render`.",
            Mn
          )), !ae.getInitialState || ae.getInitialState.isReactClassApproved || ae.state || console.error(
            "getInitialState was defined on %s, a plain JavaScript class. This is only supported for classes created using React.createClass. Did you mean to define a state property instead?",
            Mn
          ), ae.getDefaultProps && !ae.getDefaultProps.isReactClassApproved && console.error(
            "getDefaultProps was defined on %s, a plain JavaScript class. This is only supported for classes created using React.createClass. Use a static property to define defaultProps instead.",
            Mn
          ), ae.contextType && console.error(
            "contextType was defined as an instance property on %s. Use a static property to define contextType instead.",
            Mn
          ), d.childContextTypes && !_t.has(d) && (_t.add(d), console.error(
            "%s uses the legacy childContextTypes API which was removed in React 19. Use React.createContext() instead. (https://react.dev/link/legacy-context)",
            Mn
          )), d.contextTypes && !Ar.has(d) && (Ar.add(d), console.error(
            "%s uses the legacy contextTypes API which was removed in React 19. Use React.createContext() with static contextType instead. (https://react.dev/link/legacy-context)",
            Mn
          )), typeof ae.componentShouldUpdate == "function" && console.error(
            "%s has a method called componentShouldUpdate(). Did you mean shouldComponentUpdate()? The name is phrased as a question because the function is expected to return a value.",
            Mn
          ), d.prototype && d.prototype.isPureReactComponent && typeof ae.shouldComponentUpdate < "u" && console.error(
            "%s has a method called shouldComponentUpdate(). shouldComponentUpdate should not be used when extending React.PureComponent. Please extend React.Component if shouldComponentUpdate is used.",
            dt(d) || "A pure component"
          ), typeof ae.componentDidUnmount == "function" && console.error(
            "%s has a method called componentDidUnmount(). But there is no such lifecycle method. Did you mean componentWillUnmount()?",
            Mn
          ), typeof ae.componentDidReceiveProps == "function" && console.error(
            "%s has a method called componentDidReceiveProps(). But there is no such lifecycle method. If you meant to update the state in response to changing props, use componentWillReceiveProps(). If you meant to fetch data or run side-effects or mutations after React has updated the UI, use componentDidUpdate().",
            Mn
          ), typeof ae.componentWillRecieveProps == "function" && console.error(
            "%s has a method called componentWillRecieveProps(). Did you mean componentWillReceiveProps()?",
            Mn
          ), typeof ae.UNSAFE_componentWillRecieveProps == "function" && console.error(
            "%s has a method called UNSAFE_componentWillRecieveProps(). Did you mean UNSAFE_componentWillReceiveProps()?",
            Mn
          );
          var $t = ae.props !== j;
          ae.props !== void 0 && $t && console.error(
            "When calling super() in `%s`, make sure to pass up the same props that your component's constructor was passed.",
            Mn
          ), ae.defaultProps && console.error(
            "Setting defaultProps as an instance property on %s is not supported and will be ignored. Instead, define defaultProps as a static property on %s.",
            Mn,
            Mn
          ), typeof ae.getSnapshotBeforeUpdate != "function" || typeof ae.componentDidUpdate == "function" || gr.has(d) || (gr.add(d), console.error(
            "%s: getSnapshotBeforeUpdate() should be used with componentDidUpdate(). This component defines getSnapshotBeforeUpdate() only.",
            dt(d)
          )), typeof ae.getDerivedStateFromProps == "function" && console.error(
            "%s: getDerivedStateFromProps() is defined as an instance method and will be ignored. Instead, declare it as a static method.",
            Mn
          ), typeof ae.getDerivedStateFromError == "function" && console.error(
            "%s: getDerivedStateFromError() is defined as an instance method and will be ignored. Instead, declare it as a static method.",
            Mn
          ), typeof d.getSnapshotBeforeUpdate == "function" && console.error(
            "%s: getSnapshotBeforeUpdate() is defined as a static method and will be ignored. Instead, declare it as an instance method.",
            Mn
          );
          var ki = ae.state;
          ki && (typeof ki != "object" || Yi(ki)) && console.error("%s.state: must be set to an object or null", Mn), typeof ae.getChildContext == "function" && typeof d.childContextTypes != "object" && console.error(
            "%s.getChildContext(): childContextTypes must be defined in order to use getChildContext().",
            Mn
          );
          var Jr = ae.state !== void 0 ? ae.state : null;
          ae.updater = pt, ae.props = j, ae.state = Jr;
          var _e = { queue: [], replace: !1 };
          ae._reactInternals = _e;
          var Bn = d.contextType;
          if (ae.context = typeof Bn == "object" && Bn !== null ? Bn._currentValue2 : we, ae.state === j) {
            var Un = dt(d) || "Component";
            Il.has(
              Un
            ) || (Il.add(
              Un
            ), console.error(
              "%s: It is not recommended to assign props directly to state because updates to props won't be reflected in state. In most cases, it is better to use props directly.",
              Un
            ));
          }
          var Xn = d.getDerivedStateFromProps;
          if (typeof Xn == "function") {
            var wt = Xn(
              j,
              Jr
            );
            if (wt === void 0) {
              var wn = dt(d) || "Component";
              Qe.has(wn) || (Qe.add(wn), console.error(
                "%s.getDerivedStateFromProps(): A valid state object (or null) must be returned. You have returned undefined.",
                wn
              ));
            }
            var tn = wt == null ? Jr : it({}, Jr, wt);
            ae.state = tn;
          }
          if (typeof d.getDerivedStateFromProps != "function" && typeof ae.getSnapshotBeforeUpdate != "function" && (typeof ae.UNSAFE_componentWillMount == "function" || typeof ae.componentWillMount == "function")) {
            var Ir = ae.state;
            if (typeof ae.componentWillMount == "function") {
              if (ae.componentWillMount.__suppressDeprecationWarning !== !0) {
                var Wn = dt(d) || "Unknown";
                yt[Wn] || (console.warn(
                  `componentWillMount has been renamed, and is not recommended for use. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move code from componentWillMount to componentDidMount (preferred in most cases) or the constructor.

Please update the following components: %s`,
                  Wn
                ), yt[Wn] = !0);
              }
              ae.componentWillMount();
            }
            if (typeof ae.UNSAFE_componentWillMount == "function" && ae.UNSAFE_componentWillMount(), Ir !== ae.state && (console.error(
              "%s.componentWillMount(): Assigning directly to this.state is deprecated (except inside a component's constructor). Use setState instead.",
              dt(d) || "Component"
            ), pt.enqueueReplaceState(
              ae,
              ae.state,
              null
            )), _e.queue !== null && 0 < _e.queue.length) {
              var yr = _e.queue, ct = _e.replace;
              if (_e.queue = null, _e.replace = !1, ct && yr.length === 1)
                ae.state = yr[0];
              else {
                for (var al = ct ? yr[0] : ae.state, Jo = !0, ol = ct ? 1 : 0; ol < yr.length; ol++) {
                  var Si = yr[ol], Pi = typeof Si == "function" ? Si.call(
                    ae,
                    al,
                    j,
                    void 0
                  ) : Si;
                  Pi != null && (Jo ? (Jo = !1, al = it(
                    {},
                    al,
                    Pi
                  )) : it(al, Pi));
                }
                ae.state = al;
              }
            } else _e.queue = null;
          }
          var Ai = yu(ae);
          if (n.status === 12) throw null;
          ae.props !== j && (fo || console.error(
            "It looks like %s is reassigning its own `this.props` while rendering. This is not supported and can lead to confusing bugs.",
            dt(d) || "a component"
          ), fo = !0);
          var or = r.keyPath;
          r.keyPath = u, $e(n, r, Ai, -1), r.keyPath = or;
        } else {
          if (d.prototype && typeof d.prototype.render == "function") {
            var e = dt(d) || "Unknown";
            _c[e] || (console.error(
              "The <%s /> component appears to have a render method, but doesn't extend React.Component. This is likely to cause errors. Change %s to extend React.Component instead.",
              e,
              e
            ), _c[e] = !0);
          }
          var t = Li(
            n,
            r,
            u,
            d,
            y,
            void 0
          );
          if (n.status === 12) throw null;
          var c = uu !== 0, h = oo, b = su;
          if (d.contextTypes) {
            var x = dt(d) || "Unknown";
            pu[x] || (pu[x] = !0, console.error(
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
            Qo[S] || (console.error(
              "%s: Function components do not support getDerivedStateFromProps.",
              S
            ), Qo[S] = !0);
          }
          if (typeof d.contextType == "object" && d.contextType !== null) {
            var _ = dt(d) || "Unknown";
            ys[_] || (console.error(
              "%s: Function components do not support contextType.",
              _
            ), ys[_] = !0);
          }
          yi(
            n,
            r,
            u,
            t,
            c,
            h,
            b
          );
        }
      else if (typeof d == "string") {
        var J = r.blockedSegment;
        if (J === null) {
          var N = y.children, U = r.formatContext, oe = r.keyPath;
          r.formatContext = si(U, d, y), r.keyPath = u, It(n, r, N, -1), r.formatContext = U, r.keyPath = oe;
        } else {
          var se = xn(
            J.chunks,
            d,
            y,
            n.resumableState,
            n.renderState,
            r.blockedPreamble,
            r.hoistableState,
            r.formatContext,
            J.lastPushedText
          );
          J.lastPushedText = !1;
          var ue = r.formatContext, le = r.keyPath;
          if (r.keyPath = u, (r.formatContext = si(
            ue,
            d,
            y
          )).insertionMode === je) {
            var Ue = Ur(
              n,
              0,
              null,
              r.formatContext,
              !1,
              !1
            );
            J.preambleChildren.push(Ue), r.blockedSegment = Ue;
            try {
              Ue.status = 6, It(n, r, se, -1), nl(
                Ue.chunks,
                n.renderState,
                Ue.lastPushedText,
                Ue.textEmbedded
              ), Ue.status = Mr;
            } finally {
              r.blockedSegment = J;
            }
          } else It(n, r, se, -1);
          r.formatContext = ue, r.keyPath = le;
          e: {
            var Zn = J.chunks, ze = n.resumableState;
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
                if (ue.insertionMode <= Ze) {
                  ze.hasBody = !0;
                  break e;
                }
                break;
              case "html":
                if (ue.insertionMode === on) {
                  ze.hasHtml = !0;
                  break e;
                }
                break;
              case "head":
                if (ue.insertionMode <= Ze) break e;
            }
            Zn.push(St(d));
          }
          J.lastPushedText = !1;
        }
      } else {
        switch (d) {
          case Jc:
          case vc:
          case bc:
          case Ti:
            var hn = r.keyPath;
            r.keyPath = u, $e(n, r, y.children, -1), r.keyPath = hn;
            return;
          case ni:
            var At = r.blockedSegment;
            if (At === null) {
              if (y.mode !== "hidden") {
                var Ht = r.keyPath;
                r.keyPath = u, It(n, r, y.children, -1), r.keyPath = Ht;
              }
            } else if (y.mode !== "hidden") {
              n.renderState.generateStaticMarkup || At.chunks.push("<!--&-->"), At.lastPushedText = !1;
              var On = r.keyPath;
              r.keyPath = u, It(n, r, y.children, -1), r.keyPath = On, n.renderState.generateStaticMarkup || At.chunks.push("<!--/&-->"), At.lastPushedText = !1;
            }
            return;
          case xl:
            e: {
              var Le = y.children, Bt = y.revealOrder;
              if (Bt === "forwards" || Bt === "backwards" || Bt === "unstable_legacy-backwards") {
                if (Yi(Le)) {
                  Au(
                    n,
                    r,
                    u,
                    Le,
                    Bt
                  );
                  break e;
                }
                var Dr = W(Le);
                if (Dr) {
                  var Vn = Dr.call(Le);
                  if (Vn) {
                    Po(
                      r,
                      Le,
                      -1,
                      Vn,
                      Dr
                    );
                    var ut = Vn.next();
                    if (!ut.done) {
                      var cl = [];
                      do
                        cl.push(ut.value), ut = Vn.next();
                      while (!ut.done);
                      Au(
                        n,
                        r,
                        u,
                        Le,
                        Bt
                      );
                    }
                    break e;
                  }
                }
              }
              if (Bt === "together") {
                var pr = r.keyPath, er = r.row, st = r.row = jl(null);
                st.boundaries = [], st.together = !0, r.keyPath = u, $e(n, r, Le, -1), --st.pendingTasks === 0 && jn(n, st), r.keyPath = pr, r.row = er, er !== null && 0 < st.pendingTasks && (er.pendingTasks++, st.next = er);
              } else {
                var Jt = r.keyPath;
                r.keyPath = u, $e(n, r, Le, -1), r.keyPath = Jt;
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
              var Tt = y.children;
              try {
                It(n, r, Tt, -1);
              } finally {
                r.keyPath = ul, r.formatContext = Sl, r.row = nr;
              }
            } else {
              var Lr = r.keyPath, sl = r.formatContext, Nr = r.row, na = r.blockedBoundary, fl = r.blockedPreamble, Ut = r.hoistableState, zl = r.blockedSegment, cr = y.fallback, Vu = y.children, Fi = /* @__PURE__ */ new Set(), Ft = Zc(
                n,
                r.row,
                Fi,
                null,
                null
              );
              n.trackedPostpones !== null && (Ft.trackedContentKeyPath = u);
              var Hl = Ur(
                n,
                zl.chunks.length,
                Ft,
                r.formatContext,
                !1,
                !1
              );
              zl.children.push(Hl), zl.lastPushedText = !1;
              var zr = Ur(
                n,
                0,
                null,
                r.formatContext,
                !1,
                !1
              );
              if (zr.parentFlushed = !0, n.trackedPostpones !== null) {
                var Dc = r.componentStack, Ko = [
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
                ), Ft.trackedFallbackNode = ci, r.blockedSegment = Hl, r.blockedPreamble = Ft.fallbackPreamble, r.keyPath = Ko, r.formatContext = qr(
                  n.resumableState,
                  sl
                ), r.componentStack = dc(
                  Dc
                ), Hl.status = 6;
                try {
                  It(n, r, cr, -1), nl(
                    Hl.chunks,
                    n.renderState,
                    Hl.lastPushedText,
                    Hl.textEmbedded
                  ), Hl.status = Mr;
                } catch (wu) {
                  throw Hl.status = n.status === 12 ? Nl : Dn, wu;
                } finally {
                  r.blockedSegment = zl, r.blockedPreamble = fl, r.keyPath = Lr, r.formatContext = sl;
                }
                var jo = bi(
                  n,
                  null,
                  Vu,
                  -1,
                  Ft,
                  zr,
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
                  Dc,
                  we,
                  r.debugTask
                );
                Wr(jo), n.pingedTasks.push(jo);
              } else {
                r.blockedBoundary = Ft, r.blockedPreamble = Ft.contentPreamble, r.hoistableState = Ft.contentState, r.blockedSegment = zr, r.keyPath = u, r.formatContext = nt(
                  n.resumableState,
                  sl
                ), r.row = null, zr.status = 6;
                try {
                  if (It(n, r, Vu, -1), nl(
                    zr.chunks,
                    n.renderState,
                    zr.lastPushedText,
                    zr.textEmbedded
                  ), zr.status = Mr, Wa(Ft, zr), Ft.pendingTasks === 0 && Ft.status === $i) {
                    if (Ft.status = Mr, !cc(n, Ft)) {
                      Nr !== null && --Nr.pendingTasks === 0 && jn(n, Nr), n.pendingRootTasks === 0 && r.blockedPreamble && Ao(n);
                      break e;
                    }
                  } else
                    Nr !== null && Nr.together && Di(n, Nr);
                } catch (wu) {
                  if (Ft.status = ar, n.status === 12) {
                    zr.status = Nl;
                    var hl = n.fatalError;
                  } else
                    zr.status = Dn, hl = wu;
                  var Lc = ca(r.componentStack), Qu = Yr(
                    n,
                    hl,
                    Lc,
                    r.debugTask
                  );
                  ko(
                    Ft,
                    Qu,
                    hl,
                    Lc,
                    !1
                  ), Ha(n, Ft);
                } finally {
                  r.blockedBoundary = na, r.blockedPreamble = fl, r.hoistableState = Ut, r.blockedSegment = zl, r.keyPath = Lr, r.formatContext = sl, r.row = Nr;
                }
                var Bl = bi(
                  n,
                  null,
                  cr,
                  -1,
                  na,
                  Hl,
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
                  we,
                  r.debugTask
                );
                Wr(Bl), n.pingedTasks.push(Bl);
              }
            }
            return;
        }
        if (typeof d == "object" && d !== null)
          switch (d.$$typeof) {
            case Tl:
              if ("ref" in y) {
                var Nc = {};
                for (var Hr in y)
                  Hr !== "ref" && (Nc[Hr] = y[Hr]);
              } else Nc = y;
              var qo = Li(
                n,
                r,
                u,
                d.render,
                Nc,
                E
              );
              yi(
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
              So(n, r, u, d.type, y, E);
              return;
            case wl:
              var go = y.value, Fa = y.children, Ul = r.context, Wl = r.keyPath, Oi = d._currentValue2;
              d._currentValue2 = go, d._currentRenderer2 !== void 0 && d._currentRenderer2 !== null && d._currentRenderer2 !== bn && console.error(
                "Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported."
              ), d._currentRenderer2 = bn;
              var dl = Ve, wr = {
                parent: dl,
                depth: dl === null ? 0 : dl.depth + 1,
                context: d,
                parentValue: Oi,
                value: go
              };
              Ve = wr, r.context = wr, r.keyPath = u, $e(n, r, Fa, -1);
              var Oa = Ve;
              if (Oa === null)
                throw Error(
                  "Tried to pop a Context at the root of the app. This is a bug in React."
                );
              Oa.context !== d && console.error(
                "The parent context is not the expected context. This is probably a bug in React."
              ), Oa.context._currentValue2 = Oa.parentValue, d._currentRenderer2 !== void 0 && d._currentRenderer2 !== null && d._currentRenderer2 !== bn && console.error(
                "Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported."
              ), d._currentRenderer2 = bn;
              var _i = Ve = Oa.parent;
              r.context = _i, r.keyPath = Wl, Ul !== r.context && console.error(
                "Popping the context provider did not return back to the original snapshot. This is a bug in React."
              );
              return;
            case Qc:
              var vo = d._context, ta = y.children;
              typeof ta != "function" && console.error(
                "A context consumer was rendered with multiple children, or a child that isn't a function. A context consumer expects a single child that is a function. If you did pass a function, make sure there is no trailing or leading whitespace around it."
              );
              var ps = ta(vo._currentValue2), Kr = r.keyPath;
              r.keyPath = u, $e(n, r, ps, -1), r.keyPath = Kr;
              return;
            case El:
              var ui = Ms(d);
              if (n.status === 12) throw null;
              So(n, r, u, ui, y, E);
              return;
          }
        var zc = "";
        throw (d === void 0 || typeof d == "object" && d !== null && Object.keys(d).length === 0) && (zc += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports."), Error(
          "Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: " + ((d == null ? d : typeof d) + "." + zc)
        );
      }
    }
    function Ni(n, r, u, d, y) {
      var E = r.replay, F = r.blockedBoundary, I = Ur(
        n,
        0,
        null,
        r.formatContext,
        !1,
        !1
      );
      I.id = u, I.parentFlushed = !0;
      try {
        r.replay = null, r.blockedSegment = I, It(n, r, d, y), I.status = Mr, F === null ? n.completedRootSegment = I : (Wa(F, I), F.parentFlushed && n.partialBoundaries.push(F));
      } finally {
        r.replay = E, r.blockedSegment = null;
      }
    }
    function zi(n, r, u, d, y, E, F, I, te, B) {
      E = B.nodes;
      for (var j = 0; j < E.length; j++) {
        var ge = E[j];
        if (y === ge[1]) {
          if (ge.length === 4) {
            if (d !== null && d !== ge[0])
              throw Error(
                "Expected the resume to render <" + ge[0] + "> in this slot but instead it rendered <" + d + ">. The tree doesn't match so React will fallback to client rendering."
              );
            var Ce = ge[2];
            d = ge[3], y = r.node, r.replay = { nodes: Ce, slots: d, pendingTasks: 1 };
            try {
              if (So(n, r, u, F, I, te), r.replay.pendingTasks === 1 && 0 < r.replay.nodes.length)
                throw Error(
                  "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                );
              r.replay.pendingTasks--;
            } catch ($t) {
              if (typeof $t == "object" && $t !== null && ($t === Or || typeof $t.then == "function"))
                throw r.node === y ? r.replay = B : E.splice(j, 1), $t;
              r.replay.pendingTasks--, F = ca(r.componentStack), I = n, n = r.blockedBoundary, u = $t, te = d, d = Yr(I, u, F, r.debugTask), Ui(
                I,
                n,
                Ce,
                te,
                u,
                d,
                F,
                !1
              );
            }
            r.replay = B;
          } else {
            if (F !== rl)
              throw Error(
                "Expected the resume to render <Suspense> in this slot but instead it rendered <" + (dt(F) || "Unknown") + ">. The tree doesn't match so React will fallback to client rendering."
              );
            e: {
              B = void 0, d = ge[5], F = ge[2], te = ge[3], y = ge[4] === null ? [] : ge[4][2], ge = ge[4] === null ? null : ge[4][3];
              var be = r.keyPath, ae = r.formatContext, fn = r.row, Qn = r.replay, Ye = r.blockedBoundary, Fn = r.hoistableState, vr = I.children, br = I.fallback, Mn = /* @__PURE__ */ new Set();
              I = Zc(
                n,
                r.row,
                Mn,
                null,
                null
              ), I.parentFlushed = !0, I.rootSegmentID = d, r.blockedBoundary = I, r.hoistableState = I.contentState, r.keyPath = u, r.formatContext = nt(
                n.resumableState,
                ae
              ), r.row = null, r.replay = { nodes: F, slots: te, pendingTasks: 1 };
              try {
                if (It(n, r, vr, -1), r.replay.pendingTasks === 1 && 0 < r.replay.nodes.length)
                  throw Error(
                    "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                  );
                if (r.replay.pendingTasks--, I.pendingTasks === 0 && I.status === $i) {
                  I.status = Mr, n.completedBoundaries.push(I);
                  break e;
                }
              } catch ($t) {
                I.status = ar, Ce = ca(r.componentStack), B = Yr(
                  n,
                  $t,
                  Ce,
                  r.debugTask
                ), ko(I, B, $t, Ce, !1), r.replay.pendingTasks--, n.clientRenderedBoundaries.push(I);
              } finally {
                r.blockedBoundary = Ye, r.hoistableState = Fn, r.replay = Qn, r.keyPath = be, r.formatContext = ae, r.row = fn;
              }
              I = fc(
                n,
                null,
                { nodes: y, slots: ge, pendingTasks: 0 },
                br,
                -1,
                Ye,
                I.fallbackState,
                Mn,
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
                we,
                r.debugTask
              ), Wr(I), n.pingedTasks.push(I);
            }
          }
          E.splice(j, 1);
          break;
        }
      }
    }
    function Po(n, r, u, d, y) {
      d === r ? (u !== -1 || n.componentStack === null || typeof n.componentStack.type != "function" || Object.prototype.toString.call(n.componentStack.type) !== "[object GeneratorFunction]" || Object.prototype.toString.call(d) !== "[object Generator]") && (Mc || console.error(
        "Using Iterators as children is unsupported and will likely yield unexpected results because enumerating a generator mutates it. You may convert it to an array with `Array.from()` or the `[...spread]` operator before rendering. You can also use an Iterable that can iterate multiple times over the same items."
      ), Mc = !0) : r.entries !== y || oi || (console.error(
        "Using Maps as children is not supported. Use an array of keyed ReactElements instead."
      ), oi = !0);
    }
    function $e(n, r, u, d) {
      r.replay !== null && typeof r.replay.slots == "number" ? Ni(n, r, r.replay.slots, u, d) : (r.node = u, r.childIndex = d, u = r.componentStack, d = r.debugTask, Wr(r), ql(n, r), r.componentStack = u, r.debugTask = d);
    }
    function ql(n, r) {
      var u = r.node, d = r.childIndex;
      if (u !== null) {
        if (typeof u == "object") {
          switch (u.$$typeof) {
            case Ya:
              var y = u.type, E = u.key;
              u = u.props;
              var F = u.ref;
              F = F !== void 0 ? F : null;
              var I = r.debugTask, te = dt(y);
              E = E ?? (d === -1 ? 0 : d);
              var B = [r.keyPath, te, E];
              r.replay !== null ? I ? I.run(
                zi.bind(
                  null,
                  n,
                  r,
                  B,
                  te,
                  E,
                  d,
                  y,
                  u,
                  F,
                  r.replay
                )
              ) : zi(
                n,
                r,
                B,
                te,
                E,
                d,
                y,
                u,
                F,
                r.replay
              ) : I ? I.run(
                So.bind(
                  null,
                  n,
                  r,
                  B,
                  y,
                  u,
                  F
                )
              ) : So(n, r, B, y, u, F);
              return;
            case Dt:
              throw Error(
                "Portals are not currently supported by the server renderer. Render them conditionally so that they only appear on the client render."
              );
            case El:
              if (y = Ms(u), n.status === 12) throw null;
              $e(n, r, y, d);
              return;
          }
          if (Yi(u)) {
            pi(n, r, u, d);
            return;
          }
          if ((E = W(u)) && (y = E.call(u))) {
            if (Po(r, u, d, y, E), u = y.next(), !u.done) {
              E = [];
              do
                E.push(u.value), u = y.next();
              while (!u.done);
              pi(n, r, E, d);
            }
            return;
          }
          if (typeof u.then == "function")
            return r.thenableState = null, $e(
              n,
              r,
              pl(u),
              d
            );
          if (u.$$typeof === wl)
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
        typeof u == "string" ? (r = r.blockedSegment, r !== null && (r.lastPushedText = Ql(
          r.chunks,
          u,
          n.renderState,
          r.lastPushedText
        ))) : typeof u == "number" || typeof u == "bigint" ? (r = r.blockedSegment, r !== null && (r.lastPushedText = Ql(
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
    function Mt(n, r, u) {
      if (u !== null && typeof u == "object" && (u.$$typeof === Ya || u.$$typeof === Dt) && u._store && (!u._store.validated && u.key == null || u._store.validated === 2)) {
        if (typeof u._store != "object")
          throw Error(
            "React Component in warnForMissingKey should have a _store. This error is likely caused by a bug in React. Please file an issue."
          );
        u._store.validated = 1;
        var d = n.didWarnForKey;
        if (d == null && (d = n.didWarnForKey = /* @__PURE__ */ new WeakSet()), n = r.componentStack, n !== null && !d.has(n)) {
          d.add(n);
          var y = dt(u.type);
          d = u._owner;
          var E = n.owner;
          if (n = "", E && typeof E.type < "u") {
            var F = dt(E.type);
            F && (n = `

Check the render method of \`` + F + "`.");
          }
          n || y && (n = `

Check the top-level render call using <` + y + ">."), y = "", d != null && E !== d && (E = null, typeof d.type < "u" ? E = dt(d.type) : typeof d.name == "string" && (E = d.name), E && (y = " It was passed a child from " + E + ".")), d = r.componentStack, r.componentStack = {
            parent: r.componentStack,
            type: u.type,
            owner: u._owner,
            stack: u._debugStack
          }, console.error(
            'Each child in a list should have a unique "key" prop.%s%s See https://react.dev/link/warning-keys for more information.',
            n,
            y
          ), r.componentStack = d;
        }
      }
    }
    function pi(n, r, u, d) {
      var y = r.keyPath, E = r.componentStack, F = r.debugTask;
      if (hc(r, r.node._debugInfo), d !== -1 && (r.keyPath = [r.keyPath, "Fragment", d], r.replay !== null)) {
        for (var I = r.replay, te = I.nodes, B = 0; B < te.length; B++) {
          var j = te[B];
          if (j[1] === d) {
            d = j[2], j = j[3], r.replay = { nodes: d, slots: j, pendingTasks: 1 };
            try {
              if (pi(n, r, u, -1), r.replay.pendingTasks === 1 && 0 < r.replay.nodes.length)
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
              var Ce = ae, be = j;
              j = Yr(
                n,
                Ce,
                ge,
                r.debugTask
              ), Ui(
                n,
                u,
                d,
                be,
                Ce,
                j,
                ge,
                !1
              );
            }
            r.replay = I, te.splice(B, 1);
            break;
          }
        }
        r.keyPath = y, r.componentStack = E, r.debugTask = F;
        return;
      }
      if (I = r.treeContext, te = u.length, r.replay !== null && (B = r.replay.slots, B !== null && typeof B == "object")) {
        for (d = 0; d < te; d++)
          j = u[d], r.treeContext = Cn(
            I,
            te,
            d
          ), Ce = B[d], typeof Ce == "number" ? (Ni(n, r, Ce, j, d), delete B[d]) : It(n, r, j, d);
        r.treeContext = I, r.keyPath = y, r.componentStack = E, r.debugTask = F;
        return;
      }
      for (B = 0; B < te; B++)
        d = u[B], Mt(n, r, d), r.treeContext = Cn(I, te, B), It(n, r, d, B);
      r.treeContext = I, r.keyPath = y, r.componentStack = E, r.debugTask = F;
    }
    function Vt(n, r, u) {
      if (u.status = il, u.rootSegmentID = n.nextSegmentId++, n = u.trackedContentKeyPath, n === null)
        throw Error(
          "It should not be possible to postpone at the root. This is a bug in React."
        );
      var d = u.trackedFallbackNode, y = [], E = r.workingMap.get(n);
      return E === void 0 ? (u = [
        n[1],
        n[2],
        y,
        null,
        d,
        u.rootSegmentID
      ], r.workingMap.set(n, u), ei(u, n[0], r), u) : (E[4] = d, E[5] = u.rootSegmentID, E);
    }
    function ua(n, r, u, d) {
      d.status = il;
      var y = u.keyPath, E = u.blockedBoundary;
      if (E === null)
        d.id = n.nextSegmentId++, r.rootSlots = d.id, n.completedRootSegment !== null && (n.completedRootSegment.status = il);
      else {
        if (E !== null && E.status === $i) {
          var F = Vt(
            n,
            r,
            E
          );
          if (E.trackedContentKeyPath === y && u.childIndex === -1) {
            d.id === -1 && (d.id = d.parentFlushed ? E.rootSegmentID : n.nextSegmentId++), F[3] = d.id;
            return;
          }
        }
        if (d.id === -1 && (d.id = d.parentFlushed && E !== null ? E.rootSegmentID : n.nextSegmentId++), u.childIndex === -1)
          y === null ? r.rootSlots = d.id : (u = r.workingMap.get(y), u === void 0 ? (u = [y[1], y[2], [], d.id], ei(u, y[0], r)) : u[3] = d.id);
        else {
          if (y === null) {
            if (n = r.rootSlots, n === null)
              n = r.rootSlots = {};
            else if (typeof n == "number")
              throw Error(
                "It should not be possible to postpone both at the root of an element as well as a slot below. This is a bug in React."
              );
          } else if (E = r.workingMap, F = E.get(y), F === void 0)
            n = {}, F = [y[1], y[2], [], n], E.set(y, F), ei(F, y[0], r);
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
    function Ha(n, r) {
      n = n.trackedPostpones, n !== null && (r = r.trackedContentKeyPath, r !== null && (r = n.workingMap.get(r), r !== void 0 && (r.length = 4, r[2] = [], r[3] = null)));
    }
    function wi(n, r, u) {
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
        we,
        r.debugTask
      );
    }
    function Hi(n, r, u) {
      var d = r.blockedSegment, y = Ur(
        n,
        d.chunks.length,
        null,
        r.formatContext,
        d.lastPushedText,
        !0
      );
      return d.children.push(y), d.lastPushedText = !1, bi(
        n,
        u,
        r.node,
        r.childIndex,
        r.blockedBoundary,
        y,
        r.blockedPreamble,
        r.hoistableState,
        r.abortSet,
        r.keyPath,
        r.formatContext,
        r.context,
        r.treeContext,
        r.row,
        r.componentStack,
        we,
        r.debugTask
      );
    }
    function It(n, r, u, d) {
      var y = r.formatContext, E = r.context, F = r.keyPath, I = r.treeContext, te = r.componentStack, B = r.debugTask, j = r.blockedSegment;
      if (j === null) {
        j = r.replay;
        try {
          return $e(n, r, u, d);
        } catch (be) {
          if (sr(), u = be === Or ? ac() : be, n.status !== 12 && typeof u == "object" && u !== null) {
            if (typeof u.then == "function") {
              d = be === Or ? Jl() : null, n = wi(
                n,
                r,
                d
              ).ping, u.then(n, n), r.formatContext = y, r.context = E, r.keyPath = F, r.treeContext = I, r.componentStack = te, r.replay = j, r.debugTask = B, Yn(E);
              return;
            }
            if (u.message === "Maximum call stack size exceeded") {
              u = be === Or ? Jl() : null, u = wi(n, r, u), n.pingedTasks.push(u), r.formatContext = y, r.context = E, r.keyPath = F, r.treeContext = I, r.componentStack = te, r.replay = j, r.debugTask = B, Yn(E);
              return;
            }
          }
        }
      } else {
        var ge = j.children.length, Ce = j.chunks.length;
        try {
          return $e(n, r, u, d);
        } catch (be) {
          if (sr(), j.children.length = ge, j.chunks.length = Ce, u = be === Or ? ac() : be, n.status !== 12 && typeof u == "object" && u !== null) {
            if (typeof u.then == "function") {
              j = u, u = be === Or ? Jl() : null, n = Hi(n, r, u).ping, j.then(n, n), r.formatContext = y, r.context = E, r.keyPath = F, r.treeContext = I, r.componentStack = te, r.debugTask = B, Yn(E);
              return;
            }
            if (u.message === "Maximum call stack size exceeded") {
              j = be === Or ? Jl() : null, j = Hi(n, r, j), n.pingedTasks.push(j), r.formatContext = y, r.context = E, r.keyPath = F, r.treeContext = I, r.componentStack = te, r.debugTask = B, Yn(E);
              return;
            }
          }
        }
      }
      throw r.formatContext = y, r.context = E, r.keyPath = F, r.treeContext = I, Yn(E), u;
    }
    function Bi(n) {
      var r = n.blockedBoundary, u = n.blockedSegment;
      u !== null && (u.status = Nl, $l(this, r, n.row, u));
    }
    function Ui(n, r, u, d, y, E, F, I) {
      for (var te = 0; te < u.length; te++) {
        var B = u[te];
        if (B.length === 4)
          Ui(
            n,
            r,
            B[2],
            B[3],
            y,
            E,
            F,
            I
          );
        else {
          var j = n;
          B = B[5];
          var ge = y, Ce = E, be = F, ae = I, fn = Zc(
            j,
            null,
            /* @__PURE__ */ new Set(),
            null,
            null
          );
          fn.parentFlushed = !0, fn.rootSegmentID = B, fn.status = ar, ko(
            fn,
            Ce,
            ge,
            be,
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
          y,
          F,
          I
        ), r.parentFlushed && n.clientRenderedBoundaries.push(r)), typeof d == "object")
          for (var Qn in d) delete d[Qn];
      }
    }
    function Ba(n, r, u) {
      var d = n.blockedBoundary, y = n.blockedSegment;
      if (y !== null) {
        if (y.status === 6) return;
        y.status = Nl;
      }
      var E = ca(n.componentStack), F = n.node;
      if (F !== null && typeof F == "object" && Su(n, F._debugInfo), d === null) {
        if (r.status !== 13 && r.status !== ea) {
          if (d = n.replay, d === null) {
            r.trackedPostpones !== null && y !== null ? (d = r.trackedPostpones, Yr(r, u, E, n.debugTask), ua(r, d, n, y), $l(r, null, n.row, y)) : (Yr(r, u, E, n.debugTask), Kt(r, u, E, n.debugTask));
            return;
          }
          d.pendingTasks--, d.pendingTasks === 0 && 0 < d.nodes.length && (y = Yr(r, u, E, null), Ui(
            r,
            null,
            d.nodes,
            d.slots,
            u,
            y,
            E,
            !0
          )), r.pendingRootTasks--, r.pendingRootTasks === 0 && Ua(r);
        }
      } else {
        if (F = r.trackedPostpones, d.status !== ar) {
          if (F !== null && y !== null)
            return Yr(r, u, E, n.debugTask), ua(r, F, n, y), d.fallbackAbortableTasks.forEach(function(I) {
              return Ba(I, r, u);
            }), d.fallbackAbortableTasks.clear(), $l(r, d, n.row, y);
          d.status = ar, y = Yr(
            r,
            u,
            E,
            n.debugTask
          ), d.status = ar, ko(d, y, u, E, !0), Ha(r, d), d.parentFlushed && r.clientRenderedBoundaries.push(d);
        }
        d.pendingTasks--, E = d.row, E !== null && --E.pendingTasks === 0 && jn(r, E), d.fallbackAbortableTasks.forEach(function(I) {
          return Ba(I, r, u);
        }), d.fallbackAbortableTasks.clear();
      }
      n = n.row, n !== null && --n.pendingTasks === 0 && jn(r, n), r.allPendingTasks--, r.allPendingTasks === 0 && Gr(r);
    }
    function sa(n, r) {
      try {
        var u = n.renderState, d = u.onHeaders;
        if (d) {
          var y = u.headers;
          if (y) {
            u.headers = null;
            var E = y.preconnects;
            if (y.fontPreloads && (E && (E += ", "), E += y.fontPreloads), y.highImagePreloads && (E && (E += ", "), E += y.highImagePreloads), !r) {
              var F = u.styles.values(), I = F.next();
              e: for (; 0 < y.remainingCapacity && !I.done; I = F.next())
                for (var te = I.value.sheets.values(), B = te.next(); 0 < y.remainingCapacity && !B.done; B = te.next()) {
                  var j = B.value, ge = j.props, Ce = ge.href, be = j.props, ae = R(
                    be.href,
                    "style",
                    {
                      crossOrigin: be.crossOrigin,
                      integrity: be.integrity,
                      nonce: be.nonce,
                      type: be.type,
                      fetchPriority: be.fetchPriority,
                      referrerPolicy: be.referrerPolicy,
                      media: be.media
                    }
                  );
                  if (0 <= (y.remainingCapacity -= ae.length + 2))
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
      n.trackedPostpones === null && sa(n, !0), n.trackedPostpones === null && Ao(n), n.onShellError = dn, n = n.onShellReady, n();
    }
    function Gr(n) {
      sa(
        n,
        n.trackedPostpones === null ? !0 : n.completedRootSegment === null || n.completedRootSegment.status !== il
      ), Ao(n), n = n.onAllReady, n();
    }
    function Wa(n, r) {
      if (r.chunks.length === 0 && r.children.length === 1 && r.children[0].boundary === null && r.children[0].id === -1) {
        var u = r.children[0];
        u.id = r.id, u.parentFlushed = !0, u.status !== Mr && u.status !== Nl && u.status !== Dn || Wa(n, u);
      } else n.completedSegments.push(r);
    }
    function $l(n, r, u, d) {
      if (u !== null && (--u.pendingTasks === 0 ? jn(n, u) : u.together && Di(n, u)), n.allPendingTasks--, r === null) {
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
          if (r.status === $i && (r.status = Mr), d !== null && d.parentFlushed && (d.status === Mr || d.status === Nl) && Wa(r, d), r.parentFlushed && n.completedBoundaries.push(r), r.status === Mr)
            u = r.row, u !== null && an(u.hoistables, r.contentState), cc(n, r) || (r.fallbackAbortableTasks.forEach(
              Bi,
              n
            ), r.fallbackAbortableTasks.clear(), u !== null && --u.pendingTasks === 0 && jn(n, u)), n.pendingRootTasks === 0 && n.trackedPostpones === null && r.contentPreamble !== null && Ao(n);
          else if (r.status === il && (r = r.row, r !== null)) {
            if (n.trackedPostpones !== null) {
              u = n.trackedPostpones;
              var y = r.next;
              if (y !== null && (d = y.boundaries, d !== null))
                for (y.boundaries = null, y = 0; y < d.length; y++) {
                  var E = d[y];
                  Vt(n, u, E), $l(n, E, null, null);
                }
            }
            --r.pendingTasks === 0 && jn(n, r);
          }
        } else
          d === null || !d.parentFlushed || d.status !== Mr && d.status !== Nl || (Wa(r, d), r.completedSegments.length === 1 && r.parentFlushed && n.partialBoundaries.push(r)), r = r.row, r !== null && r.together && Di(n, r);
      n.allPendingTasks === 0 && Gr(n);
    }
    function Fu(n) {
      if (n.status !== ea && n.status !== 13) {
        var r = Ve, u = gt.H;
        gt.H = uo;
        var d = gt.A;
        gt.A = ds;
        var y = zt;
        zt = n;
        var E = gt.getCurrentStack;
        gt.getCurrentStack = Kl;
        var F = hs;
        hs = n.resumableState;
        try {
          var I = n.pingedTasks, te;
          for (te = 0; te < I.length; te++) {
            var B = n, j = I[te], ge = j.blockedSegment;
            if (ge === null) {
              var Ce = void 0, be = B;
              if (B = j, B.replay.pendingTasks !== 0) {
                Yn(B.context), Ce = Ll, Ll = B;
                try {
                  if (typeof B.replay.slots == "number" ? Ni(
                    be,
                    B,
                    B.replay.slots,
                    B.node,
                    B.childIndex
                  ) : ql(be, B), B.replay.pendingTasks === 1 && 0 < B.replay.nodes.length)
                    throw Error(
                      "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                    );
                  B.replay.pendingTasks--, B.abortSet.delete(B), $l(
                    be,
                    B.blockedBoundary,
                    B.row,
                    null
                  );
                } catch (ct) {
                  sr();
                  var ae = ct === Or ? ac() : ct;
                  if (typeof ae == "object" && ae !== null && typeof ae.then == "function") {
                    var fn = B.ping;
                    ae.then(fn, fn), B.thenableState = ct === Or ? Jl() : null;
                  } else {
                    B.replay.pendingTasks--, B.abortSet.delete(B);
                    var Qn = ca(B.componentStack), Ye = void 0, Fn = be, vr = B.blockedBoundary, br = be.status === 12 ? be.fatalError : ae, Mn = Qn, $t = B.replay.nodes, ki = B.replay.slots;
                    Ye = Yr(
                      Fn,
                      br,
                      Mn,
                      B.debugTask
                    ), Ui(
                      Fn,
                      vr,
                      $t,
                      ki,
                      br,
                      Ye,
                      Mn,
                      !1
                    ), be.pendingRootTasks--, be.pendingRootTasks === 0 && Ua(be), be.allPendingTasks--, be.allPendingTasks === 0 && Gr(be);
                  }
                } finally {
                  Ll = Ce;
                }
              }
            } else if (be = Ce = void 0, Ye = j, Fn = ge, Fn.status === $i) {
              Fn.status = 6, Yn(Ye.context), be = Ll, Ll = Ye;
              var Jr = Fn.children.length, _e = Fn.chunks.length;
              try {
                ql(B, Ye), nl(
                  Fn.chunks,
                  B.renderState,
                  Fn.lastPushedText,
                  Fn.textEmbedded
                ), Ye.abortSet.delete(Ye), Fn.status = Mr, $l(
                  B,
                  Ye.blockedBoundary,
                  Ye.row,
                  Fn
                );
              } catch (ct) {
                sr(), Fn.children.length = Jr, Fn.chunks.length = _e;
                var Bn = ct === Or ? ac() : B.status === 12 ? B.fatalError : ct;
                if (B.status === 12 && B.trackedPostpones !== null) {
                  var Un = B.trackedPostpones, Xn = ca(Ye.componentStack);
                  Ye.abortSet.delete(Ye), Yr(
                    B,
                    Bn,
                    Xn,
                    Ye.debugTask
                  ), ua(
                    B,
                    Un,
                    Ye,
                    Fn
                  ), $l(
                    B,
                    Ye.blockedBoundary,
                    Ye.row,
                    Fn
                  );
                } else if (typeof Bn == "object" && Bn !== null && typeof Bn.then == "function") {
                  Fn.status = $i, Ye.thenableState = ct === Or ? Jl() : null;
                  var wt = Ye.ping;
                  Bn.then(wt, wt);
                } else {
                  var wn = ca(
                    Ye.componentStack
                  );
                  Ye.abortSet.delete(Ye), Fn.status = Dn;
                  var tn = Ye.blockedBoundary, Ir = Ye.row, Wn = Ye.debugTask;
                  if (Ir !== null && --Ir.pendingTasks === 0 && jn(B, Ir), B.allPendingTasks--, Ce = Yr(
                    B,
                    Bn,
                    wn,
                    Wn
                  ), tn === null)
                    Kt(
                      B,
                      Bn,
                      wn,
                      Wn
                    );
                  else if (tn.pendingTasks--, tn.status !== ar) {
                    tn.status = ar, ko(
                      tn,
                      Ce,
                      Bn,
                      wn,
                      !1
                    ), Ha(B, tn);
                    var yr = tn.row;
                    yr !== null && --yr.pendingTasks === 0 && jn(B, yr), tn.parentFlushed && B.clientRenderedBoundaries.push(tn), B.pendingRootTasks === 0 && B.trackedPostpones === null && tn.contentPreamble !== null && Ao(B);
                  }
                  B.allPendingTasks === 0 && Gr(B);
                }
              } finally {
                Ll = be;
              }
            }
          }
          I.splice(0, te), n.destination !== null && gc(
            n,
            n.destination
          );
        } catch (ct) {
          I = {}, Yr(n, ct, I, null), Kt(n, ct, I, null);
        } finally {
          hs = F, gt.H = u, gt.A = d, gt.getCurrentStack = E, u === uo && Yn(r), zt = y;
        }
      }
    }
    function Ou(n, r, u) {
      r.preambleChildren.length && u.push(r.preambleChildren);
      for (var d = !1, y = 0; y < r.children.length; y++)
        d = _u(
          n,
          r.children[y],
          u
        ) || d;
      return d;
    }
    function _u(n, r, u) {
      var d = r.boundary;
      if (d === null)
        return Ou(
          n,
          r,
          u
        );
      var y = d.contentPreamble, E = d.fallbackPreamble;
      if (y === null || E === null) return !1;
      switch (d.status) {
        case Mr:
          if (Gt(n.renderState, y), n.byteSize += d.byteSize, r = d.completedSegments[0], !r)
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
          if (r.status === Mr)
            return Gt(n.renderState, E), Ou(
              n,
              r,
              u
            );
        default:
          return !0;
      }
    }
    function Ao(n) {
      if (n.completedRootSegment && n.completedPreambleSegments === null) {
        var r = [], u = n.byteSize, d = _u(
          n,
          n.completedRootSegment,
          r
        ), y = n.renderState.preamble;
        d === !1 || y.headChunks && y.bodyChunks ? n.completedPreambleSegments = r : n.byteSize = u;
      }
    }
    function Fo(n, r, u, d) {
      switch (u.parentFlushed = !0, u.status) {
        case $i:
          u.id = n.nextSegmentId++;
        case il:
          return d = u.id, u.lastPushedText = !1, u.textEmbedded = !1, n = n.renderState, r.push(Qi), r.push(n.placeholderPrefix), n = d.toString(16), r.push(n), r.push(Rc);
        case Mr:
          u.status = Aa;
          var y = !0, E = u.chunks, F = 0;
          u = u.children;
          for (var I = 0; I < u.length; I++) {
            for (y = u[I]; F < y.index; F++)
              r.push(E[F]);
            y = Oo(n, r, y, d);
          }
          for (; F < E.length - 1; F++)
            r.push(E[F]);
          return F < E.length && (y = r.push(E[F])), y;
        case Nl:
          return !0;
        default:
          throw Error(
            "Aborted, errored or already flushed boundaries should not be flushed again. This is a bug in React."
          );
      }
    }
    function Oo(n, r, u, d) {
      var y = u.boundary;
      if (y === null)
        return Fo(n, r, u, d);
      if (y.parentFlushed = !0, y.status === ar) {
        var E = y.row;
        if (E !== null && --E.pendingTasks === 0 && jn(n, E), !n.renderState.generateStaticMarkup) {
          var F = y.errorDigest, I = y.errorMessage;
          E = y.errorStack, y = y.errorComponentStack, r.push(Cc), r.push(Lo), F && (r.push(Ot), F = Me(F), r.push(F), r.push(
            ja
          )), I && (r.push(Cl), I = Me(I), r.push(I), r.push(
            ja
          )), E && (r.push(un), E = Me(E), r.push(E), r.push(
            ja
          )), y && (r.push(Ki), E = Me(y), r.push(E), r.push(
            ja
          )), r.push(No);
        }
        return Fo(n, r, u, d), n = n.renderState.generateStaticMarkup ? !0 : r.push(Ta), n;
      }
      if (y.status !== Mr)
        return y.status === $i && (y.rootSegmentID = n.nextSegmentId++), 0 < y.completedSegments.length && n.partialBoundaries.push(y), Xt(
          r,
          n.renderState,
          y.rootSegmentID
        ), d && an(d, y.fallbackState), Fo(n, r, u, d), r.push(Ta);
      if (!Ic && cc(n, y) && ho + y.byteSize > n.progressiveChunkSize)
        return y.rootSegmentID = n.nextSegmentId++, n.completedBoundaries.push(y), Xt(
          r,
          n.renderState,
          y.rootSegmentID
        ), Fo(n, r, u, d), r.push(Ta);
      if (ho += y.byteSize, d && an(d, y.contentState), u = y.row, u !== null && cc(n, y) && --u.pendingTasks === 0 && jn(n, u), n.renderState.generateStaticMarkup || r.push(Ji), u = y.completedSegments, u.length !== 1)
        throw Error(
          "A previously unvisited boundary must have exactly one root segment. This is a bug in React."
        );
      return Oo(n, r, u[0], d), n = n.renderState.generateStaticMarkup ? !0 : r.push(Ta), n;
    }
    function jt(n, r, u, d) {
      return Ie(
        r,
        n.renderState,
        u.parentFormatContext,
        u.id
      ), Oo(n, r, u, d), xr(r, u.parentFormatContext);
    }
    function ls(n, r, u) {
      ho = u.byteSize;
      for (var d = u.completedSegments, y = 0; y < d.length; y++)
        fa(
          n,
          r,
          u,
          d[y]
        );
      d.length = 0, d = u.row, d !== null && cc(n, u) && --d.pendingTasks === 0 && jn(n, d), rr(
        r,
        u.contentState,
        n.renderState
      ), d = n.resumableState, n = n.renderState, y = u.rootSegmentID, u = u.contentState;
      var E = n.stylesToHoist;
      return n.stylesToHoist = !1, r.push(n.startInlineScript), r.push(sn), E ? ((d.instructions & w) === o && (d.instructions |= w, r.push(Ra)), (d.instructions & g) === o && (d.instructions |= g, r.push(Nt)), (d.instructions & m) === o ? (d.instructions |= m, r.push(Pc)) : r.push(Ac)) : ((d.instructions & g) === o && (d.instructions |= g, r.push(Nt)), r.push(iu)), d = y.toString(16), r.push(n.boundaryPrefix), r.push(d), r.push(au), r.push(n.segmentPrefix), r.push(d), E ? (r.push(Wu), aa(r, u)) : r.push(ou), u = r.push(cu), Xl(r, n) && u;
    }
    function fa(n, r, u, d) {
      if (d.status === Aa) return !0;
      var y = u.contentState, E = d.id;
      if (E === -1) {
        if ((d.id = u.rootSegmentID) === -1)
          throw Error(
            "A root segment ID must have been assigned by now. This is a bug in React."
          );
        return jt(
          n,
          r,
          d,
          y
        );
      }
      return E === u.rootSegmentID ? jt(
        n,
        r,
        d,
        y
      ) : (jt(n, r, d, y), u = n.resumableState, n = n.renderState, r.push(n.startInlineScript), r.push(sn), (u.instructions & f) === o ? (u.instructions |= f, r.push(Hu)) : r.push(lu), r.push(n.segmentPrefix), E = E.toString(16), r.push(E), r.push(Bu), r.push(n.placeholderPrefix), r.push(E), r = r.push(Uu), r);
    }
    function gc(n, r) {
      try {
        if (!(0 < n.pendingRootTasks)) {
          var u, d = n.completedRootSegment;
          if (d !== null) {
            if (d.status === il) return;
            var y = n.completedPreambleSegments;
            if (y === null) return;
            ho = n.byteSize;
            var E = n.resumableState, F = n.renderState, I = F.preamble, te = I.htmlChunks, B = I.headChunks, j;
            if (te) {
              for (j = 0; j < te.length; j++)
                r.push(te[j]);
              if (B)
                for (j = 0; j < B.length; j++)
                  r.push(B[j]);
              else {
                var ge = mt("head");
                r.push(ge), r.push(sn);
              }
            } else if (B)
              for (j = 0; j < B.length; j++)
                r.push(B[j]);
            var Ce = F.charsetChunks;
            for (j = 0; j < Ce.length; j++)
              r.push(Ce[j]);
            Ce.length = 0, F.preconnects.forEach(Nn, r), F.preconnects.clear();
            var be = F.viewportChunks;
            for (j = 0; j < be.length; j++)
              r.push(be[j]);
            be.length = 0, F.fontPreloads.forEach(Nn, r), F.fontPreloads.clear(), F.highImagePreloads.forEach(Nn, r), F.highImagePreloads.clear(), re = F, F.styles.forEach(ht, r), re = null;
            var ae = F.importMapChunks;
            for (j = 0; j < ae.length; j++)
              r.push(ae[j]);
            ae.length = 0, F.bootstrapScripts.forEach(Nn, r), F.scripts.forEach(Nn, r), F.scripts.clear(), F.bulkPreloads.forEach(Nn, r), F.bulkPreloads.clear(), E.instructions |= P;
            var fn = F.hoistableChunks;
            for (j = 0; j < fn.length; j++)
              r.push(fn[j]);
            for (E = fn.length = 0; E < y.length; E++) {
              var Qn = y[E];
              for (F = 0; F < Qn.length; F++)
                Oo(n, r, Qn[F], null);
            }
            var Ye = n.renderState.preamble, Fn = Ye.headChunks;
            if (Ye.htmlChunks || Fn) {
              var vr = St("head");
              r.push(vr);
            }
            var br = Ye.bodyChunks;
            if (br)
              for (y = 0; y < br.length; y++)
                r.push(br[y]);
            Oo(n, r, d, null), n.completedRootSegment = null;
            var Mn = n.renderState;
            if (n.allPendingTasks !== 0 || n.clientRenderedBoundaries.length !== 0 || n.completedBoundaries.length !== 0 || n.trackedPostpones !== null && (n.trackedPostpones.rootNodes.length !== 0 || n.trackedPostpones.rootSlots !== null)) {
              var $t = n.resumableState;
              if (($t.instructions & V) === o) {
                if ($t.instructions |= V, r.push(Mn.startInlineScript), ($t.instructions & P) === o) {
                  $t.instructions |= P;
                  var ki = "_" + $t.idPrefix + "R_";
                  r.push(Uo);
                  var Jr = Me(ki);
                  r.push(Jr), r.push(qe);
                }
                r.push(sn), r.push(Rl), r.push($);
              }
            }
            Xl(r, Mn);
          }
          var _e = n.renderState;
          d = 0;
          var Bn = _e.viewportChunks;
          for (d = 0; d < Bn.length; d++)
            r.push(Bn[d]);
          Bn.length = 0, _e.preconnects.forEach(Nn, r), _e.preconnects.clear(), _e.fontPreloads.forEach(Nn, r), _e.fontPreloads.clear(), _e.highImagePreloads.forEach(
            Nn,
            r
          ), _e.highImagePreloads.clear(), _e.styles.forEach(xo, r), _e.scripts.forEach(Nn, r), _e.scripts.clear(), _e.bulkPreloads.forEach(Nn, r), _e.bulkPreloads.clear();
          var Un = _e.hoistableChunks;
          for (d = 0; d < Un.length; d++)
            r.push(Un[d]);
          Un.length = 0;
          var Xn = n.clientRenderedBoundaries;
          for (u = 0; u < Xn.length; u++) {
            var wt = Xn[u];
            _e = r;
            var wn = n.resumableState, tn = n.renderState, Ir = wt.rootSegmentID, Wn = wt.errorDigest, yr = wt.errorMessage, ct = wt.errorStack, al = wt.errorComponentStack;
            _e.push(tn.startInlineScript), _e.push(sn), (wn.instructions & w) === o ? (wn.instructions |= w, _e.push(_l)) : _e.push(cs), _e.push(tn.boundaryPrefix);
            var Jo = Ir.toString(16);
            if (_e.push(Jo), _e.push(to), Wn || yr || ct || al) {
              _e.push(Fc);
              var ol = Pt(
                Wn || ""
              );
              _e.push(ol);
            }
            if (yr || ct || al) {
              _e.push(Fc);
              var Si = Pt(
                yr || ""
              );
              _e.push(Si);
            }
            if (ct || al) {
              _e.push(Fc);
              var Pi = Pt(
                ct || ""
              );
              _e.push(Pi);
            }
            if (al) {
              _e.push(Fc);
              var Ai = Pt(al);
              _e.push(Ai);
            }
            var or = _e.push(
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
          e.splice(0, u), Ic = !0;
          var t = n.partialBoundaries;
          for (u = 0; u < t.length; u++) {
            e: {
              Xn = n, wt = r;
              var c = t[u];
              ho = c.byteSize;
              var h = c.completedSegments;
              for (or = 0; or < h.length; or++)
                if (!fa(
                  Xn,
                  wt,
                  c,
                  h[or]
                )) {
                  or++, h.splice(0, or);
                  var b = !1;
                  break e;
                }
              h.splice(0, or);
              var x = c.row;
              x !== null && x.together && c.pendingTasks === 1 && (x.pendingTasks === 1 ? Pu(
                Xn,
                x,
                x.hoistables
              ) : x.pendingTasks--), b = rr(
                wt,
                c.contentState,
                Xn.renderState
              );
            }
            if (!b) {
              n.destination = null, u++, t.splice(0, u);
              return;
            }
          }
          t.splice(0, u), Ic = !1;
          var S = n.completedBoundaries;
          for (u = 0; u < S.length; u++)
            if (!ls(n, r, S[u])) {
              n.destination = null, u++, S.splice(0, u);
              return;
            }
          S.splice(0, u);
        }
      } finally {
        Ic = !1, n.allPendingTasks === 0 && n.clientRenderedBoundaries.length === 0 && n.completedBoundaries.length === 0 && (n.flushScheduled = !1, u = n.resumableState, u.hasBody && (t = St("body"), r.push(t)), u.hasHtml && (u = St("html"), r.push(u)), n.abortableTasks.size !== 0 && console.error(
          "There was still abortable task at the root when we closed. This is a bug in React."
        ), n.status = ea, r.push(null), n.destination = null);
      }
    }
    function Vc(n) {
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
    function _o(n, r) {
      (n.status === 11 || n.status === 10) && (n.status = 12);
      try {
        var u = n.abortableTasks;
        if (0 < u.size) {
          var d = r === void 0 ? Error("The render was aborted by the server without a reason.") : typeof r == "object" && r !== null && typeof r.then == "function" ? Error("The render was aborted by the server with a promise.") : r;
          n.fatalError = d, u.forEach(function(y) {
            var E = Ll, F = gt.getCurrentStack;
            Ll = y, gt.getCurrentStack = Kl;
            try {
              Ba(y, n, d);
            } finally {
              Ll = E, gt.getCurrentStack = F;
            }
          }), u.clear();
        }
        n.destination !== null && gc(n, n.destination);
      } catch (y) {
        r = {}, Yr(n, y, r, null), Kt(n, y, r, null);
      }
    }
    function ei(n, r, u) {
      if (r === null) u.rootNodes.push(n);
      else {
        var d = u.workingMap, y = d.get(r);
        y === void 0 && (y = [r[1], r[2], [], null], d.set(r, y), ei(y, r[0], u)), y[2].push(n);
      }
    }
    function da() {
    }
    function ga(n, r, u, d) {
      var y = !1, E = null, F = "", I = !1;
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
          I = !0;
        },
        void 0,
        void 0,
        void 0
      ), Vc(n), _o(n, d), ha(n, {
        push: function(te) {
          return te !== null && (F += te), !0;
        },
        destroy: function(te) {
          y = !0, E = te;
        }
      }), y && E !== d) throw E;
      if (!I)
        throw Error(
          "A component suspended while responding to synchronous input. This will cause the UI to be replaced with a loading indicator. To fix, updates that suspend should be wrapped with startTransition."
        );
      return F;
    }
    var Mu = _s(), Es = bf(), Ya = /* @__PURE__ */ Symbol.for("react.transitional.element"), Dt = /* @__PURE__ */ Symbol.for("react.portal"), Ti = /* @__PURE__ */ Symbol.for("react.fragment"), vc = /* @__PURE__ */ Symbol.for("react.strict_mode"), bc = /* @__PURE__ */ Symbol.for("react.profiler"), Qc = /* @__PURE__ */ Symbol.for("react.consumer"), wl = /* @__PURE__ */ Symbol.for("react.context"), Tl = /* @__PURE__ */ Symbol.for("react.forward_ref"), rl = /* @__PURE__ */ Symbol.for("react.suspense"), xl = /* @__PURE__ */ Symbol.for("react.suspense_list"), Gn = /* @__PURE__ */ Symbol.for("react.memo"), El = /* @__PURE__ */ Symbol.for("react.lazy"), lt = /* @__PURE__ */ Symbol.for("react.scope"), ni = /* @__PURE__ */ Symbol.for("react.activity"), Jc = /* @__PURE__ */ Symbol.for("react.legacy_hidden"), Kc = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), jc = /* @__PURE__ */ Symbol.for("react.view_transition"), yc = Symbol.iterator, Yi = Array.isArray, pc = /* @__PURE__ */ new WeakMap(), wc = /* @__PURE__ */ new WeakMap(), Xr = /* @__PURE__ */ Symbol.for("react.client.reference"), it = Object.assign, kn = Object.prototype.hasOwnProperty, va = RegExp(
      "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    ), Ga = {}, Xa = {}, ba = new Set(
      "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
        " "
      )
    ), Iu = /* @__PURE__ */ new Map([
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
    ), Du = RegExp(
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
    ), Va = /^(?:webkit|moz|o)[A-Z]/, hr = /^-ms-/, ir = /-(.)/g, ya = /;\s*$/, qn = {}, Hn = {}, Qa = !1, Mo = !1, $c = /["'&<>]/, Io = /([A-Z])/g, Lu = /^ms-/, Cs = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i, gt = Mu.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Xi = Es.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, os = Object.freeze({
      pending: !1,
      data: null,
      method: null,
      action: null
    }), i = Xi.d;
    Xi.d = {
      f: i.f,
      r: i.r,
      D: function(n) {
        var r = zt || null;
        if (r) {
          var u = r.resumableState, d = r.renderState;
          if (typeof n == "string" && n) {
            if (!u.dnsResources.hasOwnProperty(n)) {
              u.dnsResources[n] = M, u = d.headers;
              var y, E;
              (E = u && 0 < u.remainingCapacity) && (E = (y = "<" + L(n) + ">; rel=dns-prefetch", 0 <= (u.remainingCapacity -= y.length + 2))), E ? (d.resets.dns[n] = M, u.preconnects && (u.preconnects += ", "), u.preconnects += y) : (y = [], Se(y, { href: n, rel: "dns-prefetch" }), d.preconnects.add(y));
            }
            Wi(r);
          }
        } else i.D(n);
      },
      C: function(n, r) {
        var u = zt || null;
        if (u) {
          var d = u.resumableState, y = u.renderState;
          if (typeof n == "string" && n) {
            var E = r === "use-credentials" ? "credentials" : typeof r == "string" ? "anonymous" : "default";
            if (!d.connectResources[E].hasOwnProperty(n)) {
              d.connectResources[E][n] = M, d = y.headers;
              var F, I;
              if (I = d && 0 < d.remainingCapacity) {
                if (I = "<" + L(n) + ">; rel=preconnect", typeof r == "string") {
                  var te = Ee(
                    r,
                    "crossOrigin"
                  );
                  I += '; crossorigin="' + te + '"';
                }
                I = (F = I, 0 <= (d.remainingCapacity -= F.length + 2));
              }
              I ? (y.resets.connect[E][n] = M, d.preconnects && (d.preconnects += ", "), d.preconnects += F) : (E = [], Se(E, {
                rel: "preconnect",
                href: n,
                crossOrigin: r
              }), y.preconnects.add(E));
            }
            Wi(u);
          }
        } else i.C(n, r);
      },
      L: function(n, r, u) {
        var d = zt || null;
        if (d) {
          var y = d.resumableState, E = d.renderState;
          if (r && n) {
            switch (r) {
              case "image":
                if (u)
                  var F = u.imageSrcSet, I = u.imageSizes, te = u.fetchPriority;
                var B = F ? F + `
` + (I || "") : n;
                if (y.imageResources.hasOwnProperty(B)) return;
                y.imageResources[B] = G, y = E.headers;
                var j;
                y && 0 < y.remainingCapacity && typeof F != "string" && te === "high" && (j = R(n, r, u), 0 <= (y.remainingCapacity -= j.length + 2)) ? (E.resets.image[B] = G, y.highImagePreloads && (y.highImagePreloads += ", "), y.highImagePreloads += j) : (y = [], Se(
                  y,
                  it(
                    {
                      rel: "preload",
                      href: F ? void 0 : n,
                      as: r
                    },
                    u
                  )
                ), te === "high" ? E.highImagePreloads.add(y) : (E.bulkPreloads.add(y), E.preloads.images.set(B, y)));
                break;
              case "style":
                if (y.styleResources.hasOwnProperty(n)) return;
                F = [], Se(
                  F,
                  it({ rel: "preload", href: n, as: r }, u)
                ), y.styleResources[n] = !u || typeof u.crossOrigin != "string" && typeof u.integrity != "string" ? G : [u.crossOrigin, u.integrity], E.preloads.stylesheets.set(n, F), E.bulkPreloads.add(F);
                break;
              case "script":
                if (y.scriptResources.hasOwnProperty(n)) return;
                F = [], E.preloads.scripts.set(n, F), E.bulkPreloads.add(F), Se(
                  F,
                  it({ rel: "preload", href: n, as: r }, u)
                ), y.scriptResources[n] = !u || typeof u.crossOrigin != "string" && typeof u.integrity != "string" ? G : [u.crossOrigin, u.integrity];
                break;
              default:
                if (y.unknownResources.hasOwnProperty(r)) {
                  if (F = y.unknownResources[r], F.hasOwnProperty(n))
                    return;
                } else
                  F = {}, y.unknownResources[r] = F;
                F[n] = G, (y = E.headers) && 0 < y.remainingCapacity && r === "font" && (B = R(n, r, u), 0 <= (y.remainingCapacity -= B.length + 2)) ? (E.resets.font[n] = G, y.fontPreloads && (y.fontPreloads += ", "), y.fontPreloads += B) : (y = [], n = it(
                  { rel: "preload", href: n, as: r },
                  u
                ), Se(y, n), r) === "font" ? E.fontPreloads.add(y) : E.bulkPreloads.add(y);
            }
            Wi(d);
          }
        } else i.L(n, r, u);
      },
      m: function(n, r) {
        var u = zt || null;
        if (u) {
          var d = u.resumableState, y = u.renderState;
          if (n) {
            var E = r && typeof r.as == "string" ? r.as : "script";
            switch (E) {
              case "script":
                if (d.moduleScriptResources.hasOwnProperty(n))
                  return;
                E = [], d.moduleScriptResources[n] = !r || typeof r.crossOrigin != "string" && typeof r.integrity != "string" ? G : [r.crossOrigin, r.integrity], y.preloads.moduleScripts.set(n, E);
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
            ), y.bulkPreloads.add(E), Wi(u);
          }
        } else i.m(n, r);
      },
      X: function(n, r) {
        var u = zt || null;
        if (u) {
          var d = u.resumableState, y = u.renderState;
          if (n) {
            var E = d.scriptResources.hasOwnProperty(
              n
            ) ? d.scriptResources[n] : void 0;
            E !== M && (d.scriptResources[n] = M, r = it({ src: n, async: !0 }, r), E && (E.length === 2 && bl(r, E), n = y.preloads.scripts.get(n)) && (n.length = 0), n = [], y.scripts.add(n), Ct(n, r), Wi(u));
          }
        } else i.X(n, r);
      },
      S: function(n, r, u) {
        var d = zt || null;
        if (d) {
          var y = d.resumableState, E = d.renderState;
          if (n) {
            r = r || "default";
            var F = E.styles.get(r), I = y.styleResources.hasOwnProperty(n) ? y.styleResources[n] : void 0;
            I !== M && (y.styleResources[n] = M, F || (F = {
              precedence: Me(r),
              rules: [],
              hrefs: [],
              sheets: /* @__PURE__ */ new Map()
            }, E.styles.set(r, F)), r = {
              state: p,
              props: it(
                {
                  rel: "stylesheet",
                  href: n,
                  "data-precedence": r
                },
                u
              )
            }, I && (I.length === 2 && bl(r.props, I), (E = E.preloads.stylesheets.get(n)) && 0 < E.length ? E.length = 0 : r.state = C), F.sheets.set(n, r), Wi(d));
          }
        } else i.S(n, r, u);
      },
      M: function(n, r) {
        var u = zt || null;
        if (u) {
          var d = u.resumableState, y = u.renderState;
          if (n) {
            var E = d.moduleScriptResources.hasOwnProperty(n) ? d.moduleScriptResources[n] : void 0;
            E !== M && (d.moduleScriptResources[n] = M, r = it(
              { src: n, type: "module", async: !0 },
              r
            ), E && (E.length === 2 && bl(r, E), n = y.preloads.moduleScripts.get(n)) && (n.length = 0), n = [], y.scripts.add(n), Ct(n, r), Wi(u));
          }
        } else i.M(n, r);
      }
    };
    var o = 0, f = 1, g = 2, w = 4, m = 8, P = 32, V = 64, M = null, G = [];
    Object.freeze(G);
    var re = null, $ = "<\/script>", ve = /(<\/|<)(s)(cript)/gi, De = {}, on = 0, Ze = 1, He = 2, je = 3, Xe = 4, at = 5, cn = 6, pn = 7, _n = 8, en = 9, vt = /* @__PURE__ */ new Map(), Sn = ' style="', Rr = ":", In = ";", En = " ", Pn = '="', qe = '"', An = '=""', qt = Me(
      "javascript:throw new Error('React form unexpectedly submitted.')"
    ), sn = ">", pa = "/>", Zi = !1, Cr = !1, Pl = !1, Al = !1, Fl = !1, Ei = !1, Vi = !1, Qt = !1, Ja = !1, Ka = !1, xc = !1, eu = `addEventListener("submit",function(a){if(!a.defaultPrevented){var c=a.target,d=a.submitter,e=c.action,b=d;if(d){var f=d.getAttribute("formAction");null!=f&&(e=f,b=null)}"javascript:throw new Error('React form unexpectedly submitted.')"===e&&(a.preventDefault(),b?(a=document.createElement("input"),a.name=b.name,a.value=b.value,b.parentNode.insertBefore(a,b),b=new FormData(c),a.parentNode.removeChild(a)):b=new FormData(c),a=c.ownerDocument||c,(a.$$reactFormReplay=a.$$reactFormReplay||[]).push(c,d,b))}});`, Do = /(<\/|<)(s)(tyle)/gi, wa = `
`, mr = /^[a-zA-Z][a-zA-Z:_\.\-\d]*$/, Ec = /* @__PURE__ */ new Map(), kr = /* @__PURE__ */ new Map(), Rl = "requestAnimationFrame(function(){$RT=performance.now()});", Qi = '<template id="', Rc = '"></template>', Ji = "<!--$-->", nu = '<!--$?--><template id="', Lt = '"></template>', Cc = "<!--$!-->", Ta = "<!--/$-->", Lo = "<template", ja = '"', Ot = ' data-dgst="', Cl = ' data-msg="', un = ' data-stck="', Ki = ' data-cstck="', No = "></template>", xa = '<div hidden id="', bt = '">', Zr = "</div>", Ea = '<svg aria-hidden="true" style="display:none" id="', qa = '">', Ol = "</svg>", dr = '<math aria-hidden="true" style="display:none" id="', zo = '">', Sr = "</math>", Nu = '<table hidden id="', $a = '">', mc = "</table>", tu = '<table hidden><tbody id="', ru = '">', Ri = "</tbody></table>", eo = '<table hidden><tr id="', no = '">', Pr = "</tr></table>", kc = '<table hidden><colgroup id="', Sc = '">', zu = "</colgroup></table>", Hu = '$RS=function(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};$RS("', lu = '$RS("', Bu = '","', Uu = '")<\/script>', Nt = `$RB=[];$RV=function(a){$RT=performance.now();for(var b=0;b<a.length;b+=2){var c=a[b],e=a[b+1];null!==e.parentNode&&e.parentNode.removeChild(e);var f=c.parentNode;if(f){var g=c.previousSibling,h=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d||"/&"===d)if(0===h)break;else h--;else"$"!==d&&"$?"!==d&&"$~"!==d&&"$!"!==d&&"&"!==d||h++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;e.firstChild;)f.insertBefore(e.firstChild,c);g.data="$";g._reactRetry&&requestAnimationFrame(g._reactRetry)}}a.length=0};
$RC=function(a,b){if(b=document.getElementById(b))(a=document.getElementById(a))?(a.previousSibling.data="$~",$RB.push(a,b),2===$RB.length&&("number"!==typeof $RT?requestAnimationFrame($RV.bind(null,$RB)):(a=performance.now(),setTimeout($RV.bind(null,$RB),2300>a&&2E3<a?2300-a:$RT+300-a)))):b.parentNode.removeChild(b)};`, iu = '$RC("', Pc = `$RM=new Map;$RR=function(n,w,p){function u(q){this._p=null;q()}for(var r=new Map,t=document,h,b,e=t.querySelectorAll("link[data-precedence],style[data-precedence]"),v=[],k=0;b=e[k++];)"not all"===b.getAttribute("media")?v.push(b):("LINK"===b.tagName&&$RM.set(b.getAttribute("href"),b),r.set(b.dataset.precedence,h=b));e=0;b=[];var l,a;for(k=!0;;){if(k){var f=p[e++];if(!f){k=!1;e=0;continue}var c=!1,m=0;var d=f[m++];if(a=$RM.get(d)){var g=a._p;c=!0}else{a=t.createElement("link");a.href=d;a.rel=
"stylesheet";for(a.dataset.precedence=l=f[m++];g=f[m++];)a.setAttribute(g,f[m++]);g=a._p=new Promise(function(q,x){a.onload=u.bind(a,q);a.onerror=u.bind(a,x)});$RM.set(d,a)}d=a.getAttribute("media");!g||d&&!matchMedia(d).matches||b.push(g);if(c)continue}else{a=v[e++];if(!a)break;l=a.getAttribute("data-precedence");a.removeAttribute("media")}c=r.get(l)||h;c===h&&(h=a);r.set(l,a);c?c.parentNode.insertBefore(a,c.nextSibling):(c=t.head,c.insertBefore(a,c.firstChild))}if(p=document.getElementById(n))p.previousSibling.data=
"$~";Promise.all(b).then($RC.bind(null,n,w),$RX.bind(null,n,"CSS failed to load"))};$RR("`, Ac = '$RR("', au = '","', Wu = '",', ou = '"', cu = ")<\/script>", Ra = '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};', _l = '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};;$RX("', cs = '$RX("', to = '"', Fc = ",", ri = ")<\/script>", Ho = /[<\u2028\u2029]/g, Ca = /[&><\u2028\u2029]/g, Oc = ' media="not all" data-precedence="', ma = '" data-href="', us = '">', ss = "</style>", li = !1, Bo = !0, ml = [], ka = ' data-precedence="', ro = '" data-href="', Ml = " ", Yu = '">', fs = "</style>", Uo = ' id="', l = "[", a = ",[", s = ",", v = "]", p = 0, C = 1, k = 2, z = 3, O = /[<>\r\n]/g, H = /["';,\r\n]/g, Z = "", K = Function.prototype.bind, xe = /* @__PURE__ */ Symbol.for("react.client.reference"), we = {};
    Object.freeze(we);
    var bn = {}, Ve = null, yn = {}, yt = {}, $n = /* @__PURE__ */ new Set(), gr = /* @__PURE__ */ new Set(), ll = /* @__PURE__ */ new Set(), Il = /* @__PURE__ */ new Set(), Qe = /* @__PURE__ */ new Set(), Ar = /* @__PURE__ */ new Set(), _t = /* @__PURE__ */ new Set(), Vr = /* @__PURE__ */ new Set(), ji = /* @__PURE__ */ new Set(), pt = {
      enqueueSetState: function(n, r, u) {
        var d = n._reactInternals;
        d.queue === null ? yl(n, "setState") : (d.queue.push(r), u != null && lc(u));
      },
      enqueueReplaceState: function(n, r, u) {
        n = n._reactInternals, n.replace = !0, n.queue = [r], u != null && lc(u);
      },
      enqueueForceUpdate: function(n, r) {
        n._reactInternals.queue === null ? yl(n, "forceUpdate") : r != null && lc(r);
      }
    }, lo = { id: 1, overflow: "" }, Dl = Math.clz32 ? Math.clz32 : es, Fr = Math.log, ii = Math.LN2, Or = Error(
      "Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`."
    ), io = null, Wo = typeof Object.is == "function" ? Object.is : oc, Qr = null, Yo = null, _r = null, ao = null, Gu = null, ot = null, Go = !1, ai = !1, uu = 0, oo = 0, su = -1, fu = 0, Xo = null, Sa = null, hu = 0, Ci = !1, co, uo = {
      readContext: Na,
      use: function(n) {
        if (n !== null && typeof n == "object") {
          if (typeof n.then == "function")
            return pl(n);
          if (n.$$typeof === wl)
            return Na(n);
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
        Qr = di(), ot = mn();
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
        n = n.id, n = (n & ~(1 << 32 - Dl(n) - 1)).toString(32) + r;
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
        return za;
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
    }, kl = 0, Pa, qi, du, gu, vu, so, gs;
    ts.__reactDisabledLog = !0;
    var Xu, Zo, vs = !1, bu = new (typeof WeakMap == "function" ? WeakMap : Map)(), ms = {
      react_stack_bottom_frame: function(n, r, u) {
        return n(r, u);
      }
    }, Zu = ms.react_stack_bottom_frame.bind(ms), ks = {
      react_stack_bottom_frame: function(n) {
        return n.render();
      }
    }, yu = ks.react_stack_bottom_frame.bind(ks), Vo = {
      react_stack_bottom_frame: function(n) {
        var r = n._init;
        return r(n._payload);
      }
    }, Ms = Vo.react_stack_bottom_frame.bind(Vo), Is = 0;
    if (typeof performance == "object" && typeof performance.now == "function")
      var mi = performance, bs = function() {
        return mi.now();
      };
    else {
      var Ds = Date;
      bs = function() {
        return Ds.now();
      };
    }
    var ar = 4, $i = 0, Mr = 1, Aa = 2, Nl = 3, Dn = 4, il = 5, ea = 14, zt = null, _c = {}, pu = {}, ys = {}, Qo = {}, fo = !1, Mc = !1, oi = !1, ho = 0, Ic = !1;
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
var Vf;
function uh() {
  return Vf || (Vf = 1, process.env.NODE_ENV !== "production" && (function() {
    function fe(e, t, c, h) {
      return "" + t + (c === "s" ? "\\73 " : "\\53 ") + h;
    }
    function ce(e, t, c, h) {
      return "" + t + (c === "s" ? "\\u0073" : "\\u0053") + h;
    }
    function W(e) {
      return e === null || typeof e != "object" ? null : (e = Du && e[Du] || e["@@iterator"], typeof e == "function" ? e : null);
    }
    function ke(e) {
      return e = Object.prototype.toString.call(e), e.slice(8, e.length - 1);
    }
    function nn(e) {
      var t = JSON.stringify(e);
      return '"' + e + '"' === t ? e : t;
    }
    function ye(e) {
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
          case ba:
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
      var h = -1, b = 0;
      if (xi(e))
        if (fr.has(e)) {
          var x = fr.get(e);
          c = "<" + Oe(x) + ">";
          for (var S = 0; S < e.length; S++) {
            var _ = e[S];
            _ = typeof _ == "string" ? _ : typeof _ == "object" && _ !== null ? "{" + Tn(_) + "}" : "{" + ye(_) + "}", "" + S === t ? (h = c.length, b = _.length, c += _) : c = 15 > _.length && 40 > c.length + _.length ? c + _ : c + "{...}";
          }
          c += "</" + Oe(x) + ">";
        } else {
          for (c = "[", x = 0; x < e.length; x++)
            0 < x && (c += ", "), S = e[x], S = typeof S == "object" && S !== null ? Tn(S) : ye(S), "" + x === t ? (h = c.length, b = S.length, c += S) : c = 10 > S.length && 40 > c.length + S.length ? c + S : c + "...";
          c += "]";
        }
      else if (e.$$typeof === jc)
        c = "<" + Oe(e.type) + "/>";
      else {
        if (e.$$typeof === Gi) return "client";
        if (Tc.has(e)) {
          for (c = Tc.get(e), c = "<" + (Oe(c) || "..."), x = Object.keys(e), S = 0; S < x.length; S++) {
            c += " ", _ = x[S], c += nn(_) + "=";
            var J = e[_], N = _ === t && typeof J == "object" && J !== null ? Tn(J) : ye(J);
            typeof J != "string" && (N = "{" + N + "}"), _ === t ? (h = c.length, b = N.length, c += N) : c = 10 > N.length && 40 > c.length + N.length ? c + N : c + "...";
          }
          c += ">";
        } else {
          for (c = "{", x = Object.keys(e), S = 0; S < x.length; S++)
            0 < S && (c += ", "), _ = x[S], c += nn(_) + ": ", J = e[_], J = typeof J == "object" && J !== null ? Tn(J) : ye(J), _ === t ? (h = c.length, b = J.length, c += J) : c = 10 > J.length && 40 > c.length + J.length ? c + J : c + "...";
          c += "}";
        }
      }
      return t === void 0 ? c : -1 < h && 0 < b ? (e = " ".repeat(h) + "^".repeat(b), `
  ` + c + `
  ` + e) : `
  ` + c;
    }
    function Re(e, t) {
      var c = e.length & 3, h = e.length - c, b = t;
      for (t = 0; t < h; ) {
        var x = e.charCodeAt(t) & 255 | (e.charCodeAt(++t) & 255) << 8 | (e.charCodeAt(++t) & 255) << 16 | (e.charCodeAt(++t) & 255) << 24;
        ++t, x = 3432918353 * (x & 65535) + ((3432918353 * (x >>> 16) & 65535) << 16) & 4294967295, x = x << 15 | x >>> 17, x = 461845907 * (x & 65535) + ((461845907 * (x >>> 16) & 65535) << 16) & 4294967295, b ^= x, b = b << 13 | b >>> 19, b = 5 * (b & 65535) + ((5 * (b >>> 16) & 65535) << 16) & 4294967295, b = (b & 65535) + 27492 + (((b >>> 16) + 58964 & 65535) << 16);
      }
      switch (x = 0, c) {
        case 3:
          x ^= (e.charCodeAt(t + 2) & 255) << 16;
        case 2:
          x ^= (e.charCodeAt(t + 1) & 255) << 8;
        case 1:
          x ^= e.charCodeAt(t) & 255, x = 3432918353 * (x & 65535) + ((3432918353 * (x >>> 16) & 65535) << 16) & 4294967295, x = x << 15 | x >>> 17, b ^= 461845907 * (x & 65535) + ((461845907 * (x >>> 16) & 65535) << 16) & 4294967295;
      }
      return b ^= e.length, b ^= b >>> 16, b = 2246822507 * (b & 65535) + ((2246822507 * (b >>> 16) & 65535) << 16) & 4294967295, b ^= b >>> 13, b = 3266489909 * (b & 65535) + ((3266489909 * (b >>> 16) & 65535) << 16) & 4294967295, (b ^ b >>> 16) >>> 0;
    }
    function ie(e) {
      Za.push(e), as.port2.postMessage(null);
    }
    function Be(e) {
      setTimeout(function() {
        throw e;
      });
    }
    function A(e, t) {
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
    function D(e, t) {
      return A(e, t), !0;
    }
    function Ae(e) {
      hr && 0 < ir && (e.enqueue(
        new Uint8Array(hr.buffer, 0, ir)
      ), hr = null, ir = 0);
    }
    function ee(e) {
      return ya.encode(e);
    }
    function X(e) {
      return e = ya.encode(e), 2048 < e.byteLength && console.error(
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
        return Br(e), !1;
      } catch {
        return !0;
      }
    }
    function Br(e) {
      return "" + e;
    }
    function Jn(e, t) {
      if (Gl(e))
        return console.error(
          "The provided `%s` attribute is an unsupported type %s. This value must be coerced to a string before using it here.",
          t,
          Yt(e)
        ), Br(e);
    }
    function Me(e, t) {
      if (Gl(e))
        return console.error(
          "The provided `%s` CSS property is an unsupported type %s. This value must be coerced to a string before using it here.",
          t,
          Yt(e)
        ), Br(e);
    }
    function Je(e) {
      if (Gl(e))
        return console.error(
          "The provided HTML markup uses a value of unsupported type %s. This value must be coerced to a string before using it here.",
          Yt(e)
        ), Br(e);
    }
    function Et(e) {
      return Hn.call($c, e) ? !0 : Hn.call(Mo, e) ? !1 : Qa.test(e) ? $c[e] = !0 : (Mo[e] = !0, console.error("Invalid attribute name: `%s`", e), !1);
    }
    function rn(e, t) {
      Cs[t.type] || t.onChange || t.onInput || t.readOnly || t.disabled || t.value == null || console.error(
        e === "select" ? "You provided a `value` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultValue`. Otherwise, set `onChange`." : "You provided a `value` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultValue`. Otherwise, set either `onChange` or `readOnly`."
      ), t.onChange || t.readOnly || t.disabled || t.checked == null || console.error(
        "You provided a `checked` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultChecked`. Otherwise, set either `onChange` or `readOnly`."
      );
    }
    function Kn(e, t) {
      if (Hn.call(Xi, t) && Xi[t])
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
      t = c.map(function(b) {
        return "`" + b + "`";
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
      if (Hn.call(g, t) && g[t])
        return !0;
      var b = t.toLowerCase();
      if (b === "onfocusin" || b === "onfocusout")
        return console.error(
          "React uses onFocus and onBlur instead of onFocusIn and onFocusOut. All React events are normalized to bubble, so onFocusIn and onFocusOut are not needed/supported by React."
        ), g[t] = !0;
      if (typeof c == "function" && (e === "form" && t === "action" || e === "input" && t === "formAction" || e === "button" && t === "formAction"))
        return !0;
      if (w.test(t))
        return m.test(t) && console.error(
          "Invalid event handler property `%s`. React events use the camelCase naming convention, for example `onClick`.",
          t
        ), g[t] = !0;
      if (P.test(t) || V.test(t)) return !0;
      if (b === "innerhtml")
        return console.error(
          "Directly setting property `innerHTML` is not permitted. For more information, lookup documentation on `dangerouslySetInnerHTML`."
        ), g[t] = !0;
      if (b === "aria")
        return console.error(
          "The `aria` attribute is reserved for future use in React. Pass individual `aria-` attributes instead."
        ), g[t] = !0;
      if (b === "is" && c !== null && c !== void 0 && typeof c != "string")
        return console.error(
          "Received a `%s` for a string attribute `is`. If this is expected, cast the value to a string.",
          typeof c
        ), g[t] = !0;
      if (typeof c == "number" && isNaN(c))
        return console.error(
          "Received NaN for the `%s` attribute. If this is expected, cast the value to a string.",
          t
        ), g[t] = !0;
      if (f.hasOwnProperty(b)) {
        if (b = f[b], b !== t)
          return console.error(
            "Invalid DOM property `%s`. Did you mean `%s`?",
            t,
            b
          ), g[t] = !0;
      } else if (t !== b)
        return console.error(
          "React does not recognize the `%s` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `%s` instead. If you accidentally passed it from a parent component, remove it from the DOM element.",
          t,
          b
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
              return b = t.toLowerCase().slice(0, 5), b === "data-" || b === "aria-" ? !0 : (c ? console.error(
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
      var h = [], b;
      for (b in t)
        Ln(e, b, t[b]) || h.push(b);
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
    function Pe(e) {
      if (typeof e == "boolean" || typeof e == "number" || typeof e == "bigint")
        return "" + e;
      Je(e), e = "" + e;
      var t = He.exec(e);
      if (t) {
        var c = "", h, b = 0;
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
          b !== h && (c += e.slice(b, h)), b = h + 1, c += t;
        }
        e = b !== h ? c + e.slice(b, h) : c;
      }
      return e;
    }
    function Q(e) {
      return at.test("" + e) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : e;
    }
    function de(e) {
      return Je(e), ("" + e).replace(Ja, ce);
    }
    function Tr(e, t, c, h, b, x) {
      c = typeof t == "string" ? t : t && t.script;
      var S = c === void 0 ? pa : X(
        '<script nonce="' + Pe(c) + '"'
      ), _ = typeof t == "string" ? void 0 : t && t.style, J = _ === void 0 ? Qt : X(
        '<style nonce="' + Pe(_) + '"'
      ), N = e.idPrefix, U = [], oe = e.bootstrapScriptContent, se = e.bootstrapScripts, ue = e.bootstrapModules;
      if (oe !== void 0 && (U.push(S), an(U, e), U.push(
        bt,
        ee(
          de(oe)
        ),
        Zi
      )), oe = [], h !== void 0 && (oe.push(Ka), oe.push(
        ee(
          de(JSON.stringify(h))
        )
      ), oe.push(xc)), b && typeof x == "number" && 0 >= x && console.error(
        "React expected a positive non-zero `maxHeadersLength` option but found %s instead. When using the `onHeaders` option you may supply an optional `maxHeadersLength` option as well however, when setting this value to zero or less no headers will be captured.",
        x === 0 ? "zero" : x
      ), h = b ? {
        preconnects: "",
        fontPreloads: "",
        highImagePreloads: "",
        remainingCapacity: 2 + (typeof x == "number" ? x : 2e3)
      } : null, b = {
        placeholderPrefix: X(N + "P:"),
        segmentPrefix: X(N + "S:"),
        boundaryPrefix: X(N + "B:"),
        startInlineScript: S,
        startInlineStyle: J,
        preamble: he(),
        externalRuntimeScript: null,
        bootstrapChunks: U,
        importMapChunks: oe,
        onHeaders: b,
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
        nonce: { script: c, style: _ },
        hoistableState: null,
        stylesToHoist: !1
      }, se !== void 0)
        for (h = 0; h < se.length; h++)
          x = se[h], J = _ = void 0, N = {
            rel: "preload",
            as: "script",
            fetchPriority: "low",
            nonce: t
          }, typeof x == "string" ? N.href = S = x : (N.href = S = x.src, N.integrity = J = typeof x.integrity == "string" ? x.integrity : void 0, N.crossOrigin = _ = typeof x == "string" || x.crossOrigin == null ? void 0 : x.crossOrigin === "use-credentials" ? "use-credentials" : ""), dt(
            e,
            b,
            S,
            N
          ), U.push(
            Cr,
            ee(Pe(S)),
            un
          ), c && U.push(
            Al,
            ee(Pe(c)),
            un
          ), typeof J == "string" && U.push(
            Fl,
            ee(Pe(J)),
            un
          ), typeof _ == "string" && U.push(
            Ei,
            ee(Pe(_)),
            un
          ), an(U, e), U.push(Vi);
      if (ue !== void 0)
        for (t = 0; t < ue.length; t++)
          se = ue[t], S = x = void 0, _ = {
            rel: "modulepreload",
            fetchPriority: "low",
            nonce: c
          }, typeof se == "string" ? _.href = h = se : (_.href = h = se.src, _.integrity = S = typeof se.integrity == "string" ? se.integrity : void 0, _.crossOrigin = x = typeof se == "string" || se.crossOrigin == null ? void 0 : se.crossOrigin === "use-credentials" ? "use-credentials" : ""), dt(
            e,
            b,
            h,
            _
          ), U.push(
            Pl,
            ee(Pe(h)),
            un
          ), c && U.push(
            Al,
            ee(Pe(c)),
            un
          ), typeof S == "string" && U.push(
            Fl,
            ee(Pe(S)),
            un
          ), typeof x == "string" && U.push(
            Ei,
            ee(Pe(x)),
            un
          ), an(U, e), U.push(Vi);
      return b;
    }
    function vl(e, t, c, h, b) {
      return {
        idPrefix: e === void 0 ? "" : e,
        nextFormID: 0,
        streamingFormat: 0,
        bootstrapScriptContent: c,
        bootstrapScripts: h,
        bootstrapModules: b,
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
    function he() {
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
        e === "http://www.w3.org/2000/svg" ? kr : e === "http://www.w3.org/1998/Math/MathML" ? Rl : Do,
        null,
        0,
        null
      );
    }
    function pe(e, t, c) {
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
          return T(Qi, null, h, null);
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
            Ji,
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
          if (e.insertionMode === Do)
            return T(
              wa,
              null,
              h,
              null
            );
      }
      return e.insertionMode >= Qi || e.insertionMode < mr ? T(mr, null, h, null) : e.tagScope !== h ? T(
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
    function Ne(e, t) {
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
      return t === "" ? h : (h && e.push(Lt), e.push(ee(Pe(t))), !0);
    }
    function Rt(e, t) {
      if (typeof t != "object")
        throw Error(
          "The `style` prop expects a mapping from style properties to values, not a string. For example, style={{marginRight: spacing + 'em'}} when using JSX."
        );
      var c = !0, h;
      for (h in t)
        if (Hn.call(t, h)) {
          var b = t[h];
          if (b != null && typeof b != "boolean" && b !== "") {
            if (h.indexOf("--") === 0) {
              var x = ee(Pe(h));
              Me(b, h), b = ee(
                Pe(("" + b).trim())
              );
            } else {
              x = h;
              var S = b;
              if (-1 < x.indexOf("-")) {
                var _ = x;
                ve.hasOwnProperty(_) && ve[_] || (ve[_] = !0, console.error(
                  "Unsupported style property %s. Did you mean %s?",
                  _,
                  nt(_.replace(G, "ms-"))
                ));
              } else if (M.test(x))
                _ = x, ve.hasOwnProperty(_) && ve[_] || (ve[_] = !0, console.error(
                  "Unsupported vendor-prefixed style property %s. Did you mean %s?",
                  _,
                  _.charAt(0).toUpperCase() + _.slice(1)
                ));
              else if ($.test(S)) {
                _ = x;
                var J = S;
                De.hasOwnProperty(J) && De[J] || (De[J] = !0, console.error(
                  `Style property values shouldn't contain a semicolon. Try "%s: %s" instead.`,
                  _,
                  J.replace(
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
                Pe(
                  x.replace(je, "-$1").toLowerCase().replace(Xe, "-ms-")
                )
              ), Cc.set(x, S)), x = S, typeof b == "number" ? b = b === 0 || Io.has(h) ? ee("" + b) : ee(b + "px") : (Me(b, h), b = ee(
                Pe(("" + b).trim())
              ));
            }
            c ? (c = !1, e.push(
              Ta,
              x,
              Lo,
              b
            )) : e.push(ja, x, Lo, b);
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
        ee(Pe(c)),
        un
      );
    }
    function Ct(e, t) {
      this.push(xa), Ia(e), tt(this, "name", t), tt(this, "value", e), this.push(Zr);
    }
    function Ia(e) {
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
            var b = h.data;
            b?.forEach(Ia);
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
    function mt(e, t, c, h, b, x, S, _) {
      var J = null;
      if (typeof h == "function") {
        _ === null || mc || (mc = !0, console.error(
          'Cannot specify a "name" prop for a button that specifies a function as a formAction. React needs it to encode which action should be invoked. It will get overridden.'
        )), b === null && x === null || ru || (ru = !0, console.error(
          "Cannot specify a formEncType or formMethod for a button that specifies a function as a formAction. React provides those automatically. They will get overridden."
        )), S === null || tu || (tu = !0, console.error(
          "Cannot specify a formTarget for a button that specifies a function as a formAction. The function will always be executed in the same window."
        ));
        var N = Ge(t, h);
        N !== null ? (_ = N.name, h = N.action || "", b = N.encType, x = N.method, S = N.target, J = N.data) : (e.push(
          Ot,
          ee("formAction"),
          Cl,
          No,
          un
        ), S = x = b = h = _ = null, Xt(t, c));
      }
      return _ != null && xn(e, "name", _), h != null && xn(e, "formAction", h), b != null && xn(e, "formEncType", b), x != null && xn(e, "formMethod", x), S != null && xn(e, "formTarget", S), J;
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
          Jn(c, t), c = Q("" + c), e.push(
            Ot,
            ee(t),
            Cl,
            ee(Pe(c)),
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
          Jn(c, t), c = Q("" + c), e.push(
            Ot,
            ee("xlink:href"),
            Cl,
            ee(Pe(c)),
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
            ee(Pe(c)),
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
            ee(Pe(c)),
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
            ee(Pe(c)),
            un
          );
          break;
        case "rowSpan":
        case "start":
          typeof c == "function" || typeof c == "symbol" || isNaN(c) || e.push(
            Ot,
            ee(t),
            Cl,
            ee(Pe(c)),
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
              ee(Pe(c)),
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
        t = t.__html, t != null && (Je(t), e.push(ee("" + t)));
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
      return Jc.Children.forEach(e, function(c) {
        c != null && (t += c, zo || typeof c == "string" || typeof c == "number" || typeof c == "bigint" || (zo = !0, console.error(
          "Cannot infer the option value of complex children. Pass a `value` prop or use a plain string as children to <option>."
        )));
      }), t;
    }
    function Xt(e, t) {
      if ((e.instructions & 16) === vt) {
        e.instructions |= 16;
        var c = t.preamble, h = t.bootstrapChunks;
        (c.htmlChunks || c.headChunks) && h.length === 0 ? (h.push(t.startInlineScript), an(h, e), h.push(
          bt,
          eo,
          Zi
        )) : h.unshift(
          t.startInlineScript,
          bt,
          eo,
          Zi
        );
      }
    }
    function Ie(e, t) {
      e.push(Nn("link"));
      for (var c in t)
        if (Hn.call(t, c)) {
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
      return Je(e), ("" + e).replace(kc, fe);
    }
    function Pt(e, t, c) {
      e.push(Nn(c));
      for (var h in t)
        if (Hn.call(t, h)) {
          var b = t[h];
          if (b != null)
            switch (h) {
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(
                  c + " is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
                );
              default:
                xn(e, h, b);
            }
        }
      return e.push(Zr), null;
    }
    function $r(e, t) {
      e.push(Nn("title"));
      var c = null, h = null, b;
      for (b in t)
        if (Hn.call(t, b)) {
          var x = t[b];
          if (x != null)
            switch (b) {
              case "children":
                c = x;
                break;
              case "dangerouslySetInnerHTML":
                h = x;
                break;
              default:
                xn(e, b, x);
            }
        }
      return e.push(bt), t = Array.isArray(c) ? 2 > c.length ? c[0] : null : c, typeof t != "function" && typeof t != "symbol" && t !== null && t !== void 0 && e.push(ee(Pe("" + t))), St(e, h, c), e.push(ht("title")), null;
    }
    function Da(e, t) {
      e.push(Nn("script"));
      var c = null, h = null, b;
      for (b in t)
        if (Hn.call(t, b)) {
          var x = t[b];
          if (x != null)
            switch (b) {
              case "children":
                c = x;
                break;
              case "dangerouslySetInnerHTML":
                h = x;
                break;
              default:
                xn(e, b, x);
            }
        }
      return e.push(bt), c != null && typeof c != "string" && (t = typeof c == "number" ? "a number for children" : Array.isArray(c) ? "an array for children" : "something unexpected for children", console.error(
        "A script element was rendered with %s. If script element has children it must be a single string. Consider using dangerouslySetInnerHTML or passing a plain string as children.",
        t
      )), St(e, h, c), typeof c == "string" && e.push(ee(de(c))), e.push(ht("script")), null;
    }
    function vn(e, t, c) {
      e.push(Nn(c));
      var h = c = null, b;
      for (b in t)
        if (Hn.call(t, b)) {
          var x = t[b];
          if (x != null)
            switch (b) {
              case "children":
                c = x;
                break;
              case "dangerouslySetInnerHTML":
                h = x;
                break;
              default:
                xn(e, b, x);
            }
        }
      return e.push(bt), St(e, h, c), c;
    }
    function rr(e, t, c) {
      e.push(Nn(c));
      var h = c = null, b;
      for (b in t)
        if (Hn.call(t, b)) {
          var x = t[b];
          if (x != null)
            switch (b) {
              case "children":
                c = x;
                break;
              case "dangerouslySetInnerHTML":
                h = x;
                break;
              default:
                xn(e, b, x);
            }
        }
      return e.push(bt), St(e, h, c), typeof c == "string" ? (e.push(ee(Pe(c))), null) : c;
    }
    function Nn(e) {
      var t = Uu.get(e);
      if (t === void 0) {
        if (!Bu.test(e)) throw Error("Invalid tag: " + e);
        t = X("<" + e), Uu.set(e, t);
      }
      return t;
    }
    function rc(e, t, c, h, b, x, S, _, J) {
      si(t, c), t !== "input" && t !== "textarea" && t !== "select" || c == null || c.value !== null || o || (o = !0, t === "select" && c.multiple ? console.error(
        "`value` prop on `%s` should not be null. Consider using an empty array when `multiple` is set to `true` to clear the component or `undefined` for uncontrolled components.",
        t
      ) : console.error(
        "`value` prop on `%s` should not be null. Consider using an empty string to clear the component or `undefined` for uncontrolled components.",
        t
      ));
      e: if (t.indexOf("-") === -1) var N = !1;
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
            N = !1;
            break e;
          default:
            N = !0;
        }
      switch (N || typeof c.is == "string" || qr(t, c), !c.suppressContentEditableWarning && c.contentEditable && c.children != null && console.error(
        "A component is `contentEditable` and contains `children` managed by React. It is now your responsibility to guarantee that none of those nodes are unexpectedly modified or duplicated. This is probably not intentional."
      ), _.insertionMode !== kr && _.insertionMode !== Rl && t.indexOf("-") === -1 && t.toLowerCase() !== t && console.error(
        "<%s /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.",
        t
      ), t) {
        case "div":
        case "span":
        case "svg":
        case "path":
          break;
        case "a":
          e.push(Nn("a"));
          var U = null, oe = null, se;
          for (se in c)
            if (Hn.call(c, se)) {
              var ue = c[se];
              if (ue != null)
                switch (se) {
                  case "children":
                    U = ue;
                    break;
                  case "dangerouslySetInnerHTML":
                    oe = ue;
                    break;
                  case "href":
                    ue === "" ? tt(e, "href", "") : xn(e, se, ue);
                    break;
                  default:
                    xn(e, se, ue);
                }
            }
          if (e.push(bt), St(e, oe, U), typeof U == "string") {
            e.push(ee(Pe(U)));
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
          ), Ol = !0), e.push(Nn("select"));
          var Ue = null, Zn = null, ze;
          for (ze in c)
            if (Hn.call(c, ze)) {
              var hn = c[ze];
              if (hn != null)
                switch (ze) {
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
                      ze,
                      hn
                    );
                }
            }
          return e.push(bt), St(e, Zn, Ue), Ue;
        case "option":
          var At = _.selectedValue;
          e.push(Nn("option"));
          var Ht = null, On = null, Le = null, Bt = null, Dr;
          for (Dr in c)
            if (Hn.call(c, Dr)) {
              var Vn = c[Dr];
              if (Vn != null)
                switch (Dr) {
                  case "children":
                    Ht = Vn;
                    break;
                  case "selected":
                    Le = Vn, Nu || (console.error(
                      "Use the `defaultValue` or `value` props on <select> instead of setting `selected` on <option>."
                    ), Nu = !0);
                    break;
                  case "dangerouslySetInnerHTML":
                    Bt = Vn;
                    break;
                  case "value":
                    On = Vn;
                  default:
                    xn(
                      e,
                      Dr,
                      Vn
                    );
                }
            }
          if (At != null) {
            if (On !== null) {
              Jn(On, "value");
              var ut = "" + On;
            } else
              Bt === null || Sr || (Sr = !0, console.error(
                "Pass a `value` prop if you set dangerouslyInnerHTML so React knows which value should be selected."
              )), ut = Xl(Ht);
            if (xi(At)) {
              for (var cl = 0; cl < At.length; cl++)
                if (Jn(At[cl], "value"), "" + At[cl] === ut) {
                  e.push(Ri);
                  break;
                }
            } else
              Jn(At, "select.value"), "" + At === ut && e.push(Ri);
          } else Le && e.push(Ri);
          return e.push(bt), St(e, Bt, Ht), Ht;
        case "textarea":
          rn("textarea", c), c.value === void 0 || c.defaultValue === void 0 || dr || (console.error(
            "Textarea elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled textarea and remove one of these props. More info: https://react.dev/link/controlled-components"
          ), dr = !0), e.push(Nn("textarea"));
          var pr = null, er = null, st = null, Jt;
          for (Jt in c)
            if (Hn.call(c, Jt)) {
              var ul = c[Jt];
              if (ul != null)
                switch (Jt) {
                  case "children":
                    st = ul;
                    break;
                  case "value":
                    pr = ul;
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
                      Jt,
                      ul
                    );
                }
            }
          if (pr === null && er !== null && (pr = er), e.push(bt), st != null) {
            if (console.error(
              "Use the `defaultValue` or `value` props instead of setting children on <textarea>."
            ), pr != null)
              throw Error(
                "If you supply `defaultValue` on a <textarea>, do not pass children."
              );
            if (xi(st)) {
              if (1 < st.length)
                throw Error("<textarea> can only have at most one child.");
              Je(st[0]), pr = "" + st[0];
            }
            Je(st), pr = "" + st;
          }
          return typeof pr == "string" && pr[0] === `
` && e.push(lu), pr !== null && (Jn(pr, "value"), e.push(
            ee(Pe("" + pr))
          )), null;
        case "input":
          rn("input", c), e.push(Nn("input"));
          var Sl = null, nr = null, Tt = null, Lr = null, sl = null, Nr = null, na = null, fl = null, Ut = null, zl;
          for (zl in c)
            if (Hn.call(c, zl)) {
              var cr = c[zl];
              if (cr != null)
                switch (zl) {
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
                    Nr = cr;
                    break;
                  default:
                    xn(
                      e,
                      zl,
                      cr
                    );
                }
            }
          nr === null || c.type === "image" || c.type === "submit" || $a || ($a = !0, console.error(
            'An input can only specify a formAction along with type="submit" or type="image".'
          ));
          var Vu = mt(
            e,
            h,
            b,
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
          ), qa = !0), Nr === null || na === null || Ea || (console.error(
            "%s contains an input of type %s with both value and defaultValue props. Input elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://react.dev/link/controlled-components",
            "A component",
            c.type
          ), Ea = !0), fl !== null ? Rn(e, "checked", fl) : Ut !== null && Rn(e, "checked", Ut), Nr !== null ? xn(e, "value", Nr) : na !== null && xn(e, "value", na), e.push(Zr), Vu?.forEach(Ct, e), null;
        case "button":
          e.push(Nn("button"));
          var Fi = null, Ft = null, Hl = null, zr = null, Dc = null, Ko = null, ci = null, jo;
          for (jo in c)
            if (Hn.call(c, jo)) {
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
                    Hl = hl;
                    break;
                  case "formAction":
                    zr = hl;
                    break;
                  case "formEncType":
                    Dc = hl;
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
          zr === null || c.type == null || c.type === "submit" || $a || ($a = !0, console.error(
            'A button can only specify a formAction along with type="submit" or no type.'
          ));
          var Lc = mt(
            e,
            h,
            b,
            zr,
            Dc,
            Ko,
            ci,
            Hl
          );
          if (e.push(bt), Lc?.forEach(Ct, e), St(e, Ft, Fi), typeof Fi == "string") {
            e.push(
              ee(Pe(Fi))
            );
            var Qu = null;
          } else Qu = Fi;
          return Qu;
        case "form":
          e.push(Nn("form"));
          var Bl = null, Nc = null, Hr = null, qo = null, go = null, Fa = null, Ul;
          for (Ul in c)
            if (Hn.call(c, Ul)) {
              var Wl = c[Ul];
              if (Wl != null)
                switch (Ul) {
                  case "children":
                    Bl = Wl;
                    break;
                  case "dangerouslySetInnerHTML":
                    Nc = Wl;
                    break;
                  case "action":
                    Hr = Wl;
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
          if (typeof Hr == "function") {
            qo === null && go === null || ru || (ru = !0, console.error(
              "Cannot specify a encType or method for a form that specifies a function as the action. React provides those automatically. They will get overridden."
            )), Fa === null || tu || (tu = !0, console.error(
              "Cannot specify a target for a form that specifies a function as the action. The function will always be executed in the same window."
            ));
            var wr = Ge(
              h,
              Hr
            );
            wr !== null ? (Hr = wr.action || "", qo = wr.encType, go = wr.method, Fa = wr.target, Oi = wr.data, dl = wr.name) : (e.push(
              Ot,
              ee("action"),
              Cl,
              No,
              un
            ), Fa = go = qo = Hr = null, Xt(h, b));
          }
          if (Hr != null && xn(e, "action", Hr), qo != null && xn(e, "encType", qo), go != null && xn(e, "method", go), Fa != null && xn(e, "target", Fa), e.push(bt), dl !== null && (e.push(xa), tt(e, "name", dl), e.push(Zr), Oi?.forEach(
            Ct,
            e
          )), St(e, Nc, Bl), typeof Bl == "string") {
            e.push(
              ee(Pe(Bl))
            );
            var Oa = null;
          } else Oa = Bl;
          return Oa;
        case "menuitem":
          e.push(Nn("menuitem"));
          for (var _i in c)
            if (Hn.call(c, _i)) {
              var vo = c[_i];
              if (vo != null)
                switch (_i) {
                  case "children":
                  case "dangerouslySetInnerHTML":
                    throw Error(
                      "menuitems cannot have `children` nor `dangerouslySetInnerHTML`."
                    );
                  default:
                    xn(
                      e,
                      _i,
                      vo
                    );
                }
            }
          return e.push(bt), null;
        case "object":
          e.push(Nn("object"));
          var ta = null, ps = null, Kr;
          for (Kr in c)
            if (Hn.call(c, Kr)) {
              var ui = c[Kr];
              if (ui != null)
                switch (Kr) {
                  case "children":
                    ta = ui;
                    break;
                  case "dangerouslySetInnerHTML":
                    ps = ui;
                    break;
                  case "data":
                    Jn(ui, "data");
                    var zc = Q("" + ui);
                    if (zc === "") {
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
                      ee(Pe(zc)),
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
          if (e.push(bt), St(e, ps, ta), typeof ta == "string") {
            e.push(
              ee(Pe(ta))
            );
            var wu = null;
          } else wu = ta;
          return wu;
        case "title":
          var Tu = _.tagScope & 1, Xs = _.tagScope & 4;
          if (Hn.call(c, "children")) {
            var bo = c.children, $o = Array.isArray(bo) ? 2 > bo.length ? bo[0] : null : bo;
            Array.isArray(bo) && 1 < bo.length ? console.error(
              "React expects the `children` prop of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found an Array with length %s instead. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert `children` of <title> tags to a single string value which is why Arrays of length greater than 1 are not supported. When using JSX it can be common to combine text nodes and value nodes. For example: <title>hello {nameOfUser}</title>. While not immediately apparent, `children` in this case is an Array with length 2. If your `children` prop is using this form try rewriting it using a template string: <title>{`hello ${nameOfUser}`}</title>.",
              bo.length
            ) : typeof $o == "function" || typeof $o == "symbol" ? console.error(
              "React expect children of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found %s instead. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert children of <title> tags to a single string value.",
              typeof $o == "function" ? "a Function" : "a Sybmol"
            ) : $o && $o.toString === {}.toString && ($o.$$typeof != null ? console.error(
              "React expects the `children` prop of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found an object that appears to be a React element which never implements a suitable `toString` method. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert children of <title> tags to a single string value which is why rendering React elements is not supported. If the `children` of <title> is a React Component try moving the <title> tag into that component. If the `children` of <title> is some HTML markup change it to be Text only to be valid HTML."
            ) : console.error(
              "React expects the `children` prop of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found an object that does not implement a suitable `toString` method. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert children of <title> tags to a single string value. Using the default `toString` method available on every object is almost certainly an error. Consider whether the `children` of this <title> is an object in error and change it to a string or number value if so. Otherwise implement a `toString` method that React can use to produce a valid <title>."
            ));
          }
          if (_.insertionMode === kr || Tu || c.itemProp != null)
            var yo = $r(
              e,
              c
            );
          else
            Xs ? yo = null : ($r(b.hoistableChunks, c), yo = void 0);
          return yo;
        case "link":
          var xu = _.tagScope & 1, Ls = _.tagScope & 4, Ss = c.rel, jr = c.href, Mi = c.precedence;
          if (_.insertionMode === kr || xu || c.itemProp != null || typeof Ss != "string" || typeof jr != "string" || jr === "") {
            Ss === "stylesheet" && typeof c.precedence == "string" && (typeof jr == "string" && jr || console.error(
              'React encountered a `<link rel="stylesheet" .../>` with a `precedence` prop and expected the `href` prop to be a non-empty string but ecountered %s instead. If your intent was to have React hoist and deduplciate this stylesheet using the `precedence` prop ensure there is a non-empty string `href` prop as well, otherwise remove the `precedence` prop.',
              jr === null ? "`null`" : jr === void 0 ? "`undefined`" : jr === "" ? "an empty string" : 'something with type "' + typeof jr + '"'
            )), Ie(e, c);
            var po = null;
          } else if (c.rel === "stylesheet")
            if (typeof Mi != "string" || c.disabled != null || c.onLoad || c.onError) {
              if (typeof Mi == "string") {
                if (c.disabled != null)
                  console.error(
                    'React encountered a `<link rel="stylesheet" .../>` with a `precedence` prop and a `disabled` prop. The presence of the `disabled` prop indicates an intent to manage the stylesheet active state from your from your Component code and React will not hoist or deduplicate this stylesheet. If your intent was to have React hoist and deduplciate this stylesheet using the `precedence` prop remove the `disabled` prop, otherwise remove the `precedence` prop.'
                  );
                else if (c.onLoad || c.onError) {
                  var Ju = c.onLoad && c.onError ? "`onLoad` and `onError` props" : c.onLoad ? "`onLoad` prop" : "`onError` prop";
                  console.error(
                    'React encountered a `<link rel="stylesheet" .../>` with a `precedence` prop and %s. The presence of loading and error handlers indicates an intent to manage the stylesheet loading state from your from your Component code and React will not hoist or deduplicate this stylesheet. If your intent was to have React hoist and deduplciate this stylesheet using the `precedence` prop remove the %s, otherwise remove the `precedence` prop.',
                    Ju,
                    Ju
                  );
                }
              }
              po = Ie(
                e,
                c
              );
            } else {
              var Yl = b.styles.get(Mi), Wt = h.styleResources.hasOwnProperty(
                jr
              ) ? h.styleResources[jr] : void 0;
              if (Wt !== An) {
                h.styleResources[jr] = An, Yl || (Yl = {
                  precedence: ee(Pe(Mi)),
                  rules: [],
                  hrefs: [],
                  sheets: /* @__PURE__ */ new Map()
                }, b.styles.set(Mi, Yl));
                var xt = {
                  state: Sa,
                  props: qn({}, c, {
                    "data-precedence": c.precedence,
                    precedence: null
                  })
                };
                if (Wt) {
                  Wt.length === 2 && hi(xt.props, Wt);
                  var et = b.preloads.stylesheets.get(jr);
                  et && 0 < et.length ? et.length = 0 : xt.state = hu;
                }
                Yl.sheets.set(jr, xt), S && S.stylesheets.add(xt);
              } else if (Yl) {
                var Ps = Yl.sheets.get(jr);
                Ps && S && S.stylesheets.add(Ps);
              }
              J && e.push(Lt), po = null;
            }
          else
            c.onLoad || c.onError ? po = Ie(
              e,
              c
            ) : (J && e.push(Lt), po = Ls ? null : Ie(b.hoistableChunks, c));
          return po;
        case "script":
          var ec = _.tagScope & 1, Ku = c.async;
          if (typeof c.src != "string" || !c.src || !Ku || typeof Ku == "function" || typeof Ku == "symbol" || c.onLoad || c.onError || _.insertionMode === kr || ec || c.itemProp != null)
            var nc = Da(
              e,
              c
            );
          else {
            var Hc = c.src;
            if (c.type === "module")
              var ju = h.moduleScriptResources, Bc = b.preloads.moduleScripts;
            else
              ju = h.scriptResources, Bc = b.preloads.scripts;
            var Eu = ju.hasOwnProperty(Hc) ? ju[Hc] : void 0;
            if (Eu !== An) {
              ju[Hc] = An;
              var Ru = c;
              if (Eu) {
                Eu.length === 2 && (Ru = qn({}, c), hi(Ru, Eu));
                var ws = Bc.get(Hc);
                ws && (ws.length = 0);
              }
              var As = [];
              b.scripts.add(As), Da(As, Ru);
            }
            J && e.push(Lt), nc = null;
          }
          return nc;
        case "style":
          var Ns = _.tagScope & 1;
          if (Hn.call(c, "children")) {
            var qu = c.children, $u = Array.isArray(qu) ? 2 > qu.length ? qu[0] : null : qu;
            (typeof $u == "function" || typeof $u == "symbol" || Array.isArray($u)) && console.error(
              "React expect children of <style> tags to be a string, number, or object with a `toString` method but found %s instead. In browsers style Elements can only have `Text` Nodes as children.",
              typeof $u == "function" ? "a Function" : typeof $u == "symbol" ? "a Sybmol" : "an Array"
            );
          }
          var Uc = c.precedence, wo = c.href, _a = c.nonce;
          if (_.insertionMode === kr || Ns || c.itemProp != null || typeof Uc != "string" || typeof wo != "string" || wo === "") {
            e.push(Nn("style"));
            var gl = null, Cu = null, zs;
            for (zs in c)
              if (Hn.call(c, zs)) {
                var Zs = c[zs];
                if (Zs != null)
                  switch (zs) {
                    case "children":
                      gl = Zs;
                      break;
                    case "dangerouslySetInnerHTML":
                      Cu = Zs;
                      break;
                    default:
                      xn(
                        e,
                        zs,
                        Zs
                      );
                  }
              }
            e.push(bt);
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
            wo.includes(" ") && console.error(
              'React expected the `href` prop for a <style> tag opting into hoisting semantics using the `precedence` prop to not have any spaces but ecountered spaces instead. using spaces in this prop will cause hydration of this style to fail on the client. The href for the <style> where this ocurred is "%s".',
              wo
            );
            var Ts = b.styles.get(Uc), uf = h.styleResources.hasOwnProperty(wo) ? h.styleResources[wo] : void 0;
            if (uf !== An) {
              h.styleResources[wo] = An, uf && console.error(
                'React encountered a hoistable style tag for the same href as a preload: "%s". When using a style tag to inline styles you should not also preload it as a stylsheet.',
                wo
              ), Ts || (Ts = {
                precedence: ee(
                  Pe(Uc)
                ),
                rules: [],
                hrefs: [],
                sheets: /* @__PURE__ */ new Map()
              }, b.styles.set(
                Uc,
                Ts
              ));
              var Hs = b.nonce.style;
              if (Hs && Hs !== _a)
                console.error(
                  'React encountered a style tag with `precedence` "%s" and `nonce` "%s". When React manages style rules using `precedence` it will only include rules if the nonce matches the style nonce "%s" that was included with this render.',
                  Uc,
                  _a,
                  Hs
                );
              else {
                !Hs && _a && console.error(
                  'React encountered a style tag with `precedence` "%s" and `nonce` "%s". When React manages style rules using `precedence` it will only include a nonce attributes if you also provide the same style nonce value as a render option.',
                  Uc,
                  _a
                ), Ts.hrefs.push(
                  ee(Pe(wo))
                );
                var Vs = Ts.rules, Qs = null, kf = null, sf;
                for (sf in c)
                  if (Hn.call(c, sf)) {
                    var yf = c[sf];
                    if (yf != null)
                      switch (sf) {
                        case "children":
                          Qs = yf;
                          break;
                        case "dangerouslySetInnerHTML":
                          kf = yf;
                      }
                  }
                var js = Array.isArray(Qs) ? 2 > Qs.length ? Qs[0] : null : Qs;
                typeof js != "function" && typeof js != "symbol" && js !== null && js !== void 0 && Vs.push(
                  ee(xr(js))
                ), St(Vs, kf, Qs);
              }
            }
            Ts && S && S.styles.add(Ts), J && e.push(Lt), cf = void 0;
          }
          return cf;
        case "meta":
          var Jf = _.tagScope & 1, Kf = _.tagScope & 4;
          if (_.insertionMode === kr || Jf || c.itemProp != null)
            var Sf = Pt(
              e,
              c,
              "meta"
            );
          else
            J && e.push(Lt), Sf = Kf ? null : typeof c.charSet == "string" ? Pt(b.charsetChunks, c, "meta") : c.name === "viewport" ? Pt(b.viewportChunks, c, "meta") : Pt(
              b.hoistableChunks,
              c,
              "meta"
            );
          return Sf;
        case "listing":
        case "pre":
          e.push(Nn(t));
          var qs = null, $s = null, ef;
          for (ef in c)
            if (Hn.call(c, ef)) {
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
          if (e.push(bt), $s != null) {
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
` ? e.push(lu, ee(Os)) : (Je(Os), e.push(ee("" + Os))));
          }
          return typeof qs == "string" && qs[0] === `
` && e.push(lu), qs;
        case "img":
          var jf = _.tagScope & 3, ra = c.src, Ii = c.srcSet;
          if (!(c.loading === "lazy" || !ra && !Ii || typeof ra != "string" && ra != null || typeof Ii != "string" && Ii != null || c.fetchPriority === "low" || jf) && (typeof ra != "string" || ra[4] !== ":" || ra[0] !== "d" && ra[0] !== "D" || ra[1] !== "a" && ra[1] !== "A" || ra[2] !== "t" && ra[2] !== "T" || ra[3] !== "a" && ra[3] !== "A") && (typeof Ii != "string" || Ii[4] !== ":" || Ii[0] !== "d" && Ii[0] !== "D" || Ii[1] !== "a" && Ii[1] !== "A" || Ii[2] !== "t" && Ii[2] !== "T" || Ii[3] !== "a" && Ii[3] !== "A")) {
            S !== null && _.tagScope & 64 && (S.suspenseyImages = !0);
            var Pf = typeof c.sizes == "string" ? c.sizes : void 0, Js = Ii ? Ii + `
` + (Pf || "") : ra, pf = b.preloads.images, Bs = pf.get(Js);
            if (Bs)
              (c.fetchPriority === "high" || 10 > b.highImagePreloads.size) && (pf.delete(Js), b.highImagePreloads.add(Bs));
            else if (!h.imageResources.hasOwnProperty(Js)) {
              h.imageResources[Js] = qt;
              var wf = c.crossOrigin, Af = typeof wf == "string" ? wf === "use-credentials" ? wf : "" : void 0, Us = b.headers, Tf;
              Us && 0 < Us.remainingCapacity && typeof c.srcSet != "string" && (c.fetchPriority === "high" || 500 > Us.highImagePreloads.length) && (Tf = oa(ra, "image", {
                imageSrcSet: c.srcSet,
                imageSizes: c.sizes,
                crossOrigin: Af,
                integrity: c.integrity,
                nonce: c.nonce,
                type: c.type,
                fetchPriority: c.fetchPriority,
                referrerPolicy: c.refererPolicy
              }), 0 <= (Us.remainingCapacity -= Tf.length + 2)) ? (b.resets.image[Js] = qt, Us.highImagePreloads && (Us.highImagePreloads += ", "), Us.highImagePreloads += Tf) : (Bs = [], Ie(Bs, {
                rel: "preload",
                as: "image",
                href: Ii ? void 0 : ra,
                imageSrcSet: Ii,
                imageSizes: Pf,
                crossOrigin: Af,
                integrity: c.integrity,
                type: c.type,
                fetchPriority: c.fetchPriority,
                referrerPolicy: c.referrerPolicy
              }), c.fetchPriority === "high" || 10 > b.highImagePreloads.size ? b.highImagePreloads.add(Bs) : (b.bulkPreloads.add(Bs), pf.set(Js, Bs)));
            }
          }
          return Pt(e, c, "img");
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
          return Pt(e, c, t);
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
          if (_.insertionMode < mr) {
            var xf = x || b.preamble;
            if (xf.headChunks)
              throw Error("The `<head>` tag may only be rendered once.");
            x !== null && e.push(Sc), xf.headChunks = [];
            var Ff = vn(
              xf.headChunks,
              c,
              "head"
            );
          } else
            Ff = rr(
              e,
              c,
              "head"
            );
          return Ff;
        case "body":
          if (_.insertionMode < mr) {
            var Ef = x || b.preamble;
            if (Ef.bodyChunks)
              throw Error("The `<body>` tag may only be rendered once.");
            x !== null && e.push(zu), Ef.bodyChunks = [];
            var Of = vn(
              Ef.bodyChunks,
              c,
              "body"
            );
          } else
            Of = rr(
              e,
              c,
              "body"
            );
          return Of;
        case "html":
          if (_.insertionMode === Do) {
            var Rf = x || b.preamble;
            if (Rf.htmlChunks)
              throw Error("The `<html>` tag may only be rendered once.");
            x !== null && e.push(Hu), Rf.htmlChunks = [Nt];
            var _f = vn(
              Rf.htmlChunks,
              c,
              "html"
            );
          } else
            _f = rr(
              e,
              c,
              "html"
            );
          return _f;
        default:
          if (t.indexOf("-") !== -1) {
            e.push(Nn(t));
            var Cf = null, Mf = null, Ks;
            for (Ks in c)
              if (Hn.call(c, Ks)) {
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
                            Pe(mu)
                          ),
                          un
                        );
                      }
                  }
                }
              }
            return e.push(bt), St(
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
        A(e, t[c]);
      return c < t.length ? (c = t[c], t.length = 0, D(e, c)) : !0;
    }
    function el(e, t, c) {
      if (A(e, Ra), c === null)
        throw Error(
          "An ID must have been assigned before we can complete the boundary."
        );
      return A(e, t.boundaryPrefix), A(e, ee(c.toString(16))), D(e, _l);
    }
    function aa(e, t, c, h) {
      switch (c.insertionMode) {
        case Do:
        case wa:
        case Ec:
        case mr:
          return A(e, ss), A(e, t.segmentPrefix), A(e, ee(h.toString(16))), D(e, li);
        case kr:
          return A(e, ml), A(e, t.segmentPrefix), A(e, ee(h.toString(16))), D(e, ka);
        case Rl:
          return A(e, Ml), A(e, t.segmentPrefix), A(e, ee(h.toString(16))), D(e, Yu);
        case Qi:
          return A(e, Uo), A(e, t.segmentPrefix), A(e, ee(h.toString(16))), D(e, l);
        case Rc:
          return A(e, s), A(e, t.segmentPrefix), A(e, ee(h.toString(16))), D(e, v);
        case Ji:
          return A(e, C), A(e, t.segmentPrefix), A(e, ee(h.toString(16))), D(e, k);
        case nu:
          return A(e, O), A(e, t.segmentPrefix), A(e, ee(h.toString(16))), D(e, H);
        default:
          throw Error("Unknown insertion mode. This is a bug in React.");
      }
    }
    function fi(e, t) {
      switch (t.insertionMode) {
        case Do:
        case wa:
        case Ec:
        case mr:
          return D(e, Bo);
        case kr:
          return D(e, ro);
        case Rl:
          return D(e, fs);
        case Qi:
          return D(e, a);
        case Rc:
          return D(e, p);
        case Ji:
          return D(e, z);
        case nu:
          return D(e, Z);
        default:
          throw Error("Unknown insertion mode. This is a bug in React.");
      }
    }
    function Zl(e) {
      return JSON.stringify(e).replace(
        Dl,
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
    function Vl(e) {
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
    function bl(e) {
      var t = e.rules, c = e.hrefs;
      0 < t.length && c.length === 0 && console.error(
        "React expected to have at least one href for an a hoistable style but found none. This is a bug in React."
      );
      var h = 0;
      if (c.length) {
        for (A(this, sn.startInlineStyle), A(this, ii), A(this, e.precedence), A(this, Or); h < c.length - 1; h++)
          A(this, c[h]), A(this, ot);
        for (A(this, c[h]), A(this, io), h = 0; h < t.length; h++) A(this, t[h]);
        Yo = D(
          this,
          Wo
        ), Qr = !0, t.length = 0, c.length = 0;
      }
    }
    function R(e) {
      return e.state !== Ci ? Qr = !0 : !1;
    }
    function L(e, t, c) {
      return Qr = !1, Yo = !0, sn = c, t.styles.forEach(bl, e), sn = null, t.stylesheets.forEach(R), Qr && (c.stylesToHoist = !0), Yo;
    }
    function ne(e) {
      for (var t = 0; t < e.length; t++) A(this, e[t]);
      e.length = 0;
    }
    function Ee(e) {
      Ie(_r, e.props);
      for (var t = 0; t < _r.length; t++)
        A(this, _r[t]);
      _r.length = 0, e.state = Ci;
    }
    function Fe(e) {
      var t = 0 < e.sheets.size;
      e.sheets.forEach(Ee, this), e.sheets.clear();
      var c = e.rules, h = e.hrefs;
      if (!t || h.length) {
        if (A(this, sn.startInlineStyle), A(this, ao), A(this, e.precedence), e = 0, h.length) {
          for (A(this, Gu); e < h.length - 1; e++)
            A(this, h[e]), A(this, ot);
          A(this, h[e]);
        }
        for (A(this, Go), e = 0; e < c.length; e++)
          A(this, c[e]);
        A(this, ai), c.length = 0, h.length = 0;
      }
    }
    function ln(e) {
      if (e.state === Sa) {
        e.state = hu;
        var t = e.props;
        for (Ie(_r, {
          rel: "preload",
          as: "style",
          href: e.props.href,
          crossOrigin: t.crossOrigin,
          fetchPriority: t.fetchPriority,
          integrity: t.integrity,
          media: t.media,
          hrefLang: t.hrefLang,
          referrerPolicy: t.referrerPolicy
        }), e = 0; e < _r.length; e++)
          A(this, _r[e]);
        _r.length = 0;
      }
    }
    function Ke(e) {
      e.sheets.forEach(ln, this), e.sheets.clear();
    }
    function an(e, t) {
      (t.instructions & Pn) === vt && (t.instructions |= Pn, e.push(
        uu,
        ee(
          Pe("_" + t.idPrefix + "R_")
        ),
        un
      ));
    }
    function We(e, t) {
      A(e, oo);
      var c = oo;
      t.stylesheets.forEach(function(h) {
        if (h.state !== Ci)
          if (h.state === co)
            A(e, c), h = h.props.href, Jn(h, "href"), A(
              e,
              ee(
                Vl("" + h)
              )
            ), A(e, Xo), c = su;
          else {
            A(e, c);
            var b = h.props["data-precedence"], x = h.props, S = Q("" + h.props.href);
            A(
              e,
              ee(Vl(S))
            ), Jn(b, "precedence"), b = "" + b, A(e, fu), A(
              e,
              ee(Vl(b))
            );
            for (var _ in x)
              if (Hn.call(x, _) && (b = x[_], b != null))
                switch (_) {
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
                    Ql(
                      e,
                      _,
                      b
                    );
                }
            A(e, Xo), c = su, h.state = co;
          }
      }), A(e, Xo);
    }
    function Ql(e, t, c) {
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
          h = "class", Jn(c, h), t = "" + c;
          break;
        case "hidden":
          if (c === !1) return;
          t = "";
          break;
        case "src":
        case "href":
          c = Q(c), Jn(c, h), t = "" + c;
          break;
        default:
          if (2 < t.length && (t[0] === "o" || t[0] === "O") && (t[1] === "n" || t[1] === "N") || !Et(t))
            return;
          Jn(c, h), t = "" + c;
      }
      A(e, fu), A(
        e,
        ee(Vl(h))
      ), A(e, fu), A(
        e,
        ee(Vl(t))
      );
    }
    function nl() {
      return { styles: /* @__PURE__ */ new Set(), stylesheets: /* @__PURE__ */ new Set(), suspenseyImages: !1 };
    }
    function dt(e, t, c, h) {
      (e.scriptResources.hasOwnProperty(c) || e.moduleScriptResources.hasOwnProperty(c)) && console.error(
        'Internal React Error: React expected bootstrap script or module with src "%s" to not have been preloaded already. please file an issue',
        c
      ), e.scriptResources[c] = An, e.moduleScriptResources[c] = An, e = [], Ie(e, h), t.bootstrapScripts.add(e);
    }
    function hi(e, t) {
      e.crossOrigin == null && (e.crossOrigin = t[0]), e.integrity == null && (e.integrity = t[1]);
    }
    function oa(e, t, c) {
      e = La(e), t = tl(t, "as"), t = "<" + e + '>; rel=preload; as="' + t + '"';
      for (var h in c)
        Hn.call(c, h) && (e = c[h], typeof e == "string" && (t += "; " + h.toLowerCase() + '="' + tl(
          e,
          h
        ) + '"'));
      return t;
    }
    function La(e) {
      return Jn(e, "href"), ("" + e).replace(
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
      ), Br(e)), ("" + e).replace(
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
    function yl(e) {
      this.stylesheets.add(e);
    }
    function Cn(e, t) {
      t.styles.forEach(lc, e), t.stylesheets.forEach(yl, e), t.suspenseyImages && (e.suspenseyImages = !0);
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
        case wc:
          return "Profiler";
        case pc:
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
          case yc:
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
          case ba:
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
    function zn(e, t) {
      var c = t.parent;
      if (c === null)
        throw Error(
          "The depth must equal at least at zero before reaching the root. This is a bug in React."
        );
      e.depth === c.depth ? ic(e, c) : zn(e, c), t.context._currentValue = t.value;
    }
    function mn(e) {
      var t = qi;
      t !== e && (t === null ? oc(e) : e === null ? ac(t) : t.depth === e.depth ? ic(t, e) : t.depth > e.depth ? di(t, e) : zn(t, e), qi = e);
    }
    function Jl(e) {
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
    function Na(e, t, c) {
      var h = e.id;
      e = e.overflow;
      var b = 32 - Vo(h) - 1;
      h &= ~(1 << b), c += 1;
      var x = 32 - Vo(t) + b;
      if (30 < x) {
        var S = b - b % 5;
        return x = (h & (1 << S) - 1).toString(32), h >>= S, b -= S, {
          id: 1 << 32 - Vo(t) + b | c << b | h,
          overflow: x + e
        };
      }
      return {
        id: 1 << x | c << b | h,
        overflow: e
      };
    }
    function Wc(e) {
      return e >>>= 0, e === 0 ? 32 : 31 - (Ms(e) / Is | 0) | 0;
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
                var b = t;
                b.status = "fulfilled", b.value = h;
              }
            },
            function(h) {
              if (t.status === "pending") {
                var b = t;
                b.status = "rejected", b.reason = h;
              }
            }
          )), t.status) {
            case "fulfilled":
              return t.value;
            case "rejected":
              throw t.reason;
          }
          throw bs = t, mi;
      }
    }
    function ku() {
      if (bs === null)
        throw Error(
          "Expected a suspended thenable. This is a bug in React. Please file an issue."
        );
      var e = bs;
      return bs = null, e;
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
      if (0 < Mc)
        throw Error("Rendered more hooks than during the previous render");
      return { memoizedState: null, queue: null, next: null };
    }
    function Eo() {
      return Dn === null ? Nl === null ? (il = !1, Nl = Dn = Gc()) : (il = !0, Dn = Nl) : Dn.next === null ? (il = !1, Dn = Dn.next = Gc()) : (il = !0, Dn = Dn.next), Dn;
    }
    function pl() {
      var e = Qo;
      return Qo = null, e;
    }
    function za() {
      oi = !1, Aa = Mr = $i = ar = null, ea = !1, Nl = null, Mc = 0, Dn = fo = null;
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
      if (e !== rs && (ho = "useReducer"), ar = rt(), Dn = Eo(), il) {
        if (c = Dn.queue, t = c.dispatch, fo !== null) {
          var h = fo.get(c);
          if (h !== void 0) {
            fo.delete(c), c = Dn.memoizedState;
            do {
              var b = h.action;
              oi = !0, c = e(c, b), oi = !1, h = h.next;
            } while (h !== null);
            return Dn.memoizedState = c, [c, t];
          }
        }
        return [Dn.memoizedState, t];
      }
      return oi = !0, e = e === rs ? typeof t == "function" ? t() : t : c !== void 0 ? c(t) : t, oi = !1, Dn.memoizedState = e, e = Dn.queue = { last: null, dispatch: null }, e = e.dispatch = gi.bind(
        null,
        ar,
        e
      ), [Dn.memoizedState, e];
    }
    function Co(e, t) {
      if (ar = rt(), Dn = Eo(), t = t === void 0 ? null : t, Dn !== null) {
        var c = Dn.memoizedState;
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
              for (var b = 0; b < h.length && b < t.length; b++)
                if (!Ds(t[b], h[b])) {
                  h = !1;
                  break e;
                }
              h = !0;
            }
          }
          if (h) return c[0];
        }
      }
      return oi = !0, e = e(), oi = !1, Dn.memoizedState = [e, t], e;
    }
    function gi(e, t, c) {
      if (25 <= Mc)
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
      var h = _c++, b = Mr;
      if (typeof e.$$FORM_ACTION == "function") {
        var x = null, S = Aa;
        b = b.formState;
        var _ = e.$$IS_SIGNATURE_EQUAL;
        if (b !== null && typeof _ == "function") {
          var J = b[1];
          _.call(e, b[2], b[3]) && (x = c !== void 0 ? "p" + c : "k" + Re(
            JSON.stringify([
              S,
              null,
              h
            ]),
            0
          ), J === x && (pu = h, t = b[0]));
        }
        var N = e.bind(null, t);
        return e = function(oe) {
          N(oe);
        }, typeof N.$$FORM_ACTION == "function" && (e.$$FORM_ACTION = function(oe) {
          oe = N.$$FORM_ACTION(oe), c !== void 0 && (Jn(c, "target"), c += "", oe.action = c);
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
      var t = ys;
      return ys += 1, Qo === null && (Qo = []), ns(Qo, e, t);
    }
    function mo() {
      throw Error("Cache cannot be refreshed during server rendering.");
    }
    function sc() {
    }
    function Zc() {
      if (d === 0) {
        y = console.log, E = console.info, F = console.warn, I = console.error, te = console.group, B = console.groupCollapsed, j = console.groupEnd;
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
    function bi() {
      if (d--, d === 0) {
        var e = { configurable: !0, enumerable: !0, writable: !0 };
        Object.defineProperties(console, {
          log: qn({}, e, { value: y }),
          info: qn({}, e, { value: E }),
          warn: qn({}, e, { value: F }),
          error: qn({}, e, { value: I }),
          group: qn({}, e, { value: te }),
          groupCollapsed: qn({}, e, { value: B }),
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
      if (!e || be) return "";
      var c = ae.get(e);
      if (c !== void 0) return c;
      be = !0, c = Error.prepareStackTrace, Error.prepareStackTrace = void 0;
      var h = null;
      h = cn.H, cn.H = null, Zc();
      try {
        var b = {
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
                    var ue = le;
                  }
                  Reflect.construct(e, [], se);
                } else {
                  try {
                    se.call();
                  } catch (le) {
                    ue = le;
                  }
                  e.call(se.prototype);
                }
              } else {
                try {
                  throw Error();
                } catch (le) {
                  ue = le;
                }
                (se = e()) && typeof se.catch == "function" && se.catch(function() {
                });
              }
            } catch (le) {
              if (le && ue && typeof le.stack == "string")
                return [le.stack, ue.stack];
            }
            return [null, null];
          }
        };
        b.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
        var x = Object.getOwnPropertyDescriptor(
          b.DetermineComponentFrameRoot,
          "name"
        );
        x && x.configurable && Object.defineProperty(
          b.DetermineComponentFrameRoot,
          "name",
          { value: "DetermineComponentFrameRoot" }
        );
        var S = b.DetermineComponentFrameRoot(), _ = S[0], J = S[1];
        if (_ && J) {
          var N = _.split(`
`), U = J.split(`
`);
          for (S = x = 0; x < N.length && !N[x].includes(
            "DetermineComponentFrameRoot"
          ); )
            x++;
          for (; S < U.length && !U[S].includes(
            "DetermineComponentFrameRoot"
          ); )
            S++;
          if (x === N.length || S === U.length)
            for (x = N.length - 1, S = U.length - 1; 1 <= x && 0 <= S && N[x] !== U[S]; )
              S--;
          for (; 1 <= x && 0 <= S; x--, S--)
            if (N[x] !== U[S]) {
              if (x !== 1 || S !== 1)
                do
                  if (x--, S--, 0 > S || N[x] !== U[S]) {
                    var oe = `
` + N[x].replace(
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
        be = !1, cn.H = h, bi(), Error.prepareStackTrace = c;
      }
      return N = (N = e ? e.displayName || e.name : "") ? Ur(N) : "", typeof e == "function" && ae.set(e, N), N;
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
          case ba:
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
      1e3 < e - Mn && (cn.recentlyCreatedOwnerStacks = 0, Mn = e);
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
    function ca(e, t, c, h, b, x, S, _, J, N, U) {
      var oe = /* @__PURE__ */ new Set();
      this.destination = null, this.flushScheduled = !1, this.resumableState = e, this.renderState = t, this.rootFormatContext = c, this.progressiveChunkSize = h === void 0 ? 12800 : h, this.status = 10, this.fatalError = null, this.pendingRootTasks = this.allPendingTasks = this.nextSegmentId = 0, this.completedPreambleSegments = this.completedRootSegment = null, this.byteSize = 0, this.abortableTasks = oe, this.pingedTasks = [], this.clientRenderedBoundaries = [], this.completedBoundaries = [], this.partialBoundaries = [], this.trackedPostpones = null, this.onError = b === void 0 ? dc : b, this.onPostpone = N === void 0 ? Er : N, this.onAllReady = x === void 0 ? Er : x, this.onShellReady = S === void 0 ? Er : S, this.onShellError = _ === void 0 ? Er : _, this.onFatalError = J === void 0 ? Er : J, this.formState = U === void 0 ? null : U, this.didWarnForKey = null;
    }
    function ko(e, t, c, h, b, x, S, _, J, N, U, oe) {
      return hc(), t = new ca(
        t,
        c,
        h,
        b,
        x,
        S,
        _,
        J,
        N,
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
        yu,
        null,
        null,
        kl,
        null
      ), zi(e), t.pingedTasks.push(e), t;
    }
    function Yr(e, t, c, h, b, x, S, _, J, N, U) {
      return e = ko(
        e,
        t,
        c,
        h,
        b,
        x,
        S,
        _,
        J,
        N,
        U,
        void 0
      ), e.trackedPostpones = {
        workingMap: /* @__PURE__ */ new Map(),
        rootNodes: [],
        rootSlots: null
      }, e;
    }
    function Kt(e, t, c, h, b, x, S, _, J) {
      return hc(), c = new ca(
        t.resumableState,
        c,
        t.rootFormatContext,
        t.progressiveChunkSize,
        h,
        b,
        x,
        S,
        _,
        J,
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
        yu,
        null,
        null,
        kl,
        null
      ), zi(e), c.pingedTasks.push(e), c) : (e = Au(
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
        yu,
        null,
        null,
        kl,
        null
      ), zi(e), c.pingedTasks.push(e), c);
    }
    function jn(e, t, c, h, b, x, S, _, J) {
      return e = Kt(
        e,
        t,
        c,
        h,
        b,
        x,
        S,
        _,
        J
      ), e.trackedPostpones = {
        workingMap: /* @__PURE__ */ new Map(),
        rootNodes: [],
        rootSlots: null
      }, e;
    }
    function Pu(e, t) {
      e.pingedTasks.push(t), e.pingedTasks.length === 1 && (e.flushScheduled = e.destination !== null, e.trackedPostpones !== null || e.status === 10 ? Va(function() {
        return ga(e);
      }) : ie(function() {
        return ga(e);
      }));
    }
    function Di(e, t, c, h, b) {
      return c = {
        status: Bn,
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
        fallbackPreamble: b,
        trackedContentKeyPath: null,
        trackedFallbackNode: null,
        errorMessage: null,
        errorStack: null,
        errorComponentStack: null
      }, t !== null && (t.pendingTasks++, h = t.boundaries, h !== null && (e.allPendingTasks++, c.pendingTasks++, h.push(c)), e = t.inheritedHoistables, e !== null && Cn(c.contentState, e)), c;
    }
    function jl(e, t, c, h, b, x, S, _, J, N, U, oe, se, ue, le, Ue, Zn) {
      e.allPendingTasks++, b === null ? e.pendingRootTasks++ : b.pendingTasks++, ue !== null && ue.pendingTasks++;
      var ze = {
        replay: null,
        node: c,
        childIndex: h,
        ping: function() {
          return Pu(e, ze);
        },
        blockedBoundary: b,
        blockedSegment: x,
        blockedPreamble: S,
        hoistableState: _,
        abortSet: J,
        keyPath: N,
        formatContext: U,
        context: oe,
        treeContext: se,
        row: ue,
        componentStack: le,
        thenableState: t
      };
      return ze.debugTask = Zn, J.add(ze), ze;
    }
    function Au(e, t, c, h, b, x, S, _, J, N, U, oe, se, ue, le, Ue) {
      e.allPendingTasks++, x === null ? e.pendingRootTasks++ : x.pendingTasks++, se !== null && se.pendingTasks++, c.pendingTasks++;
      var Zn = {
        replay: c,
        node: h,
        childIndex: b,
        ping: function() {
          return Pu(e, Zn);
        },
        blockedBoundary: x,
        blockedSegment: null,
        blockedPreamble: null,
        hoistableState: S,
        abortSet: _,
        keyPath: J,
        formatContext: N,
        context: U,
        treeContext: oe,
        row: se,
        componentStack: ue,
        thenableState: t
      };
      return Zn.debugTask = Ue, _.add(Zn), Zn;
    }
    function Li(e, t, c, h, b, x) {
      return {
        status: Bn,
        parentFlushed: !1,
        id: -1,
        index: t,
        chunks: [],
        children: [],
        preambleChildren: [],
        parentFormatContext: h,
        boundary: c,
        lastPushedText: b,
        textEmbedded: x
      };
    }
    function yi() {
      if (r === null || r.componentStack === null)
        return "";
      var e = r.componentStack;
      try {
        var t = "";
        if (typeof e.type == "string")
          t += Ur(e.type);
        else if (typeof e.type == "function") {
          if (!e.owner) {
            var c = t, h = e.type, b = h ? h.displayName || h.name : "", x = b ? Ur(b) : "";
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
      } catch (_) {
        S = `
Error generating stack: ` + _.message + `
` + _.stack;
      }
      return S;
    }
    function So(e, t) {
      if (t != null)
        for (var c = t.length - 1; 0 <= c; c--) {
          var h = t[c];
          if (typeof h.name == "string" || typeof h.time == "number") break;
          if (h.awaited != null) {
            var b = h.debugStack == null ? h.awaited : h;
            if (b.debugStack !== void 0) {
              e.componentStack = {
                parent: e.componentStack,
                type: h,
                owner: b.owner,
                stack: b.debugStack
              }, e.debugTask = b.debugTask;
              break;
            }
          }
        }
    }
    function Ni(e, t) {
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
    function zi(e) {
      var t = e.node;
      if (typeof t == "object" && t !== null)
        switch (t.$$typeof) {
          case jc:
            var c = t.type, h = t._owner, b = t._debugStack;
            Ni(e, t._debugInfo), e.debugTask = t._debugTask, e.componentStack = {
              parent: e.componentStack,
              type: c,
              owner: h,
              stack: b
            };
            break;
          case ba:
            Ni(e, t._debugInfo);
            break;
          default:
            typeof t.then == "function" && Ni(e, t._debugInfo);
        }
    }
    function Po(e) {
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
            var b = c;
          } catch (x) {
            b = `
Error generating stack: ` + x.message + `
` + x.stack;
          }
          return Object.defineProperty(t, "componentStack", {
            value: b
          }), b;
        }
      }), t;
    }
    function ql(e, t, c, h, b) {
      e.errorDigest = t, c instanceof Error ? (t = String(c.message), c = String(c.stack)) : (t = typeof c == "object" && c !== null ? Tn(c) : String(c), c = null), b = b ? `Switched to client rendering because the server rendering aborted due to:

` : `Switched to client rendering because the server rendering errored:

`, e.errorMessage = b + t, e.errorStack = c !== null ? b + c : null, e.errorComponentStack = h.componentStack;
    }
    function Mt(e, t, c, h) {
      if (e = e.onError, t = h ? h.run(e.bind(null, t, c)) : e(t, c), t != null && typeof t != "string")
        console.error(
          'onError returned something with a type other than "string". onError should return a string and may return null or undefined but must not return anything else. It received something of type "%s" instead',
          typeof t
        );
      else return t;
    }
    function pi(e, t, c, h) {
      c = e.onShellError;
      var b = e.onFatalError;
      h ? (h.run(c.bind(null, t)), h.run(b.bind(null, t))) : (c(t), b(t)), e.destination !== null ? (e.status = Ir, tr(e.destination, t)) : (e.status = 13, e.fatalError = t);
    }
    function Vt(e, t) {
      ua(e, t.next, t.hoistables);
    }
    function ua(e, t, c) {
      for (; t !== null; ) {
        c !== null && (Cn(t.hoistables, c), t.inheritedHoistables = c);
        var h = t.boundaries;
        if (h !== null) {
          t.boundaries = null;
          for (var b = 0; b < h.length; b++) {
            var x = h[b];
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
    function Ha(e, t) {
      var c = t.boundaries;
      if (c !== null && t.pendingTasks === c.length) {
        for (var h = !0, b = 0; b < c.length; b++) {
          var x = c[b];
          if (x.pendingTasks !== 1 || x.parentFlushed || Wr(e, x)) {
            h = !1;
            break;
          }
        }
        h && ua(e, t, t.hoistables);
      }
    }
    function wi(e) {
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
    function Hi(e, t, c, h, b) {
      var x = t.keyPath, S = t.treeContext, _ = t.row, J = t.componentStack, N = t.debugTask;
      Ni(t, t.node.props.children._debugInfo), t.keyPath = c, c = h.length;
      var U = null;
      if (t.replay !== null) {
        var oe = t.replay.slots;
        if (oe !== null && typeof oe == "object")
          for (var se = 0; se < c; se++) {
            var ue = b !== "backwards" && b !== "unstable_legacy-backwards" ? se : c - 1 - se, le = h[ue];
            t.row = U = wi(
              U
            ), t.treeContext = Na(S, c, ue);
            var Ue = oe[ue];
            typeof Ue == "number" ? (Ba(e, t, Ue, le, ue), delete oe[ue]) : jt(e, t, le, ue), --U.pendingTasks === 0 && Vt(e, U);
          }
        else
          for (oe = 0; oe < c; oe++)
            se = b !== "backwards" && b !== "unstable_legacy-backwards" ? oe : c - 1 - oe, ue = h[se], $l(e, t, ue), t.row = U = wi(U), t.treeContext = Na(S, c, se), jt(e, t, ue, se), --U.pendingTasks === 0 && Vt(e, U);
      } else if (b !== "backwards" && b !== "unstable_legacy-backwards")
        for (b = 0; b < c; b++)
          oe = h[b], $l(e, t, oe), t.row = U = wi(U), t.treeContext = Na(
            S,
            c,
            b
          ), jt(e, t, oe, b), --U.pendingTasks === 0 && Vt(e, U);
      else {
        for (b = t.blockedSegment, oe = b.children.length, se = b.chunks.length, ue = c - 1; 0 <= ue; ue--) {
          le = h[ue], t.row = U = wi(
            U
          ), t.treeContext = Na(S, c, ue), Ue = Li(
            e,
            se,
            null,
            t.formatContext,
            ue === 0 ? b.lastPushedText : !0,
            !0
          ), b.children.splice(oe, 0, Ue), t.blockedSegment = Ue, $l(e, t, le);
          try {
            jt(e, t, le, ue), Ue.lastPushedText && Ue.textEmbedded && Ue.chunks.push(Lt), Ue.status = Un, ei(e, t.blockedBoundary, Ue), --U.pendingTasks === 0 && Vt(e, U);
          } catch (Zn) {
            throw Ue.status = e.status === 12 ? wt : wn, Zn;
          }
        }
        t.blockedSegment = b, b.lastPushedText = !1;
      }
      _ !== null && U !== null && 0 < U.pendingTasks && (_.pendingTasks++, U.next = _), t.treeContext = S, t.row = _, t.keyPath = x, t.componentStack = J, t.debugTask = N;
    }
    function It(e, t, c, h, b, x) {
      var S = t.thenableState;
      for (t.thenableState = null, ar = {}, $i = t, Mr = e, Aa = c, oi = !1, _c = zt = 0, pu = -1, ys = 0, Qo = S, e = Qn(h, b, x); ea; )
        ea = !1, _c = zt = 0, pu = -1, ys = 0, Mc += 1, Dn = null, e = h(b, x);
      return za(), e;
    }
    function Bi(e, t, c, h, b, x, S) {
      var _ = !1;
      if (x !== 0 && e.formState !== null) {
        var J = t.blockedSegment;
        if (J !== null) {
          _ = !0, J = J.chunks;
          for (var N = 0; N < x; N++)
            N === S ? J.push(no) : J.push(Pr);
        }
      }
      x = t.keyPath, t.keyPath = c, b ? (c = t.treeContext, t.treeContext = Na(c, 1, 0), jt(e, t, h, -1), t.treeContext = c) : _ ? jt(e, t, h, -1) : Gr(e, t, h, -1), t.keyPath = x;
    }
    function Ui(e, t, c, h, b, x) {
      if (typeof h == "function")
        if (h.prototype && h.prototype.isReactComponent) {
          var S = b;
          if ("ref" in b) {
            S = {};
            for (var _ in b)
              _ !== "ref" && (S[_] = b[_]);
          }
          var J = h.defaultProps;
          if (J) {
            S === b && (S = qn({}, S, b));
            for (var N in J)
              S[N] === void 0 && (S[N] = J[N]);
          }
          var U = S, oe = kl, se = h.contextType;
          if ("contextType" in h && se !== null && (se === void 0 || se.$$typeof !== it) && !ms.has(h)) {
            ms.add(h);
            var ue = se === void 0 ? " However, it is set to undefined. This can be caused by a typo or by mixing up named and default imports. This can also happen due to a circular dependency, so try moving the createContext() call to a separate file." : typeof se != "object" ? " However, it is set to a " + typeof se + "." : se.$$typeof === Xr ? " Did you accidentally pass the Context.Consumer instead?" : " However, it is set to an object with keys {" + Object.keys(se).join(", ") + "}.";
            console.error(
              "%s defines an invalid contextType. contextType should point to the Context object returned by React.createContext().%s",
              dn(h) || "Component",
              ue
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
            var Zn = null, ze = null, hn = null;
            if (typeof le.componentWillMount == "function" && le.componentWillMount.__suppressDeprecationWarning !== !0 ? Zn = "componentWillMount" : typeof le.UNSAFE_componentWillMount == "function" && (Zn = "UNSAFE_componentWillMount"), typeof le.componentWillReceiveProps == "function" && le.componentWillReceiveProps.__suppressDeprecationWarning !== !0 ? ze = "componentWillReceiveProps" : typeof le.UNSAFE_componentWillReceiveProps == "function" && (ze = "UNSAFE_componentWillReceiveProps"), typeof le.componentWillUpdate == "function" && le.componentWillUpdate.__suppressDeprecationWarning !== !0 ? hn = "componentWillUpdate" : typeof le.UNSAFE_componentWillUpdate == "function" && (hn = "UNSAFE_componentWillUpdate"), Zn !== null || ze !== null || hn !== null) {
              var At = dn(h) || "Component", Ht = typeof h.getDerivedStateFromProps == "function" ? "getDerivedStateFromProps()" : "getSnapshotBeforeUpdate()";
              gs.has(At) || (gs.add(
                At
              ), console.error(
                `Unsafe legacy lifecycles will not be called for components using new component APIs.

%s uses %s but also contains the following legacy lifecycles:%s%s%s

The above lifecycles should be removed. Learn more about this warning here:
https://react.dev/link/unsafe-component-lifecycles`,
                At,
                Ht,
                Zn !== null ? `
  ` + Zn : "",
                ze !== null ? `
  ` + ze : "",
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
          ), h.childContextTypes && !bu.has(h) && (bu.add(h), console.error(
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
          var Bt = le.state;
          Bt && (typeof Bt != "object" || xi(Bt)) && console.error("%s.state: must be set to an object or null", On), typeof le.getChildContext == "function" && typeof h.childContextTypes != "object" && console.error(
            "%s.getChildContext(): childContextTypes must be defined in order to use getChildContext().",
            On
          );
          var Dr = le.state !== void 0 ? le.state : null;
          le.updater = ks, le.props = U, le.state = Dr;
          var Vn = { queue: [], replace: !1 };
          le._reactInternals = Vn;
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
          var pr = h.getDerivedStateFromProps;
          if (typeof pr == "function") {
            var er = pr(
              U,
              Dr
            );
            if (er === void 0) {
              var st = dn(h) || "Component";
              Zo.has(st) || (Zo.add(st), console.error(
                "%s.getDerivedStateFromProps(): A valid state object (or null) must be returned. You have returned undefined.",
                st
              ));
            }
            var Jt = er == null ? Dr : qn({}, Dr, er);
            le.state = Jt;
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
            )), Vn.queue !== null && 0 < Vn.queue.length) {
              var nr = Vn.queue, Tt = Vn.replace;
              if (Vn.queue = null, Vn.replace = !1, Tt && nr.length === 1)
                le.state = nr[0];
              else {
                for (var Lr = Tt ? nr[0] : le.state, sl = !0, Nr = Tt ? 1 : 0; Nr < nr.length; Nr++) {
                  var na = nr[Nr], fl = typeof na == "function" ? na.call(
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
            } else Vn.queue = null;
          }
          var Ut = Fn(le);
          if (e.status === 12) throw null;
          le.props !== U && (ol || console.error(
            "It looks like %s is reassigning its own `this.props` while rendering. This is not supported and can lead to confusing bugs.",
            dn(h) || "a component"
          ), ol = !0);
          var zl = t.keyPath;
          t.keyPath = c, Gr(e, t, Ut, -1), t.keyPath = zl;
        } else {
          if (h.prototype && typeof h.prototype.render == "function") {
            var cr = dn(h) || "Unknown";
            yr[cr] || (console.error(
              "The <%s /> component appears to have a render method, but doesn't extend React.Component. This is likely to cause errors. Change %s to extend React.Component instead.",
              cr,
              cr
            ), yr[cr] = !0);
          }
          var Vu = It(
            e,
            t,
            c,
            h,
            b,
            void 0
          );
          if (e.status === 12) throw null;
          var Fi = zt !== 0, Ft = _c, Hl = pu;
          if (h.contextTypes) {
            var zr = dn(h) || "Unknown";
            ct[zr] || (ct[zr] = !0, console.error(
              "%s uses the legacy contextTypes API which was removed in React 19. Use React.createContext() with React.useContext() instead. (https://react.dev/link/legacy-context)",
              zr
            ));
          }
          if (h && h.childContextTypes && console.error(
            `childContextTypes cannot be defined on a function component.
  %s.childContextTypes = ...`,
            h.displayName || h.name || "Component"
          ), typeof h.getDerivedStateFromProps == "function") {
            var Dc = dn(h) || "Unknown";
            Jo[Dc] || (console.error(
              "%s: Function components do not support getDerivedStateFromProps.",
              Dc
            ), Jo[Dc] = !0);
          }
          if (typeof h.contextType == "object" && h.contextType !== null) {
            var Ko = dn(h) || "Unknown";
            al[Ko] || (console.error(
              "%s: Function components do not support contextType.",
              Ko
            ), al[Ko] = !0);
          }
          Bi(
            e,
            t,
            c,
            Vu,
            Fi,
            Ft,
            Hl
          );
        }
      else if (typeof h == "string") {
        var ci = t.blockedSegment;
        if (ci === null) {
          var jo = b.children, hl = t.formatContext, Lc = t.keyPath;
          t.formatContext = pe(hl, h, b), t.keyPath = c, jt(e, t, jo, -1), t.formatContext = hl, t.keyPath = Lc;
        } else {
          var Qu = rc(
            ci.chunks,
            h,
            b,
            e.resumableState,
            e.renderState,
            t.blockedPreamble,
            t.hoistableState,
            t.formatContext,
            ci.lastPushedText
          );
          ci.lastPushedText = !1;
          var Bl = t.formatContext, Nc = t.keyPath;
          if (t.keyPath = c, (t.formatContext = pe(
            Bl,
            h,
            b
          )).insertionMode === Ec) {
            var Hr = Li(
              e,
              0,
              null,
              t.formatContext,
              !1,
              !1
            );
            ci.preambleChildren.push(Hr), t.blockedSegment = Hr;
            try {
              Hr.status = 6, jt(e, t, Qu, -1), Hr.lastPushedText && Hr.textEmbedded && Hr.chunks.push(Lt), Hr.status = Un, ei(e, t.blockedBoundary, Hr);
            } finally {
              t.blockedSegment = ci;
            }
          } else jt(e, t, Qu, -1);
          t.formatContext = Bl, t.keyPath = Nc;
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
                if (Bl.insertionMode <= wa) {
                  go.hasBody = !0;
                  break e;
                }
                break;
              case "html":
                if (Bl.insertionMode === Do) {
                  go.hasHtml = !0;
                  break e;
                }
                break;
              case "head":
                if (Bl.insertionMode <= wa) break e;
            }
            qo.push(ht(h));
          }
          ci.lastPushedText = !1;
        }
      } else {
        switch (h) {
          case Rs:
          case pc:
          case wc:
          case Yi:
            var Fa = t.keyPath;
            t.keyPath = c, Gr(e, t, b.children, -1), t.keyPath = Fa;
            return;
          case lr:
            var Ul = t.blockedSegment;
            if (Ul === null) {
              if (b.mode !== "hidden") {
                var Wl = t.keyPath;
                t.keyPath = c, jt(e, t, b.children, -1), t.keyPath = Wl;
              }
            } else if (b.mode !== "hidden") {
              Ul.chunks.push(Wu), Ul.lastPushedText = !1;
              var Oi = t.keyPath;
              t.keyPath = c, jt(e, t, b.children, -1), t.keyPath = Oi, Ul.chunks.push(ou), Ul.lastPushedText = !1;
            }
            return;
          case Ga:
            e: {
              var dl = b.children, wr = b.revealOrder;
              if (wr === "forwards" || wr === "backwards" || wr === "unstable_legacy-backwards") {
                if (xi(dl)) {
                  Hi(
                    e,
                    t,
                    c,
                    dl,
                    wr
                  );
                  break e;
                }
                var Oa = W(dl);
                if (Oa) {
                  var _i = Oa.call(dl);
                  if (_i) {
                    Ua(
                      t,
                      dl,
                      -1,
                      _i,
                      Oa
                    );
                    var vo = _i.next();
                    if (!vo.done) {
                      var ta = [];
                      do
                        ta.push(vo.value), vo = _i.next();
                      while (!vo.done);
                      Hi(
                        e,
                        t,
                        c,
                        dl,
                        wr
                      );
                    }
                    break e;
                  }
                }
              }
              if (wr === "together") {
                var ps = t.keyPath, Kr = t.row, ui = t.row = wi(null);
                ui.boundaries = [], ui.together = !0, t.keyPath = c, Gr(e, t, dl, -1), --ui.pendingTasks === 0 && Vt(e, ui), t.keyPath = ps, t.row = Kr, Kr !== null && 0 < ui.pendingTasks && (Kr.pendingTasks++, ui.next = Kr);
              } else {
                var zc = t.keyPath;
                t.keyPath = c, Gr(e, t, dl, -1), t.keyPath = zc;
              }
            }
            return;
          case is:
          case Iu:
            throw Error(
              "ReactDOMServer does not yet support scope components."
            );
          case va:
            e: if (t.replay !== null) {
              var wu = t.keyPath, Tu = t.formatContext, Xs = t.row;
              t.keyPath = c, t.formatContext = Ne(
                e.resumableState,
                Tu
              ), t.row = null;
              var bo = b.children;
              try {
                jt(e, t, bo, -1);
              } finally {
                t.keyPath = wu, t.formatContext = Tu, t.row = Xs;
              }
            } else {
              var $o = t.keyPath, yo = t.formatContext, xu = t.row, Ls = t.blockedBoundary, Ss = t.blockedPreamble, jr = t.hoistableState, Mi = t.blockedSegment, po = b.fallback, Ju = b.children, Yl = /* @__PURE__ */ new Set(), Wt = t.formatContext.insertionMode < mr ? Di(
                e,
                t.row,
                Yl,
                he(),
                he()
              ) : Di(
                e,
                t.row,
                Yl,
                null,
                null
              );
              e.trackedPostpones !== null && (Wt.trackedContentKeyPath = c);
              var xt = Li(
                e,
                Mi.chunks.length,
                Wt,
                t.formatContext,
                !1,
                !1
              );
              Mi.children.push(xt), Mi.lastPushedText = !1;
              var et = Li(
                e,
                0,
                null,
                t.formatContext,
                !1,
                !1
              );
              if (et.parentFlushed = !0, e.trackedPostpones !== null) {
                var Ps = t.componentStack, ec = [
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
                  yo
                ), t.componentStack = Po(
                  Ps
                ), xt.status = 6;
                try {
                  jt(e, t, po, -1), xt.lastPushedText && xt.textEmbedded && xt.chunks.push(Lt), xt.status = Un, ei(e, Ls, xt);
                } catch (Vs) {
                  throw xt.status = e.status === 12 ? wt : wn, Vs;
                } finally {
                  t.blockedSegment = Mi, t.blockedPreamble = Ss, t.keyPath = $o, t.formatContext = yo;
                }
                var nc = jl(
                  e,
                  null,
                  Ju,
                  -1,
                  Wt,
                  et,
                  Wt.contentPreamble,
                  Wt.contentState,
                  t.abortSet,
                  c,
                  Ne(
                    e.resumableState,
                    t.formatContext
                  ),
                  t.context,
                  t.treeContext,
                  null,
                  Ps,
                  kl,
                  t.debugTask
                );
                zi(nc), e.pingedTasks.push(nc);
              } else {
                t.blockedBoundary = Wt, t.blockedPreamble = Wt.contentPreamble, t.hoistableState = Wt.contentState, t.blockedSegment = et, t.keyPath = c, t.formatContext = Ne(
                  e.resumableState,
                  yo
                ), t.row = null, et.status = 6;
                try {
                  if (jt(e, t, Ju, -1), et.lastPushedText && et.textEmbedded && et.chunks.push(Lt), et.status = Un, ei(e, Wt, et), _o(Wt, et), Wt.pendingTasks === 0 && Wt.status === Bn) {
                    if (Wt.status = Un, !Wr(e, Wt)) {
                      xu !== null && --xu.pendingTasks === 0 && Vt(e, xu), e.pendingRootTasks === 0 && t.blockedPreamble && Ya(e);
                      break e;
                    }
                  } else
                    xu !== null && xu.together && Ha(e, xu);
                } catch (Vs) {
                  if (Wt.status = _e, e.status === 12) {
                    et.status = wt;
                    var Hc = e.fatalError;
                  } else
                    et.status = wn, Hc = Vs;
                  var ju = $e(t.componentStack), Bc = Mt(
                    e,
                    Hc,
                    ju,
                    t.debugTask
                  );
                  ql(
                    Wt,
                    Bc,
                    Hc,
                    ju,
                    !1
                  ), Ao(e, Wt);
                } finally {
                  t.blockedBoundary = Ls, t.blockedPreamble = Ss, t.hoistableState = jr, t.blockedSegment = Mi, t.keyPath = $o, t.formatContext = yo, t.row = xu;
                }
                var Eu = jl(
                  e,
                  null,
                  po,
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
                  Po(
                    t.componentStack
                  ),
                  kl,
                  t.debugTask
                );
                zi(Eu), e.pingedTasks.push(Eu);
              }
            }
            return;
        }
        if (typeof h == "object" && h !== null)
          switch (h.$$typeof) {
            case kn:
              if ("ref" in b) {
                var Ru = {};
                for (var ws in b)
                  ws !== "ref" && (Ru[ws] = b[ws]);
              } else Ru = b;
              var As = It(
                e,
                t,
                c,
                h.render,
                Ru,
                x
              );
              Bi(
                e,
                t,
                c,
                As,
                zt !== 0,
                _c,
                pu
              );
              return;
            case Xa:
              Ui(e, t, c, h.type, b, x);
              return;
            case it:
              var Ns = b.value, qu = b.children, $u = t.context, Uc = t.keyPath, wo = h._currentValue;
              h._currentValue = Ns, h._currentRenderer !== void 0 && h._currentRenderer !== null && h._currentRenderer !== Pa && console.error(
                "Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported."
              ), h._currentRenderer = Pa;
              var _a = qi, gl = {
                parent: _a,
                depth: _a === null ? 0 : _a.depth + 1,
                context: h,
                parentValue: wo,
                value: Ns
              };
              qi = gl, t.context = gl, t.keyPath = c, Gr(e, t, qu, -1);
              var Cu = qi;
              if (Cu === null)
                throw Error(
                  "Tried to pop a Context at the root of the app. This is a bug in React."
                );
              Cu.context !== h && console.error(
                "The parent context is not the expected context. This is probably a bug in React."
              ), Cu.context._currentValue = Cu.parentValue, h._currentRenderer !== void 0 && h._currentRenderer !== null && h._currentRenderer !== Pa && console.error(
                "Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported."
              ), h._currentRenderer = Pa;
              var zs = qi = Cu.parent;
              t.context = zs, t.keyPath = Uc, $u !== t.context && console.error(
                "Popping the context provider did not return back to the original snapshot. This is a bug in React."
              );
              return;
            case Xr:
              var Zs = h._context, Fs = b.children;
              typeof Fs != "function" && console.error(
                "A context consumer was rendered with multiple children, or a child that isn't a function. A context consumer expects a single child that is a function. If you did pass a function, make sure there is no trailing or leading whitespace around it."
              );
              var cf = Fs(Zs._currentValue), Ts = t.keyPath;
              t.keyPath = c, Gr(e, t, cf, -1), t.keyPath = Ts;
              return;
            case ba:
              var uf = br(h);
              if (e.status === 12) throw null;
              Ui(e, t, c, uf, b, x);
              return;
          }
        var Hs = "";
        throw (h === void 0 || typeof h == "object" && h !== null && Object.keys(h).length === 0) && (Hs += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports."), Error(
          "Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: " + ((h == null ? h : typeof h) + "." + Hs)
        );
      }
    }
    function Ba(e, t, c, h, b) {
      var x = t.replay, S = t.blockedBoundary, _ = Li(
        e,
        0,
        null,
        t.formatContext,
        !1,
        !1
      );
      _.id = c, _.parentFlushed = !0;
      try {
        t.replay = null, t.blockedSegment = _, jt(e, t, h, b), _.status = Un, ei(e, S, _), S === null ? e.completedRootSegment = _ : (_o(S, _), S.parentFlushed && e.partialBoundaries.push(S));
      } finally {
        t.replay = x, t.blockedSegment = null;
      }
    }
    function sa(e, t, c, h, b, x, S, _, J, N) {
      x = N.nodes;
      for (var U = 0; U < x.length; U++) {
        var oe = x[U];
        if (b === oe[1]) {
          if (oe.length === 4) {
            if (h !== null && h !== oe[0])
              throw Error(
                "Expected the resume to render <" + oe[0] + "> in this slot but instead it rendered <" + h + ">. The tree doesn't match so React will fallback to client rendering."
              );
            var se = oe[2];
            h = oe[3], b = t.node, t.replay = { nodes: se, slots: h, pendingTasks: 1 };
            try {
              if (Ui(e, t, c, S, _, J), t.replay.pendingTasks === 1 && 0 < t.replay.nodes.length)
                throw Error(
                  "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                );
              t.replay.pendingTasks--;
            } catch (Le) {
              if (typeof Le == "object" && Le !== null && (Le === mi || typeof Le.then == "function"))
                throw t.node === b ? t.replay = N : x.splice(U, 1), Le;
              t.replay.pendingTasks--, S = $e(t.componentStack), _ = e, e = t.blockedBoundary, c = Le, J = h, h = Mt(_, c, S, t.debugTask), fa(
                _,
                e,
                se,
                J,
                c,
                h,
                S,
                !1
              );
            }
            t.replay = N;
          } else {
            if (S !== va)
              throw Error(
                "Expected the resume to render <Suspense> in this slot but instead it rendered <" + (dn(S) || "Unknown") + ">. The tree doesn't match so React will fallback to client rendering."
              );
            e: {
              N = void 0, h = oe[5], S = oe[2], J = oe[3], b = oe[4] === null ? [] : oe[4][2], oe = oe[4] === null ? null : oe[4][3];
              var ue = t.keyPath, le = t.formatContext, Ue = t.row, Zn = t.replay, ze = t.blockedBoundary, hn = t.hoistableState, At = _.children, Ht = _.fallback, On = /* @__PURE__ */ new Set();
              _ = t.formatContext.insertionMode < mr ? Di(
                e,
                t.row,
                On,
                he(),
                he()
              ) : Di(
                e,
                t.row,
                On,
                null,
                null
              ), _.parentFlushed = !0, _.rootSegmentID = h, t.blockedBoundary = _, t.hoistableState = _.contentState, t.keyPath = c, t.formatContext = Ne(
                e.resumableState,
                le
              ), t.row = null, t.replay = { nodes: S, slots: J, pendingTasks: 1 };
              try {
                if (jt(e, t, At, -1), t.replay.pendingTasks === 1 && 0 < t.replay.nodes.length)
                  throw Error(
                    "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                  );
                if (t.replay.pendingTasks--, _.pendingTasks === 0 && _.status === Bn) {
                  _.status = Un, e.completedBoundaries.push(_);
                  break e;
                }
              } catch (Le) {
                _.status = _e, se = $e(t.componentStack), N = Mt(
                  e,
                  Le,
                  se,
                  t.debugTask
                ), ql(_, N, Le, se, !1), t.replay.pendingTasks--, e.clientRenderedBoundaries.push(_);
              } finally {
                t.blockedBoundary = ze, t.hoistableState = hn, t.replay = Zn, t.keyPath = ue, t.formatContext = le, t.row = Ue;
              }
              _ = Au(
                e,
                null,
                { nodes: b, slots: oe, pendingTasks: 0 },
                Ht,
                -1,
                ze,
                _.fallbackState,
                On,
                [c[0], "Suspense Fallback", c[2]],
                me(
                  e.resumableState,
                  t.formatContext
                ),
                t.context,
                t.treeContext,
                t.row,
                Po(
                  t.componentStack
                ),
                kl,
                t.debugTask
              ), zi(_), e.pingedTasks.push(_);
            }
          }
          x.splice(U, 1);
          break;
        }
      }
    }
    function Ua(e, t, c, h, b) {
      h === t ? (c !== -1 || e.componentStack === null || typeof e.componentStack.type != "function" || Object.prototype.toString.call(e.componentStack.type) !== "[object GeneratorFunction]" || Object.prototype.toString.call(h) !== "[object Generator]") && (Si || console.error(
        "Using Iterators as children is unsupported and will likely yield unexpected results because enumerating a generator mutates it. You may convert it to an array with `Array.from()` or the `[...spread]` operator before rendering. You can also use an Iterable that can iterate multiple times over the same items."
      ), Si = !0) : t.entries !== b || Pi || (console.error(
        "Using Maps as children is not supported. Use an array of keyed ReactElements instead."
      ), Pi = !0);
    }
    function Gr(e, t, c, h) {
      t.replay !== null && typeof t.replay.slots == "number" ? Ba(e, t, t.replay.slots, c, h) : (t.node = c, t.childIndex = h, c = t.componentStack, h = t.debugTask, zi(t), Wa(e, t), t.componentStack = c, t.debugTask = h);
    }
    function Wa(e, t) {
      var c = t.node, h = t.childIndex;
      if (c !== null) {
        if (typeof c == "object") {
          switch (c.$$typeof) {
            case jc:
              var b = c.type, x = c.key;
              c = c.props;
              var S = c.ref;
              S = S !== void 0 ? S : null;
              var _ = t.debugTask, J = dn(b);
              x = x ?? (h === -1 ? 0 : h);
              var N = [t.keyPath, J, x];
              t.replay !== null ? _ ? _.run(
                sa.bind(
                  null,
                  e,
                  t,
                  N,
                  J,
                  x,
                  h,
                  b,
                  c,
                  S,
                  t.replay
                )
              ) : sa(
                e,
                t,
                N,
                J,
                x,
                h,
                b,
                c,
                S,
                t.replay
              ) : _ ? _.run(
                Ui.bind(
                  null,
                  e,
                  t,
                  N,
                  b,
                  c,
                  S
                )
              ) : Ui(e, t, N, b, c, S);
              return;
            case yc:
              throw Error(
                "Portals are not currently supported by the server renderer. Render them conditionally so that they only appear on the client render."
              );
            case ba:
              if (b = br(c), e.status === 12) throw null;
              Gr(e, t, b, h);
              return;
          }
          if (xi(c)) {
            Fu(e, t, c, h);
            return;
          }
          if ((x = W(c)) && (b = x.call(c))) {
            if (Ua(t, c, h, b, x), c = b.next(), !c.done) {
              x = [];
              do
                x.push(c.value), c = b.next();
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
      if (c !== null && typeof c == "object" && (c.$$typeof === jc || c.$$typeof === yc) && c._store && (!c._store.validated && c.key == null || c._store.validated === 2)) {
        if (typeof c._store != "object")
          throw Error(
            "React Component in warnForMissingKey should have a _store. This error is likely caused by a bug in React. Please file an issue."
          );
        c._store.validated = 1;
        var h = e.didWarnForKey;
        if (h == null && (h = e.didWarnForKey = /* @__PURE__ */ new WeakSet()), e = t.componentStack, e !== null && !h.has(e)) {
          h.add(e);
          var b = dn(c.type);
          h = c._owner;
          var x = e.owner;
          if (e = "", x && typeof x.type < "u") {
            var S = dn(x.type);
            S && (e = `

Check the render method of \`` + S + "`.");
          }
          e || b && (e = `

Check the top-level render call using <` + b + ">."), b = "", h != null && x !== h && (x = null, typeof h.type < "u" ? x = dn(h.type) : typeof h.name == "string" && (x = h.name), x && (b = " It was passed a child from " + x + ".")), h = t.componentStack, t.componentStack = {
            parent: t.componentStack,
            type: c.type,
            owner: c._owner,
            stack: c._debugStack
          }, console.error(
            'Each child in a list should have a unique "key" prop.%s%s See https://react.dev/link/warning-keys for more information.',
            e,
            b
          ), t.componentStack = h;
        }
      }
    }
    function Fu(e, t, c, h) {
      var b = t.keyPath, x = t.componentStack, S = t.debugTask;
      if (Ni(t, t.node._debugInfo), h !== -1 && (t.keyPath = [t.keyPath, "Fragment", h], t.replay !== null)) {
        for (var _ = t.replay, J = _.nodes, N = 0; N < J.length; N++) {
          var U = J[N];
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
              var se = le, ue = U;
              U = Mt(
                e,
                se,
                oe,
                t.debugTask
              ), fa(
                e,
                c,
                h,
                ue,
                se,
                U,
                oe,
                !1
              );
            }
            t.replay = _, J.splice(N, 1);
            break;
          }
        }
        t.keyPath = b, t.componentStack = x, t.debugTask = S;
        return;
      }
      if (_ = t.treeContext, J = c.length, t.replay !== null && (N = t.replay.slots, N !== null && typeof N == "object")) {
        for (h = 0; h < J; h++)
          U = c[h], t.treeContext = Na(
            _,
            J,
            h
          ), se = N[h], typeof se == "number" ? (Ba(e, t, se, U, h), delete N[h]) : jt(e, t, U, h);
        t.treeContext = _, t.keyPath = b, t.componentStack = x, t.debugTask = S;
        return;
      }
      for (N = 0; N < J; N++)
        h = c[N], $l(e, t, h), t.treeContext = Na(_, J, N), jt(e, t, h, N);
      t.treeContext = _, t.keyPath = b, t.componentStack = x, t.debugTask = S;
    }
    function Ou(e, t, c) {
      if (c.status = tn, c.rootSegmentID = e.nextSegmentId++, e = c.trackedContentKeyPath, e === null)
        throw Error(
          "It should not be possible to postpone at the root. This is a bug in React."
        );
      var h = c.trackedFallbackNode, b = [], x = t.workingMap.get(e);
      return x === void 0 ? (c = [
        e[1],
        e[2],
        b,
        null,
        h,
        c.rootSegmentID
      ], t.workingMap.set(e, c), El(c, e[0], t), c) : (x[4] = h, x[5] = c.rootSegmentID, x);
    }
    function _u(e, t, c, h) {
      h.status = tn;
      var b = c.keyPath, x = c.blockedBoundary;
      if (x === null)
        h.id = e.nextSegmentId++, t.rootSlots = h.id, e.completedRootSegment !== null && (e.completedRootSegment.status = tn);
      else {
        if (x !== null && x.status === Bn) {
          var S = Ou(
            e,
            t,
            x
          );
          if (x.trackedContentKeyPath === b && c.childIndex === -1) {
            h.id === -1 && (h.id = h.parentFlushed ? x.rootSegmentID : e.nextSegmentId++), S[3] = h.id;
            return;
          }
        }
        if (h.id === -1 && (h.id = h.parentFlushed && x !== null ? x.rootSegmentID : e.nextSegmentId++), c.childIndex === -1)
          b === null ? t.rootSlots = h.id : (c = t.workingMap.get(b), c === void 0 ? (c = [b[1], b[2], [], h.id], El(c, b[0], t)) : c[3] = h.id);
        else {
          if (b === null) {
            if (e = t.rootSlots, e === null)
              e = t.rootSlots = {};
            else if (typeof e == "number")
              throw Error(
                "It should not be possible to postpone both at the root of an element as well as a slot below. This is a bug in React."
              );
          } else if (x = t.workingMap, S = x.get(b), S === void 0)
            e = {}, S = [b[1], b[2], [], e], x.set(b, S), El(S, b[0], t);
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
    function Ao(e, t) {
      e = e.trackedPostpones, e !== null && (t = t.trackedContentKeyPath, t !== null && (t = e.workingMap.get(t), t !== void 0 && (t.length = 4, t[2] = [], t[3] = null)));
    }
    function Fo(e, t, c) {
      return Au(
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
      var h = t.blockedSegment, b = Li(
        e,
        h.chunks.length,
        null,
        t.formatContext,
        h.lastPushedText,
        !0
      );
      return h.children.push(b), h.lastPushedText = !1, jl(
        e,
        c,
        t.node,
        t.childIndex,
        t.blockedBoundary,
        b,
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
      var b = t.formatContext, x = t.context, S = t.keyPath, _ = t.treeContext, J = t.componentStack, N = t.debugTask, U = t.blockedSegment;
      if (U === null) {
        U = t.replay;
        try {
          return Gr(e, t, c, h);
        } catch (ue) {
          if (za(), c = ue === mi ? ku() : ue, e.status !== 12 && typeof c == "object" && c !== null) {
            if (typeof c.then == "function") {
              h = ue === mi ? pl() : null, e = Fo(
                e,
                t,
                h
              ).ping, c.then(e, e), t.formatContext = b, t.context = x, t.keyPath = S, t.treeContext = _, t.componentStack = J, t.replay = U, t.debugTask = N, mn(x);
              return;
            }
            if (c.message === "Maximum call stack size exceeded") {
              c = ue === mi ? pl() : null, c = Fo(e, t, c), e.pingedTasks.push(c), t.formatContext = b, t.context = x, t.keyPath = S, t.treeContext = _, t.componentStack = J, t.replay = U, t.debugTask = N, mn(x);
              return;
            }
          }
        }
      } else {
        var oe = U.children.length, se = U.chunks.length;
        try {
          return Gr(e, t, c, h);
        } catch (ue) {
          if (za(), U.children.length = oe, U.chunks.length = se, c = ue === mi ? ku() : ue, e.status !== 12 && typeof c == "object" && c !== null) {
            if (typeof c.then == "function") {
              U = c, c = ue === mi ? pl() : null, e = Oo(e, t, c).ping, U.then(e, e), t.formatContext = b, t.context = x, t.keyPath = S, t.treeContext = _, t.componentStack = J, t.debugTask = N, mn(x);
              return;
            }
            if (c.message === "Maximum call stack size exceeded") {
              U = ue === mi ? pl() : null, U = Oo(e, t, U), e.pingedTasks.push(U), t.formatContext = b, t.context = x, t.keyPath = S, t.treeContext = _, t.componentStack = J, t.debugTask = N, mn(x);
              return;
            }
          }
        }
      }
      throw t.formatContext = b, t.context = x, t.keyPath = S, t.treeContext = _, mn(x), c;
    }
    function ls(e) {
      var t = e.blockedBoundary, c = e.blockedSegment;
      c !== null && (c.status = wt, da(this, t, e.row, c));
    }
    function fa(e, t, c, h, b, x, S, _) {
      for (var J = 0; J < c.length; J++) {
        var N = c[J];
        if (N.length === 4)
          fa(
            e,
            t,
            N[2],
            N[3],
            b,
            x,
            S,
            _
          );
        else {
          var U = e;
          N = N[5];
          var oe = b, se = x, ue = S, le = _, Ue = Di(
            U,
            null,
            /* @__PURE__ */ new Set(),
            null,
            null
          );
          Ue.parentFlushed = !0, Ue.rootSegmentID = N, Ue.status = _e, ql(
            Ue,
            se,
            oe,
            ue,
            le
          ), Ue.parentFlushed && U.clientRenderedBoundaries.push(Ue);
        }
      }
      if (c.length = 0, h !== null) {
        if (t === null)
          throw Error(
            "We should not have any resumable nodes in the shell. This is a bug in React."
          );
        if (t.status !== _e && (t.status = _e, ql(
          t,
          x,
          b,
          S,
          _
        ), t.parentFlushed && e.clientRenderedBoundaries.push(t)), typeof h == "object")
          for (var Zn in h) delete h[Zn];
      }
    }
    function gc(e, t, c) {
      var h = e.blockedBoundary, b = e.blockedSegment;
      if (b !== null) {
        if (b.status === 6) return;
        b.status = wt;
      }
      var x = $e(e.componentStack), S = e.node;
      if (S !== null && typeof S == "object" && So(e, S._debugInfo), h === null) {
        if (t.status !== 13 && t.status !== Ir) {
          if (h = e.replay, h === null) {
            t.trackedPostpones !== null && b !== null ? (h = t.trackedPostpones, Mt(t, c, x, e.debugTask), _u(t, h, e, b), da(t, null, e.row, b)) : (Mt(t, c, x, e.debugTask), pi(t, c, x, e.debugTask));
            return;
          }
          h.pendingTasks--, h.pendingTasks === 0 && 0 < h.nodes.length && (b = Mt(t, c, x, null), fa(
            t,
            null,
            h.nodes,
            h.slots,
            c,
            b,
            x,
            !0
          )), t.pendingRootTasks--, t.pendingRootTasks === 0 && Wi(t);
        }
      } else {
        if (S = t.trackedPostpones, h.status !== _e) {
          if (S !== null && b !== null)
            return Mt(t, c, x, e.debugTask), _u(t, S, e, b), h.fallbackAbortableTasks.forEach(function(_) {
              return gc(_, t, c);
            }), h.fallbackAbortableTasks.clear(), da(t, h, e.row, b);
          h.status = _e, b = Mt(
            t,
            c,
            x,
            e.debugTask
          ), h.status = _e, ql(h, b, c, x, !0), Ao(t, h), h.parentFlushed && t.clientRenderedBoundaries.push(h);
        }
        h.pendingTasks--, x = h.row, x !== null && --x.pendingTasks === 0 && Vt(t, x), h.fallbackAbortableTasks.forEach(function(_) {
          return gc(_, t, c);
        }), h.fallbackAbortableTasks.clear();
      }
      e = e.row, e !== null && --e.pendingTasks === 0 && Vt(t, e), t.allPendingTasks--, t.allPendingTasks === 0 && ha(t);
    }
    function Vc(e, t) {
      try {
        var c = e.renderState, h = c.onHeaders;
        if (h) {
          var b = c.headers;
          if (b) {
            c.headers = null;
            var x = b.preconnects;
            if (b.fontPreloads && (x && (x += ", "), x += b.fontPreloads), b.highImagePreloads && (x && (x += ", "), x += b.highImagePreloads), !t) {
              var S = c.styles.values(), _ = S.next();
              e: for (; 0 < b.remainingCapacity && !_.done; _ = S.next())
                for (var J = _.value.sheets.values(), N = J.next(); 0 < b.remainingCapacity && !N.done; N = J.next()) {
                  var U = N.value, oe = U.props, se = oe.href, ue = U.props, le = oa(
                    ue.href,
                    "style",
                    {
                      crossOrigin: ue.crossOrigin,
                      integrity: ue.integrity,
                      nonce: ue.nonce,
                      type: ue.type,
                      fetchPriority: ue.fetchPriority,
                      referrerPolicy: ue.referrerPolicy,
                      media: ue.media
                    }
                  );
                  if (0 <= (b.remainingCapacity -= le.length + 2))
                    c.resets.style[se] = qt, x && (x += ", "), x += le, c.resets.style[se] = typeof oe.crossOrigin == "string" || typeof oe.integrity == "string" ? [oe.crossOrigin, oe.integrity] : qt;
                  else break e;
                }
            }
            h(x ? { Link: x } : {});
          }
        }
      } catch (Ue) {
        Mt(e, Ue, {}, null);
      }
    }
    function Wi(e) {
      e.trackedPostpones === null && Vc(e, !0), e.trackedPostpones === null && Ya(e), e.onShellError = Er, e = e.onShellReady, e();
    }
    function ha(e) {
      Vc(
        e,
        e.trackedPostpones === null ? !0 : e.completedRootSegment === null || e.completedRootSegment.status !== tn
      ), Ya(e), e = e.onAllReady, e();
    }
    function _o(e, t) {
      if (t.chunks.length === 0 && t.children.length === 1 && t.children[0].boundary === null && t.children[0].id === -1) {
        var c = t.children[0];
        c.id = t.id, c.parentFlushed = !0, c.status !== Un && c.status !== wt && c.status !== wn || _o(e, c);
      } else e.completedSegments.push(t);
    }
    function ei(e, t, c) {
      if (ft !== null) {
        c = c.chunks;
        for (var h = 0, b = 0; b < c.length; b++)
          h += c[b].byteLength;
        t === null ? e.byteSize += h : t.byteSize += h;
      }
    }
    function da(e, t, c, h) {
      if (c !== null && (--c.pendingTasks === 0 ? Vt(e, c) : c.together && Ha(e, c)), e.allPendingTasks--, t === null) {
        if (h !== null && h.parentFlushed) {
          if (e.completedRootSegment !== null)
            throw Error(
              "There can only be one root segment. This is a bug in React."
            );
          e.completedRootSegment = h;
        }
        e.pendingRootTasks--, e.pendingRootTasks === 0 && Wi(e);
      } else if (t.pendingTasks--, t.status !== _e)
        if (t.pendingTasks === 0) {
          if (t.status === Bn && (t.status = Un), h !== null && h.parentFlushed && (h.status === Un || h.status === wt) && _o(t, h), t.parentFlushed && e.completedBoundaries.push(t), t.status === Un)
            c = t.row, c !== null && Cn(c.hoistables, t.contentState), Wr(e, t) || (t.fallbackAbortableTasks.forEach(
              ls,
              e
            ), t.fallbackAbortableTasks.clear(), c !== null && --c.pendingTasks === 0 && Vt(e, c)), e.pendingRootTasks === 0 && e.trackedPostpones === null && t.contentPreamble !== null && Ya(e);
          else if (t.status === tn && (t = t.row, t !== null)) {
            if (e.trackedPostpones !== null) {
              c = e.trackedPostpones;
              var b = t.next;
              if (b !== null && (h = b.boundaries, h !== null))
                for (b.boundaries = null, b = 0; b < h.length; b++) {
                  var x = h[b];
                  Ou(e, c, x), da(e, x, null, null);
                }
            }
            --t.pendingTasks === 0 && Vt(e, t);
          }
        } else
          h === null || !h.parentFlushed || h.status !== Un && h.status !== wt || (_o(t, h), t.completedSegments.length === 1 && t.parentFlushed && e.partialBoundaries.push(t)), t = t.row, t !== null && t.together && Ha(e, t);
      e.allPendingTasks === 0 && ha(e);
    }
    function ga(e) {
      if (e.status !== Ir && e.status !== 13) {
        var t = qi, c = cn.H;
        cn.H = Ic;
        var h = cn.A;
        cn.A = u;
        var b = Wn;
        Wn = e;
        var x = cn.getCurrentStack;
        cn.getCurrentStack = yi;
        var S = n;
        n = e.resumableState;
        try {
          var _ = e.pingedTasks, J;
          for (J = 0; J < _.length; J++) {
            var N = e, U = _[J], oe = U.blockedSegment;
            if (oe === null) {
              var se = void 0, ue = N;
              if (N = U, N.replay.pendingTasks !== 0) {
                mn(N.context), se = r, r = N;
                try {
                  if (typeof N.replay.slots == "number" ? Ba(
                    ue,
                    N,
                    N.replay.slots,
                    N.node,
                    N.childIndex
                  ) : Wa(ue, N), N.replay.pendingTasks === 1 && 0 < N.replay.nodes.length)
                    throw Error(
                      "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                    );
                  N.replay.pendingTasks--, N.abortSet.delete(N), da(
                    ue,
                    N.blockedBoundary,
                    N.row,
                    null
                  );
                } catch (Tt) {
                  za();
                  var le = Tt === mi ? ku() : Tt;
                  if (typeof le == "object" && le !== null && typeof le.then == "function") {
                    var Ue = N.ping;
                    le.then(Ue, Ue), N.thenableState = Tt === mi ? pl() : null;
                  } else {
                    N.replay.pendingTasks--, N.abortSet.delete(N);
                    var Zn = $e(N.componentStack), ze = void 0, hn = ue, At = N.blockedBoundary, Ht = ue.status === 12 ? ue.fatalError : le, On = Zn, Le = N.replay.nodes, Bt = N.replay.slots;
                    ze = Mt(
                      hn,
                      Ht,
                      On,
                      N.debugTask
                    ), fa(
                      hn,
                      At,
                      Le,
                      Bt,
                      Ht,
                      ze,
                      On,
                      !1
                    ), ue.pendingRootTasks--, ue.pendingRootTasks === 0 && Wi(ue), ue.allPendingTasks--, ue.allPendingTasks === 0 && ha(ue);
                  }
                } finally {
                  r = se;
                }
              }
            } else if (ue = se = void 0, ze = U, hn = oe, hn.status === Bn) {
              hn.status = 6, mn(ze.context), ue = r, r = ze;
              var Dr = hn.children.length, Vn = hn.chunks.length;
              try {
                Wa(N, ze), hn.lastPushedText && hn.textEmbedded && hn.chunks.push(Lt), ze.abortSet.delete(ze), hn.status = Un, ei(
                  N,
                  ze.blockedBoundary,
                  hn
                ), da(
                  N,
                  ze.blockedBoundary,
                  ze.row,
                  hn
                );
              } catch (Tt) {
                za(), hn.children.length = Dr, hn.chunks.length = Vn;
                var ut = Tt === mi ? ku() : N.status === 12 ? N.fatalError : Tt;
                if (N.status === 12 && N.trackedPostpones !== null) {
                  var cl = N.trackedPostpones, pr = $e(ze.componentStack);
                  ze.abortSet.delete(ze), Mt(
                    N,
                    ut,
                    pr,
                    ze.debugTask
                  ), _u(
                    N,
                    cl,
                    ze,
                    hn
                  ), da(
                    N,
                    ze.blockedBoundary,
                    ze.row,
                    hn
                  );
                } else if (typeof ut == "object" && ut !== null && typeof ut.then == "function") {
                  hn.status = Bn, ze.thenableState = Tt === mi ? pl() : null;
                  var er = ze.ping;
                  ut.then(er, er);
                } else {
                  var st = $e(
                    ze.componentStack
                  );
                  ze.abortSet.delete(ze), hn.status = wn;
                  var Jt = ze.blockedBoundary, ul = ze.row, Sl = ze.debugTask;
                  if (ul !== null && --ul.pendingTasks === 0 && Vt(N, ul), N.allPendingTasks--, se = Mt(
                    N,
                    ut,
                    st,
                    Sl
                  ), Jt === null)
                    pi(
                      N,
                      ut,
                      st,
                      Sl
                    );
                  else if (Jt.pendingTasks--, Jt.status !== _e) {
                    Jt.status = _e, ql(
                      Jt,
                      se,
                      ut,
                      st,
                      !1
                    ), Ao(N, Jt);
                    var nr = Jt.row;
                    nr !== null && --nr.pendingTasks === 0 && Vt(N, nr), Jt.parentFlushed && N.clientRenderedBoundaries.push(Jt), N.pendingRootTasks === 0 && N.trackedPostpones === null && Jt.contentPreamble !== null && Ya(N);
                  }
                  N.allPendingTasks === 0 && ha(N);
                }
              } finally {
                r = ue;
              }
            }
          }
          _.splice(0, J), e.destination !== null && wl(
            e,
            e.destination
          );
        } catch (Tt) {
          _ = {}, Mt(e, Tt, _, null), pi(e, Tt, _, null);
        } finally {
          n = S, cn.H = c, cn.A = h, cn.getCurrentStack = x, c === Ic && mn(t), Wn = b;
        }
      }
    }
    function Mu(e, t, c) {
      t.preambleChildren.length && c.push(t.preambleChildren);
      for (var h = !1, b = 0; b < t.children.length; b++)
        h = Es(
          e,
          t.children[b],
          c
        ) || h;
      return h;
    }
    function Es(e, t, c) {
      var h = t.boundary;
      if (h === null)
        return Mu(
          e,
          t,
          c
        );
      var b = h.contentPreamble, x = h.fallbackPreamble;
      if (b === null || x === null) return !1;
      switch (h.status) {
        case Un:
          if (To(e.renderState, b), e.byteSize += h.byteSize, t = h.completedSegments[0], !t)
            throw Error(
              "A previously unvisited boundary must have exactly one root segment. This is a bug in React."
            );
          return Mu(
            e,
            t,
            c
          );
        case tn:
          if (e.trackedPostpones !== null) return !0;
        case _e:
          if (t.status === Un)
            return To(e.renderState, x), Mu(
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
        ), b = e.renderState.preamble;
        h === !1 || b.headChunks && b.bodyChunks ? e.completedPreambleSegments = t : e.byteSize = c;
      }
    }
    function Dt(e, t, c, h) {
      switch (c.parentFlushed = !0, c.status) {
        case Bn:
          c.id = e.nextSegmentId++;
        case tn:
          return h = c.id, c.lastPushedText = !1, c.textEmbedded = !1, e = e.renderState, A(t, Ac), A(t, e.placeholderPrefix), e = ee(h.toString(16)), A(t, e), D(t, au);
        case Un:
          c.status = Xn;
          var b = !0, x = c.chunks, S = 0;
          c = c.children;
          for (var _ = 0; _ < c.length; _++) {
            for (b = c[_]; S < b.index; S++)
              A(t, x[S]);
            b = Ti(e, t, b, h);
          }
          for (; S < x.length - 1; S++)
            A(t, x[S]);
          return S < x.length && (b = D(t, x[S])), b;
        case wt:
          return !0;
        default:
          throw Error(
            "Aborted, errored or already flushed boundaries should not be flushed again. This is a bug in React."
          );
      }
    }
    function Ti(e, t, c, h) {
      var b = c.boundary;
      if (b === null)
        return Dt(e, t, c, h);
      if (b.parentFlushed = !0, b.status === _e) {
        var x = b.row;
        x !== null && --x.pendingTasks === 0 && Vt(e, x), x = b.errorDigest;
        var S = b.errorMessage, _ = b.errorStack;
        b = b.errorComponentStack, D(t, cs), A(t, Fc), x && (A(t, Ho), A(t, ee(Pe(x))), A(
          t,
          ri
        )), S && (A(t, Ca), A(
          t,
          ee(Pe(S))
        ), A(
          t,
          ri
        )), _ && (A(t, Oc), A(
          t,
          ee(Pe(_))
        ), A(
          t,
          ri
        )), b && (A(t, ma), A(
          t,
          ee(Pe(b))
        ), A(
          t,
          ri
        )), D(t, us), Dt(e, t, c, h);
      } else if (b.status !== Un)
        b.status === Bn && (b.rootSegmentID = e.nextSegmentId++), 0 < b.completedSegments.length && e.partialBoundaries.push(b), el(
          t,
          e.renderState,
          b.rootSegmentID
        ), h && Cn(h, b.fallbackState), Dt(e, t, c, h);
      else if (!or && Wr(e, b) && (Ai + b.byteSize > e.progressiveChunkSize || es(b.contentState)))
        b.rootSegmentID = e.nextSegmentId++, e.completedBoundaries.push(b), el(
          t,
          e.renderState,
          b.rootSegmentID
        ), Dt(e, t, c, h);
      else {
        if (Ai += b.byteSize, h && Cn(h, b.contentState), c = b.row, c !== null && Wr(e, b) && --c.pendingTasks === 0 && Vt(e, c), D(t, cu), c = b.completedSegments, c.length !== 1)
          throw Error(
            "A previously unvisited boundary must have exactly one root segment. This is a bug in React."
          );
        Ti(e, t, c[0], h);
      }
      return D(t, to);
    }
    function vc(e, t, c, h) {
      return aa(
        t,
        e.renderState,
        c.parentFormatContext,
        c.id
      ), Ti(e, t, c, h), fi(t, c.parentFormatContext);
    }
    function bc(e, t, c) {
      Ai = c.byteSize;
      for (var h = c.completedSegments, b = 0; b < h.length; b++)
        Qc(
          e,
          t,
          c,
          h[b]
        );
      h.length = 0, h = c.row, h !== null && Wr(e, c) && --h.pendingTasks === 0 && Vt(e, h), L(
        t,
        c.contentState,
        e.renderState
      ), h = e.resumableState, e = e.renderState, b = c.rootSegmentID, c = c.contentState;
      var x = e.stylesToHoist;
      return e.stylesToHoist = !1, A(t, e.startInlineScript), A(t, bt), x ? ((h.instructions & In) === vt && (h.instructions |= In, A(t, Ar)), (h.instructions & Rr) === vt && (h.instructions |= Rr, A(t, Ve)), (h.instructions & En) === vt ? (h.instructions |= En, A(
        t,
        yt
      )) : A(t, $n)) : ((h.instructions & Rr) === vt && (h.instructions |= Rr, A(t, Ve)), A(t, yn)), h = ee(b.toString(16)), A(t, e.boundaryPrefix), A(t, h), A(t, gr), A(t, e.segmentPrefix), A(t, h), x ? (A(t, ll), We(t, c)) : A(t, Il), c = D(t, Qe), xo(t, e) && c;
    }
    function Qc(e, t, c, h) {
      if (h.status === Xn) return !0;
      var b = c.contentState, x = h.id;
      if (x === -1) {
        if ((h.id = c.rootSegmentID) === -1)
          throw Error(
            "A root segment ID must have been assigned by now. This is a bug in React."
          );
        return vc(
          e,
          t,
          h,
          b
        );
      }
      return x === c.rootSegmentID ? vc(
        e,
        t,
        h,
        b
      ) : (vc(e, t, h, b), c = e.resumableState, e = e.renderState, A(t, e.startInlineScript), A(t, bt), (c.instructions & Sn) === vt ? (c.instructions |= Sn, A(t, K)) : A(t, xe), A(t, e.segmentPrefix), x = ee(x.toString(16)), A(t, x), A(t, we), A(t, e.placeholderPrefix), A(t, x), t = D(t, bn), t);
    }
    function wl(e, t) {
      hr = new Uint8Array(2048), ir = 0;
      try {
        if (!(0 < e.pendingRootTasks)) {
          var c, h = e.completedRootSegment;
          if (h !== null) {
            if (h.status === tn) return;
            var b = e.completedPreambleSegments;
            if (b === null) return;
            Ai = e.byteSize;
            var x = e.resumableState, S = e.renderState, _ = S.preamble, J = _.htmlChunks, N = _.headChunks, U;
            if (J) {
              for (U = 0; U < J.length; U++)
                A(t, J[U]);
              if (N)
                for (U = 0; U < N.length; U++)
                  A(t, N[U]);
              else
                A(t, Nn("head")), A(t, bt);
            } else if (N)
              for (U = 0; U < N.length; U++)
                A(t, N[U]);
            var oe = S.charsetChunks;
            for (U = 0; U < oe.length; U++)
              A(t, oe[U]);
            oe.length = 0, S.preconnects.forEach(ne, t), S.preconnects.clear();
            var se = S.viewportChunks;
            for (U = 0; U < se.length; U++)
              A(t, se[U]);
            se.length = 0, S.fontPreloads.forEach(ne, t), S.fontPreloads.clear(), S.highImagePreloads.forEach(ne, t), S.highImagePreloads.clear(), sn = S, S.styles.forEach(Fe, t), sn = null;
            var ue = S.importMapChunks;
            for (U = 0; U < ue.length; U++)
              A(t, ue[U]);
            ue.length = 0, S.bootstrapScripts.forEach(ne, t), S.scripts.forEach(ne, t), S.scripts.clear(), S.bulkPreloads.forEach(ne, t), S.bulkPreloads.clear(), J || N || (x.instructions |= Pn);
            var le = S.hoistableChunks;
            for (U = 0; U < le.length; U++)
              A(t, le[U]);
            for (x = le.length = 0; x < b.length; x++) {
              var Ue = b[x];
              for (S = 0; S < Ue.length; S++)
                Ti(e, t, Ue[S], null);
            }
            var Zn = e.renderState.preamble, ze = Zn.headChunks;
            (Zn.htmlChunks || ze) && A(t, ht("head"));
            var hn = Zn.bodyChunks;
            if (hn)
              for (b = 0; b < hn.length; b++)
                A(t, hn[b]);
            Ti(e, t, h, null), e.completedRootSegment = null;
            var At = e.renderState;
            if (e.allPendingTasks !== 0 || e.clientRenderedBoundaries.length !== 0 || e.completedBoundaries.length !== 0 || e.trackedPostpones !== null && (e.trackedPostpones.rootNodes.length !== 0 || e.trackedPostpones.rootSlots !== null)) {
              var Ht = e.resumableState;
              if ((Ht.instructions & qe) === vt) {
                if (Ht.instructions |= qe, A(t, At.startInlineScript), (Ht.instructions & Pn) === vt) {
                  Ht.instructions |= Pn;
                  var On = "_" + Ht.idPrefix + "R_";
                  A(t, uu), A(
                    t,
                    ee(Pe(On))
                  ), A(t, un);
                }
                A(t, bt), A(t, Pc), D(t, Zi);
              }
            }
            xo(t, At);
          }
          var Le = e.renderState;
          h = 0;
          var Bt = Le.viewportChunks;
          for (h = 0; h < Bt.length; h++)
            A(
              t,
              Bt[h]
            );
          Bt.length = 0, Le.preconnects.forEach(ne, t), Le.preconnects.clear(), Le.fontPreloads.forEach(ne, t), Le.fontPreloads.clear(), Le.highImagePreloads.forEach(
            ne,
            t
          ), Le.highImagePreloads.clear(), Le.styles.forEach(Ke, t), Le.scripts.forEach(ne, t), Le.scripts.clear(), Le.bulkPreloads.forEach(ne, t), Le.bulkPreloads.clear();
          var Dr = Le.hoistableChunks;
          for (h = 0; h < Dr.length; h++)
            A(
              t,
              Dr[h]
            );
          Dr.length = 0;
          var Vn = e.clientRenderedBoundaries;
          for (c = 0; c < Vn.length; c++) {
            var ut = Vn[c];
            Le = t;
            var cl = e.resumableState, pr = e.renderState, er = ut.rootSegmentID, st = ut.errorDigest, Jt = ut.errorMessage, ul = ut.errorStack, Sl = ut.errorComponentStack;
            A(
              Le,
              pr.startInlineScript
            ), A(Le, bt), (cl.instructions & In) === vt ? (cl.instructions |= In, A(Le, _t)) : A(Le, Vr), A(
              Le,
              pr.boundaryPrefix
            ), A(Le, ee(er.toString(16))), A(Le, ji), (st || Jt || ul || Sl) && (A(
              Le,
              pt
            ), A(
              Le,
              ee(
                Zl(st || "")
              )
            )), (Jt || ul || Sl) && (A(
              Le,
              pt
            ), A(
              Le,
              ee(
                Zl(Jt || "")
              )
            )), (ul || Sl) && (A(
              Le,
              pt
            ), A(
              Le,
              ee(
                Zl(ul || "")
              )
            )), Sl && (A(
              Le,
              pt
            ), A(
              Le,
              ee(
                Zl(Sl)
              )
            ));
            var nr = D(
              Le,
              lo
            );
            if (!nr) {
              e.destination = null, c++, Vn.splice(0, c);
              return;
            }
          }
          Vn.splice(0, c);
          var Tt = e.completedBoundaries;
          for (c = 0; c < Tt.length; c++)
            if (!bc(
              e,
              t,
              Tt[c]
            )) {
              e.destination = null, c++, Tt.splice(0, c);
              return;
            }
          Tt.splice(0, c), Ae(t), hr = new Uint8Array(2048), ir = 0, or = !0;
          var Lr = e.partialBoundaries;
          for (c = 0; c < Lr.length; c++) {
            e: {
              Vn = e, ut = t;
              var sl = Lr[c];
              Ai = sl.byteSize;
              var Nr = sl.completedSegments;
              for (nr = 0; nr < Nr.length; nr++)
                if (!Qc(
                  Vn,
                  ut,
                  sl,
                  Nr[nr]
                )) {
                  nr++, Nr.splice(0, nr);
                  var na = !1;
                  break e;
                }
              Nr.splice(0, nr);
              var fl = sl.row;
              fl !== null && fl.together && sl.pendingTasks === 1 && (fl.pendingTasks === 1 ? ua(
                Vn,
                fl,
                fl.hoistables
              ) : fl.pendingTasks--), na = L(
                ut,
                sl.contentState,
                Vn.renderState
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
            if (!bc(e, t, Ut[c])) {
              e.destination = null, c++, Ut.splice(0, c);
              return;
            }
          Ut.splice(0, c);
        }
      } finally {
        or = !1, e.allPendingTasks === 0 && e.clientRenderedBoundaries.length === 0 && e.completedBoundaries.length === 0 ? (e.flushScheduled = !1, c = e.resumableState, c.hasBody && A(t, ht("body")), c.hasHtml && A(t, ht("html")), Ae(t), e.abortableTasks.size !== 0 && console.error(
          "There was still abortable task at the root when we closed. This is a bug in React."
        ), e.status = Ir, t.close(), e.destination = null) : Ae(t);
      }
    }
    function Tl(e) {
      e.flushScheduled = e.destination !== null, Va(function() {
        return ga(e);
      }), ie(function() {
        e.status === 10 && (e.status = 11), e.trackedPostpones === null && Vc(e, e.pendingRootTasks === 0);
      });
    }
    function rl(e) {
      e.flushScheduled === !1 && e.pingedTasks.length === 0 && e.destination !== null && (e.flushScheduled = !0, ie(function() {
        var t = e.destination;
        t ? wl(e, t) : e.flushScheduled = !1;
      }));
    }
    function xl(e, t) {
      if (e.status === 13)
        e.status = Ir, tr(t, e.fatalError);
      else if (e.status !== Ir && e.destination === null) {
        e.destination = t;
        try {
          wl(e, t);
        } catch (c) {
          t = {}, Mt(e, c, t, null), pi(e, c, t, null);
        }
      }
    }
    function Gn(e, t) {
      (e.status === 11 || e.status === 10) && (e.status = 12);
      try {
        var c = e.abortableTasks;
        if (0 < c.size) {
          var h = t === void 0 ? Error("The render was aborted by the server without a reason.") : typeof t == "object" && t !== null && typeof t.then == "function" ? Error("The render was aborted by the server with a promise.") : t;
          e.fatalError = h, c.forEach(function(b) {
            var x = r, S = cn.getCurrentStack;
            r = b, cn.getCurrentStack = yi;
            try {
              gc(b, e, h);
            } finally {
              r = x, cn.getCurrentStack = S;
            }
          }), c.clear();
        }
        e.destination !== null && wl(e, e.destination);
      } catch (b) {
        t = {}, Mt(e, b, t, null), pi(e, b, t, null);
      }
    }
    function El(e, t, c) {
      if (t === null) c.rootNodes.push(e);
      else {
        var h = c.workingMap, b = h.get(t);
        b === void 0 && (b = [t[1], t[2], [], null], h.set(t, b), El(b, t[0], c)), b[2].push(e);
      }
    }
    function lt(e) {
      var t = e.trackedPostpones;
      if (t === null || t.rootNodes.length === 0 && t.rootSlots === null)
        return e.trackedPostpones = null;
      if (e.completedRootSegment === null || e.completedRootSegment.status !== tn && e.completedPreambleSegments !== null) {
        var c = e.nextSegmentId, h = t.rootSlots, b = e.resumableState;
        b.bootstrapScriptContent = void 0, b.bootstrapScripts = void 0, b.bootstrapModules = void 0;
      } else {
        c = 0, h = -1, b = e.resumableState;
        var x = e.renderState;
        b.nextFormID = 0, b.hasBody = !1, b.hasHtml = !1, b.unknownResources = { font: x.resets.font }, b.dnsResources = x.resets.dns, b.connectResources = x.resets.connect, b.imageResources = x.resets.image, b.styleResources = x.resets.style, b.scriptResources = {}, b.moduleUnknownResources = {}, b.moduleScriptResources = {}, b.instructions = vt;
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
      var e = Jc.version;
      if (e !== "19.2.6")
        throw Error(
          `Incompatible React versions: The "react" and "react-dom" packages must have the exact same version. Instead got:
  - react:      ` + (e + `
  - react-dom:  19.2.6
Learn more: https://react.dev/warnings/version-mismatch`)
        );
    }
    var Jc = _s(), Kc = bf(), jc = /* @__PURE__ */ Symbol.for("react.transitional.element"), yc = /* @__PURE__ */ Symbol.for("react.portal"), Yi = /* @__PURE__ */ Symbol.for("react.fragment"), pc = /* @__PURE__ */ Symbol.for("react.strict_mode"), wc = /* @__PURE__ */ Symbol.for("react.profiler"), Xr = /* @__PURE__ */ Symbol.for("react.consumer"), it = /* @__PURE__ */ Symbol.for("react.context"), kn = /* @__PURE__ */ Symbol.for("react.forward_ref"), va = /* @__PURE__ */ Symbol.for("react.suspense"), Ga = /* @__PURE__ */ Symbol.for("react.suspense_list"), Xa = /* @__PURE__ */ Symbol.for("react.memo"), ba = /* @__PURE__ */ Symbol.for("react.lazy"), Iu = /* @__PURE__ */ Symbol.for("react.scope"), lr = /* @__PURE__ */ Symbol.for("react.activity"), Rs = /* @__PURE__ */ Symbol.for("react.legacy_hidden"), ti = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), is = /* @__PURE__ */ Symbol.for("react.view_transition"), Du = Symbol.iterator, xi = Array.isArray, Tc = /* @__PURE__ */ new WeakMap(), fr = /* @__PURE__ */ new WeakMap(), Gi = /* @__PURE__ */ Symbol.for("react.client.reference"), as = new MessageChannel(), Za = [];
    as.port1.onmessage = function() {
      var e = Za.shift();
      e && e();
    };
    var qc = Promise, Va = typeof queueMicrotask == "function" ? queueMicrotask : function(e) {
      qc.resolve(null).then(e).catch(Be);
    }, hr = null, ir = 0, ya = new TextEncoder(), qn = Object.assign, Hn = Object.prototype.hasOwnProperty, Qa = RegExp(
      "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    ), Mo = {}, $c = {}, Io = new Set(
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
    }, g = {}, w = /^on./, m = /^on[^A-Z]/, P = RegExp(
      "^(aria)-[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    ), V = RegExp(
      "^(aria)[A-Z][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    ), M = /^(?:webkit|moz|o)[A-Z]/, G = /^-ms-/, re = /-(.)/g, $ = /;\s*$/, ve = {}, De = {}, on = !1, Ze = !1, He = /["'&<>]/, je = /([A-Z])/g, Xe = /^ms-/, at = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i, cn = Jc.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, pn = Kc.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, _n = Object.freeze({
      pending: !1,
      data: null,
      method: null,
      action: null
    }), en = pn.d;
    pn.d = {
      f: en.f,
      r: en.r,
      D: function(e) {
        var t = Wn || null;
        if (t) {
          var c = t.resumableState, h = t.renderState;
          if (typeof e == "string" && e) {
            if (!c.dnsResources.hasOwnProperty(e)) {
              c.dnsResources[e] = An, c = h.headers;
              var b, x;
              (x = c && 0 < c.remainingCapacity) && (x = (b = "<" + La(e) + ">; rel=dns-prefetch", 0 <= (c.remainingCapacity -= b.length + 2))), x ? (h.resets.dns[e] = An, c.preconnects && (c.preconnects += ", "), c.preconnects += b) : (b = [], Ie(b, { href: e, rel: "dns-prefetch" }), h.preconnects.add(b));
            }
            rl(t);
          }
        } else en.D(e);
      },
      C: function(e, t) {
        var c = Wn || null;
        if (c) {
          var h = c.resumableState, b = c.renderState;
          if (typeof e == "string" && e) {
            var x = t === "use-credentials" ? "credentials" : typeof t == "string" ? "anonymous" : "default";
            if (!h.connectResources[x].hasOwnProperty(e)) {
              h.connectResources[x][e] = An, h = b.headers;
              var S, _;
              if (_ = h && 0 < h.remainingCapacity) {
                if (_ = "<" + La(e) + ">; rel=preconnect", typeof t == "string") {
                  var J = tl(
                    t,
                    "crossOrigin"
                  );
                  _ += '; crossorigin="' + J + '"';
                }
                _ = (S = _, 0 <= (h.remainingCapacity -= S.length + 2));
              }
              _ ? (b.resets.connect[x][e] = An, h.preconnects && (h.preconnects += ", "), h.preconnects += S) : (x = [], Ie(x, {
                rel: "preconnect",
                href: e,
                crossOrigin: t
              }), b.preconnects.add(x));
            }
            rl(c);
          }
        } else en.C(e, t);
      },
      L: function(e, t, c) {
        var h = Wn || null;
        if (h) {
          var b = h.resumableState, x = h.renderState;
          if (t && e) {
            switch (t) {
              case "image":
                if (c)
                  var S = c.imageSrcSet, _ = c.imageSizes, J = c.fetchPriority;
                var N = S ? S + `
` + (_ || "") : e;
                if (b.imageResources.hasOwnProperty(N)) return;
                b.imageResources[N] = qt, b = x.headers;
                var U;
                b && 0 < b.remainingCapacity && typeof S != "string" && J === "high" && (U = oa(e, t, c), 0 <= (b.remainingCapacity -= U.length + 2)) ? (x.resets.image[N] = qt, b.highImagePreloads && (b.highImagePreloads += ", "), b.highImagePreloads += U) : (b = [], Ie(
                  b,
                  qn(
                    {
                      rel: "preload",
                      href: S ? void 0 : e,
                      as: t
                    },
                    c
                  )
                ), J === "high" ? x.highImagePreloads.add(b) : (x.bulkPreloads.add(b), x.preloads.images.set(N, b)));
                break;
              case "style":
                if (b.styleResources.hasOwnProperty(e)) return;
                S = [], Ie(
                  S,
                  qn({ rel: "preload", href: e, as: t }, c)
                ), b.styleResources[e] = !c || typeof c.crossOrigin != "string" && typeof c.integrity != "string" ? qt : [c.crossOrigin, c.integrity], x.preloads.stylesheets.set(e, S), x.bulkPreloads.add(S);
                break;
              case "script":
                if (b.scriptResources.hasOwnProperty(e)) return;
                S = [], x.preloads.scripts.set(e, S), x.bulkPreloads.add(S), Ie(
                  S,
                  qn({ rel: "preload", href: e, as: t }, c)
                ), b.scriptResources[e] = !c || typeof c.crossOrigin != "string" && typeof c.integrity != "string" ? qt : [c.crossOrigin, c.integrity];
                break;
              default:
                if (b.unknownResources.hasOwnProperty(t)) {
                  if (S = b.unknownResources[t], S.hasOwnProperty(e))
                    return;
                } else
                  S = {}, b.unknownResources[t] = S;
                S[e] = qt, (b = x.headers) && 0 < b.remainingCapacity && t === "font" && (N = oa(e, t, c), 0 <= (b.remainingCapacity -= N.length + 2)) ? (x.resets.font[e] = qt, b.fontPreloads && (b.fontPreloads += ", "), b.fontPreloads += N) : (b = [], e = qn(
                  { rel: "preload", href: e, as: t },
                  c
                ), Ie(b, e), t) === "font" ? x.fontPreloads.add(b) : x.bulkPreloads.add(b);
            }
            rl(h);
          }
        } else en.L(e, t, c);
      },
      m: function(e, t) {
        var c = Wn || null;
        if (c) {
          var h = c.resumableState, b = c.renderState;
          if (e) {
            var x = t && typeof t.as == "string" ? t.as : "script";
            switch (x) {
              case "script":
                if (h.moduleScriptResources.hasOwnProperty(e))
                  return;
                x = [], h.moduleScriptResources[e] = !t || typeof t.crossOrigin != "string" && typeof t.integrity != "string" ? qt : [t.crossOrigin, t.integrity], b.preloads.moduleScripts.set(e, x);
                break;
              default:
                if (h.moduleUnknownResources.hasOwnProperty(x)) {
                  var S = h.unknownResources[x];
                  if (S.hasOwnProperty(e)) return;
                } else
                  S = {}, h.moduleUnknownResources[x] = S;
                x = [], S[e] = qt;
            }
            Ie(
              x,
              qn({ rel: "modulepreload", href: e }, t)
            ), b.bulkPreloads.add(x), rl(c);
          }
        } else en.m(e, t);
      },
      X: function(e, t) {
        var c = Wn || null;
        if (c) {
          var h = c.resumableState, b = c.renderState;
          if (e) {
            var x = h.scriptResources.hasOwnProperty(
              e
            ) ? h.scriptResources[e] : void 0;
            x !== An && (h.scriptResources[e] = An, t = qn({ src: e, async: !0 }, t), x && (x.length === 2 && hi(t, x), e = b.preloads.scripts.get(e)) && (e.length = 0), e = [], b.scripts.add(e), Da(e, t), rl(c));
          }
        } else en.X(e, t);
      },
      S: function(e, t, c) {
        var h = Wn || null;
        if (h) {
          var b = h.resumableState, x = h.renderState;
          if (e) {
            t = t || "default";
            var S = x.styles.get(t), _ = b.styleResources.hasOwnProperty(e) ? b.styleResources[e] : void 0;
            _ !== An && (b.styleResources[e] = An, S || (S = {
              precedence: ee(Pe(t)),
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
            }, _ && (_.length === 2 && hi(t.props, _), (x = x.preloads.stylesheets.get(e)) && 0 < x.length ? x.length = 0 : t.state = hu), S.sheets.set(e, t), rl(h));
          }
        } else en.S(e, t, c);
      },
      M: function(e, t) {
        var c = Wn || null;
        if (c) {
          var h = c.resumableState, b = c.renderState;
          if (e) {
            var x = h.moduleScriptResources.hasOwnProperty(e) ? h.moduleScriptResources[e] : void 0;
            x !== An && (h.moduleScriptResources[e] = An, t = qn(
              { src: e, type: "module", async: !0 },
              t
            ), x && (x.length === 2 && hi(t, x), e = b.preloads.moduleScripts.get(e)) && (e.length = 0), e = [], b.scripts.add(e), Da(e, t), rl(c));
          }
        } else en.M(e, t);
      }
    };
    var vt = 0, Sn = 1, Rr = 2, In = 4, En = 8, Pn = 32, qe = 64, An = null, qt = [];
    Object.freeze(qt);
    var sn = null;
    X('"></template>');
    var pa = X("<script"), Zi = X("<\/script>"), Cr = X('<script src="'), Pl = X('<script type="module" src="'), Al = X(' nonce="'), Fl = X(' integrity="'), Ei = X(' crossorigin="'), Vi = X(' async=""><\/script>'), Qt = X("<style"), Ja = /(<\/|<)(s)(cript)/gi, Ka = X(
      '<script type="importmap">'
    ), xc = X("<\/script>"), eu = {}, Do = 0, wa = 1, mr = 2, Ec = 3, kr = 4, Rl = 5, Qi = 6, Rc = 7, Ji = 8, nu = 9, Lt = X("<!-- -->"), Cc = /* @__PURE__ */ new Map(), Ta = X(' style="'), Lo = X(":"), ja = X(";"), Ot = X(" "), Cl = X('="'), un = X('"'), Ki = X('=""'), No = X(
      Pe(
        "javascript:throw new Error('React form unexpectedly submitted.')"
      )
    ), xa = X('<input type="hidden"'), bt = X(">"), Zr = X("/>"), Ea = !1, qa = !1, Ol = !1, dr = !1, zo = !1, Sr = !1, Nu = !1, $a = !1, mc = !1, tu = !1, ru = !1, Ri = X(' selected=""'), eo = X(
      `addEventListener("submit",function(a){if(!a.defaultPrevented){var c=a.target,d=a.submitter,e=c.action,b=d;if(d){var f=d.getAttribute("formAction");null!=f&&(e=f,b=null)}"javascript:throw new Error('React form unexpectedly submitted.')"===e&&(a.preventDefault(),b?(a=document.createElement("input"),a.name=b.name,a.value=b.value,b.parentNode.insertBefore(a,b),b=new FormData(c),a.parentNode.removeChild(a)):b=new FormData(c),a=c.ownerDocument||c,(a.$$reactFormReplay=a.$$reactFormReplay||[]).push(c,d,b))}});`
    ), no = X("<!--F!-->"), Pr = X("<!--F-->"), kc = /(<\/|<)(s)(tyle)/gi, Sc = X("<!--head-->"), zu = X("<!--body-->"), Hu = X("<!--html-->"), lu = X(`
`), Bu = /^[a-zA-Z][a-zA-Z:_\.\-\d]*$/, Uu = /* @__PURE__ */ new Map(), Nt = X("<!DOCTYPE html>"), iu = /* @__PURE__ */ new Map(), Pc = X(
      "requestAnimationFrame(function(){$RT=performance.now()});"
    ), Ac = X('<template id="'), au = X('"></template>'), Wu = X("<!--&-->"), ou = X("<!--/&-->"), cu = X("<!--$-->"), Ra = X(
      '<!--$?--><template id="'
    ), _l = X('"></template>'), cs = X("<!--$!-->"), to = X("<!--/$-->"), Fc = X("<template"), ri = X('"'), Ho = X(' data-dgst="'), Ca = X(' data-msg="'), Oc = X(' data-stck="'), ma = X(' data-cstck="'), us = X("></template>"), ss = X('<div hidden id="'), li = X('">'), Bo = X("</div>"), ml = X(
      '<svg aria-hidden="true" style="display:none" id="'
    ), ka = X('">'), ro = X("</svg>"), Ml = X(
      '<math aria-hidden="true" style="display:none" id="'
    ), Yu = X('">'), fs = X("</math>"), Uo = X('<table hidden id="'), l = X('">'), a = X("</table>"), s = X(
      '<table hidden><tbody id="'
    ), v = X('">'), p = X("</tbody></table>"), C = X('<table hidden><tr id="'), k = X('">'), z = X("</tr></table>"), O = X(
      '<table hidden><colgroup id="'
    ), H = X('">'), Z = X("</colgroup></table>"), K = X(
      '$RS=function(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};$RS("'
    ), xe = X('$RS("'), we = X('","'), bn = X('")<\/script>');
    X('<template data-rsi="" data-sid="'), X('" data-pid="');
    var Ve = X(
      `$RB=[];$RV=function(a){$RT=performance.now();for(var b=0;b<a.length;b+=2){var c=a[b],e=a[b+1];null!==e.parentNode&&e.parentNode.removeChild(e);var f=c.parentNode;if(f){var g=c.previousSibling,h=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d||"/&"===d)if(0===h)break;else h--;else"$"!==d&&"$?"!==d&&"$~"!==d&&"$!"!==d&&"&"!==d||h++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;e.firstChild;)f.insertBefore(e.firstChild,c);g.data="$";g._reactRetry&&requestAnimationFrame(g._reactRetry)}}a.length=0};
$RC=function(a,b){if(b=document.getElementById(b))(a=document.getElementById(a))?(a.previousSibling.data="$~",$RB.push(a,b),2===$RB.length&&("number"!==typeof $RT?requestAnimationFrame($RV.bind(null,$RB)):(a=performance.now(),setTimeout($RV.bind(null,$RB),2300>a&&2E3<a?2300-a:$RT+300-a)))):b.parentNode.removeChild(b)};`
    );
    ee(
      `$RV=function(A,g){function k(a,b){var e=a.getAttribute(b);e&&(b=a.style,l.push(a,b.viewTransitionName,b.viewTransitionClass),"auto"!==e&&(b.viewTransitionClass=e),(a=a.getAttribute("vt-name"))||(a="_T_"+K++ +"_"),b.viewTransitionName=a,B=!0)}var B=!1,K=0,l=[];try{var f=document.__reactViewTransition;if(f){f.finished.finally($RV.bind(null,g));return}var m=new Map;for(f=1;f<g.length;f+=2)for(var h=g[f].querySelectorAll("[vt-share]"),d=0;d<h.length;d++){var c=h[d];m.set(c.getAttribute("vt-name"),c)}var u=[];for(h=0;h<g.length;h+=2){var C=g[h],x=C.parentNode;if(x){var v=x.getBoundingClientRect();if(v.left||v.top||v.width||v.height){c=C;for(f=0;c;){if(8===c.nodeType){var r=c.data;if("/$"===r)if(0===f)break;else f--;else"$"!==r&&"$?"!==r&&"$~"!==r&&"$!"!==r||f++}else if(1===c.nodeType){d=c;var D=d.getAttribute("vt-name"),y=m.get(D);k(d,y?"vt-share":"vt-exit");y&&(k(y,"vt-share"),m.set(D,null));var E=d.querySelectorAll("[vt-share]");for(d=0;d<E.length;d++){var F=E[d],G=F.getAttribute("vt-name"),
H=m.get(G);H&&(k(F,"vt-share"),k(H,"vt-share"),m.set(G,null))}}c=c.nextSibling}for(var I=g[h+1],t=I.firstElementChild;t;)null!==m.get(t.getAttribute("vt-name"))&&k(t,"vt-enter"),t=t.nextElementSibling;c=x;do for(var n=c.firstElementChild;n;){var J=n.getAttribute("vt-update");J&&"none"!==J&&!l.includes(n)&&k(n,"vt-update");n=n.nextElementSibling}while((c=c.parentNode)&&1===c.nodeType&&"none"!==c.getAttribute("vt-update"));u.push.apply(u,I.querySelectorAll('img[src]:not([loading="lazy"])'))}}}if(B){var z=
document.__reactViewTransition=document.startViewTransition({update:function(){A(g);for(var a=[document.documentElement.clientHeight,document.fonts.ready],b={},e=0;e<u.length;b={g:b.g},e++)if(b.g=u[e],!b.g.complete){var p=b.g.getBoundingClientRect();0<p.bottom&&0<p.right&&p.top<window.innerHeight&&p.left<window.innerWidth&&(p=new Promise(function(w){return function(q){w.g.addEventListener("load",q);w.g.addEventListener("error",q)}}(b)),a.push(p))}return Promise.race([Promise.all(a),new Promise(function(w){var q=
performance.now();setTimeout(w,2300>q&&2E3<q?2300-q:500)})])},types:[]});z.ready.finally(function(){for(var a=l.length-3;0<=a;a-=3){var b=l[a],e=b.style;e.viewTransitionName=l[a+1];e.viewTransitionClass=l[a+1];""===b.getAttribute("style")&&b.removeAttribute("style")}});z.finished.finally(function(){document.__reactViewTransition===z&&(document.__reactViewTransition=null)});$RB=[];return}}catch(a){}A(g)}.bind(null,$RV);`
    );
    var yn = X('$RC("'), yt = X(
      `$RM=new Map;$RR=function(n,w,p){function u(q){this._p=null;q()}for(var r=new Map,t=document,h,b,e=t.querySelectorAll("link[data-precedence],style[data-precedence]"),v=[],k=0;b=e[k++];)"not all"===b.getAttribute("media")?v.push(b):("LINK"===b.tagName&&$RM.set(b.getAttribute("href"),b),r.set(b.dataset.precedence,h=b));e=0;b=[];var l,a;for(k=!0;;){if(k){var f=p[e++];if(!f){k=!1;e=0;continue}var c=!1,m=0;var d=f[m++];if(a=$RM.get(d)){var g=a._p;c=!0}else{a=t.createElement("link");a.href=d;a.rel=
"stylesheet";for(a.dataset.precedence=l=f[m++];g=f[m++];)a.setAttribute(g,f[m++]);g=a._p=new Promise(function(q,x){a.onload=u.bind(a,q);a.onerror=u.bind(a,x)});$RM.set(d,a)}d=a.getAttribute("media");!g||d&&!matchMedia(d).matches||b.push(g);if(c)continue}else{a=v[e++];if(!a)break;l=a.getAttribute("data-precedence");a.removeAttribute("media")}c=r.get(l)||h;c===h&&(h=a);r.set(l,a);c?c.parentNode.insertBefore(a,c.nextSibling):(c=t.head,c.insertBefore(a,c.firstChild))}if(p=document.getElementById(n))p.previousSibling.data=
"$~";Promise.all(b).then($RC.bind(null,n,w),$RX.bind(null,n,"CSS failed to load"))};$RR("`
    ), $n = X('$RR("'), gr = X('","'), ll = X('",'), Il = X('"'), Qe = X(")<\/script>");
    X('<template data-rci="" data-bid="'), X('<template data-rri="" data-bid="'), X('" data-sid="'), X('" data-sty="');
    var Ar = X(
      '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};'
    ), _t = X(
      '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};;$RX("'
    ), Vr = X('$RX("'), ji = X('"'), pt = X(","), lo = X(")<\/script>");
    X('<template data-rxi="" data-bid="'), X('" data-dgst="'), X('" data-msg="'), X('" data-stck="'), X('" data-cstck="');
    var Dl = /[<\u2028\u2029]/g, Fr = /[&><\u2028\u2029]/g, ii = X(
      ' media="not all" data-precedence="'
    ), Or = X('" data-href="'), io = X('">'), Wo = X("</style>"), Qr = !1, Yo = !0, _r = [], ao = X(' data-precedence="'), Gu = X('" data-href="'), ot = X(" "), Go = X('">'), ai = X("</style>");
    X('<link rel="expect" href="#'), X('" blocking="render"/>');
    var uu = X(' id="'), oo = X("["), su = X(",["), fu = X(","), Xo = X("]"), Sa = 0, hu = 1, Ci = 2, co = 3, uo = /[<>\r\n]/g, hs = /["';,\r\n]/g, Ll = Function.prototype.bind, ds = /* @__PURE__ */ Symbol.for("react.client.reference"), kl = {};
    Object.freeze(kl);
    var Pa = {}, qi = null, du = {}, gu = {}, vu = /* @__PURE__ */ new Set(), so = /* @__PURE__ */ new Set(), gs = /* @__PURE__ */ new Set(), Xu = /* @__PURE__ */ new Set(), Zo = /* @__PURE__ */ new Set(), vs = /* @__PURE__ */ new Set(), bu = /* @__PURE__ */ new Set(), ms = /* @__PURE__ */ new Set(), Zu = /* @__PURE__ */ new Set(), ks = {
      enqueueSetState: function(e, t, c) {
        var h = e._reactInternals;
        h.queue === null ? sr(e, "setState") : (h.queue.push(t), c != null && Jl(c));
      },
      enqueueReplaceState: function(e, t, c) {
        e = e._reactInternals, e.replace = !0, e.queue = [t], c != null && Jl(c);
      },
      enqueueForceUpdate: function(e, t) {
        e._reactInternals.queue === null ? sr(e, "forceUpdate") : t != null && Jl(t);
      }
    }, yu = { id: 1, overflow: "" }, Vo = Math.clz32 ? Math.clz32 : Wc, Ms = Math.log, Is = Math.LN2, mi = Error(
      "Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`."
    ), bs = null, Ds = typeof Object.is == "function" ? Object.is : Yc, ar = null, $i = null, Mr = null, Aa = null, Nl = null, Dn = null, il = !1, ea = !1, zt = 0, _c = 0, pu = -1, ys = 0, Qo = null, fo = null, Mc = 0, oi = !1, ho, Ic = {
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
        ar = rt(), Dn = Eo();
        var t = Dn.memoizedState;
        return t === null ? (e = { current: e }, Object.seal(e), Dn.memoizedState = e) : t;
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
        e = e.id, e = (e & ~(1 << 32 - Vo(e) - 1)).toString(32) + t;
        var c = n;
        if (c === null)
          throw Error(
            "Invalid hook call. Hooks can only be called inside of the body of a function component."
          );
        return t = zt++, e = "_" + c.idPrefix + "R_" + e, 0 < t && (e += "H" + t.toString(32)), e + "_";
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
        return rt(), _n;
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
    }, d = 0, y, E, F, I, te, B, j;
    sc.__reactDisabledLog = !0;
    var ge, Ce, be = !1, ae = new (typeof WeakMap == "function" ? WeakMap : Map)(), fn = {
      react_stack_bottom_frame: function(e, t, c) {
        return e(t, c);
      }
    }, Qn = fn.react_stack_bottom_frame.bind(fn), Ye = {
      react_stack_bottom_frame: function(e) {
        return e.render();
      }
    }, Fn = Ye.react_stack_bottom_frame.bind(Ye), vr = {
      react_stack_bottom_frame: function(e) {
        var t = e._init;
        return t(e._payload);
      }
    }, br = vr.react_stack_bottom_frame.bind(vr), Mn = 0;
    if (typeof performance == "object" && typeof performance.now == "function")
      var $t = performance, ki = function() {
        return $t.now();
      };
    else {
      var Jr = Date;
      ki = function() {
        return Jr.now();
      };
    }
    var _e = 4, Bn = 0, Un = 1, Xn = 2, wt = 3, wn = 4, tn = 5, Ir = 14, Wn = null, yr = {}, ct = {}, al = {}, Jo = {}, ol = !1, Si = !1, Pi = !1, Ai = 0, or = !1;
    ni(), ni(), Gs.prerender = function(e, t) {
      return new Promise(function(c, h) {
        var b = t ? t.onHeaders : void 0, x;
        b && (x = function(U) {
          b(new Headers(U));
        });
        var S = vl(
          t ? t.identifierPrefix : void 0,
          t ? t.unstable_externalRuntimeSrc : void 0,
          t ? t.bootstrapScriptContent : void 0,
          t ? t.bootstrapScripts : void 0,
          t ? t.bootstrapModules : void 0
        ), _ = Yr(
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
                  xl(_, oe);
                },
                cancel: function(oe) {
                  _.destination = null, Gn(_, oe);
                }
              },
              { highWaterMark: 0 }
            );
            U = {
              postponed: lt(_),
              prelude: U
            }, c(U);
          },
          void 0,
          void 0,
          h,
          t ? t.onPostpone : void 0
        );
        if (t && t.signal) {
          var J = t.signal;
          if (J.aborted) Gn(_, J.reason);
          else {
            var N = function() {
              Gn(_, J.reason), J.removeEventListener("abort", N);
            };
            J.addEventListener("abort", N);
          }
        }
        Tl(_);
      });
    }, Gs.renderToReadableStream = function(e, t) {
      return new Promise(function(c, h) {
        var b, x, S = new Promise(function(ue, le) {
          x = ue, b = le;
        }), _ = t ? t.onHeaders : void 0, J;
        _ && (J = function(ue) {
          _(new Headers(ue));
        });
        var N = vl(
          t ? t.identifierPrefix : void 0,
          t ? t.unstable_externalRuntimeSrc : void 0,
          t ? t.bootstrapScriptContent : void 0,
          t ? t.bootstrapScripts : void 0,
          t ? t.bootstrapModules : void 0
        ), U = ko(
          e,
          N,
          Tr(
            N,
            t ? t.nonce : void 0,
            t ? t.unstable_externalRuntimeSrc : void 0,
            t ? t.importMap : void 0,
            J,
            t ? t.maxHeadersLength : void 0
          ),
          Y(t ? t.namespaceURI : void 0),
          t ? t.progressiveChunkSize : void 0,
          t ? t.onError : void 0,
          x,
          function() {
            var ue = new ReadableStream(
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
            ue.allReady = S, c(ue);
          },
          function(ue) {
            S.catch(function() {
            }), h(ue);
          },
          b,
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
      return new Promise(function(h, b) {
        var x, S, _ = new Promise(function(oe, se) {
          S = oe, x = se;
        }), J = Kt(
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
                  xl(J, se);
                },
                cancel: function(se) {
                  J.destination = null, Gn(J, se);
                }
              },
              { highWaterMark: 0 }
            );
            oe.allReady = _, h(oe);
          },
          function(oe) {
            _.catch(function() {
            }), b(oe);
          },
          x,
          c ? c.onPostpone : void 0
        );
        if (c && c.signal) {
          var N = c.signal;
          if (N.aborted) Gn(J, N.reason);
          else {
            var U = function() {
              Gn(J, N.reason), N.removeEventListener("abort", U);
            };
            N.addEventListener("abort", U);
          }
        }
        Tl(J);
      });
    }, Gs.resumeAndPrerender = function(e, t, c) {
      return new Promise(function(h, b) {
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
            var J = new ReadableStream(
              {
                type: "bytes",
                pull: function(N) {
                  xl(x, N);
                },
                cancel: function(N) {
                  x.destination = null, Gn(x, N);
                }
              },
              { highWaterMark: 0 }
            );
            J = { postponed: lt(x), prelude: J }, h(J);
          },
          void 0,
          void 0,
          b,
          c ? c.onPostpone : void 0
        );
        if (c && c.signal) {
          var S = c.signal;
          if (S.aborted) Gn(x, S.reason);
          else {
            var _ = function() {
              Gn(x, S.reason), S.removeEventListener("abort", _);
            };
            S.addEventListener("abort", _);
          }
        }
        Tl(x);
      });
    }, Gs.version = "19.2.6";
  })()), Gs;
}
var Qf;
function sh() {
  if (Qf) return Ws;
  Qf = 1;
  var fe, ce;
  return process.env.NODE_ENV === "production" ? (fe = ah(), ce = oh()) : (fe = ch(), ce = uh()), Ws.version = fe.version, Ws.renderToString = fe.renderToString, Ws.renderToStaticMarkup = fe.renderToStaticMarkup, Ws.renderToReadableStream = ce.renderToReadableStream, Ws.resume = ce.resume, Ws;
}
var fh = sh(), hh = _s();
const dh = /* @__PURE__ */ qf(hh), gh = { BASE_URL: "/", DEV: !1, MODE: "production", PROD: !0, SSR: !1, VITE_BACKEND_URL: "http://localhost:3001" };
function mf(fe) {
  return String(gh?.[fe] ?? "").trim();
}
function vh() {
  return String(mf("VITE_BACKEND_URL") || "http://localhost:3001").trim().replace(/\/+$/, "").replace(/\/api$/i, "") || "http://localhost:3001";
}
function bh() {
  const fe = mf("VITE_SUPABASE_URL"), ce = mf("VITE_SUPABASE_ANON_KEY");
  return !fe || !ce ? null : { url: fe, anonKey: ce };
}
const yh = "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";
vh(), bh();
function ph(fe) {
  const ce = Number(fe);
  return !Number.isFinite(ce) || ce === 0 ? 0 : ce < 0 ? ce : Math.ceil(ce / 5) * 5;
}
const wh = [
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
function xs(fe) {
  return `$${Math.max(0, Math.round(fe)).toLocaleString()}`;
}
function vf(fe) {
  const ce = Math.round(fe);
  return ce < 0 ? `-$${Math.abs(ce).toLocaleString()}` : `$${Math.max(0, ce).toLocaleString()}`;
}
function Th(fe) {
  const ce = ["Vanity program"], W = fe.colorLabel?.trim();
  W ? ce.push(`Color: ${W}`) : fe.projectColorTbd && ce.push("Color TBD");
  const ke = fe.materialGroup?.trim();
  return ke && ce.push(ke), ce.join(" · ");
}
function xh(fe) {
  const ce = fe.quoteNumber?.trim();
  if (!ce) return null;
  const W = [fe.projectAddress, fe.city, fe.state].filter(Boolean).join(", "), ke = fe.customerDisplay, nn = ke.preparedByDisplayName || fe.preparedBy || "—";
  return /* @__PURE__ */ q.jsxs("div", { className: "customer-estimate-print", "aria-hidden": "true", children: [
    /* @__PURE__ */ q.jsxs("header", { className: "cep-header", children: [
      /* @__PURE__ */ q.jsx("img", { className: "cep-logo", src: yh, alt: "Elite Stone Fabrication" }),
      /* @__PURE__ */ q.jsxs("div", { className: "cep-header-text", children: [
        /* @__PURE__ */ q.jsx("h1", { className: "cep-title", children: "Elite Stone Fabrication Estimate" }),
        /* @__PURE__ */ q.jsx("p", { className: "cep-date", children: fe.estimateDate })
      ] })
    ] }),
    /* @__PURE__ */ q.jsxs("section", { className: "cep-section cep-overview", children: [
      /* @__PURE__ */ q.jsx("h2", { className: "cep-h2", children: "Project overview" }),
      /* @__PURE__ */ q.jsxs("dl", { className: "cep-overview-grid", children: [
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Estimate date" }),
          /* @__PURE__ */ q.jsx("dd", { children: fe.estimateDate })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Quote / estimate ref." }),
          /* @__PURE__ */ q.jsx("dd", { children: ce })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Customer" }),
          /* @__PURE__ */ q.jsx("dd", { children: fe.customerName || "—" })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Account" }),
          /* @__PURE__ */ q.jsx("dd", { children: fe.accountName || "—" })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item cep-overview-span-2", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Project / Elite job name" }),
          /* @__PURE__ */ q.jsx("dd", { children: fe.projectName || "—" })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item cep-overview-span-3", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Project address" }),
          /* @__PURE__ */ q.jsx("dd", { children: W || "—" })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Branch" }),
          /* @__PURE__ */ q.jsx("dd", { children: fe.branch || "—" })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Salesperson" }),
          /* @__PURE__ */ q.jsx("dd", { children: fe.salesRep || "—" })
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
        ke.estimateSummaryRows.map((ye) => /* @__PURE__ */ q.jsxs("tr", { children: [
          /* @__PURE__ */ q.jsx("td", { children: ye.label }),
          /* @__PURE__ */ q.jsx("td", { className: "cep-amt", children: vf(ye.displayAmount) })
        ] }, ye.key)),
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
        /* @__PURE__ */ q.jsx("tbody", { children: ke.roomAreaPrintRows.map((ye) => /* @__PURE__ */ q.jsxs(dh.Fragment, { children: [
          /* @__PURE__ */ q.jsxs("tr", { className: "cep-room-breakdown-main-row", children: [
            /* @__PURE__ */ q.jsxs("td", { children: [
              /* @__PURE__ */ q.jsx("strong", { children: ye.displayName }),
              ye.isVanity ? /* @__PURE__ */ q.jsxs("span", { className: "cep-muted-inline", children: [
                " ",
                "·",
                " ",
                ye.vanityProgramLabel ? `${ye.vanityProgramLabel} · ` : "",
                Th({
                  materialGroup: ye.materialGroup,
                  colorLabel: ye.colorLabel,
                  projectColorTbd: fe.colorTbd
                })
              ] }) : /* @__PURE__ */ q.jsxs("span", { className: "cep-muted-inline", children: [
                " ",
                "· ",
                ye.materialGroup,
                ye.colorLabel ? ` · ${ye.colorLabel}` : fe.colorTbd ? " · Color TBD" : ""
              ] })
            ] }),
            /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: xs(ye.displayedMaterial) }),
            /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: ye.displayedAddOns > 0 ? xs(ye.displayedAddOns) : "—" }),
            /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: /* @__PURE__ */ q.jsx("strong", { children: xs(ye.displayedAreaTotal) }) })
          ] }),
          ye.addonLines.length > 0 ? /* @__PURE__ */ q.jsx("tr", { className: "cep-room-breakdown-detail-row", children: /* @__PURE__ */ q.jsxs("td", { colSpan: 4, className: "cep-room-includes", children: [
            "Includes: ",
            ye.addonLines.map((Oe) => Oe.label).join(", ")
          ] }) }) : null,
          ye.customerCustomLines.map((Oe, Tn) => /* @__PURE__ */ q.jsxs(
            "tr",
            {
              className: "cep-room-breakdown-detail-row",
              children: [
                /* @__PURE__ */ q.jsx("td", { colSpan: 3, className: "cep-room-custom-line", children: Oe.name }),
                /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: vf(ph(Oe.amountExact)) })
              ]
            },
            Oe.lineKey || `${ye.roomId}-custom-${Tn}-${Oe.amountExact}`
          )),
          ye.customerNoteLines.length > 0 ? /* @__PURE__ */ q.jsx("tr", { className: "cep-room-breakdown-detail-row cep-room-note-row", children: /* @__PURE__ */ q.jsx("td", { colSpan: 4, className: "cep-room-note", children: ye.customerNoteLines.join(" ") }) }) : null
        ] }, ye.roomId)) }),
        ke.unassignedExact !== 0 ? /* @__PURE__ */ q.jsx("tfoot", { children: /* @__PURE__ */ q.jsxs("tr", { children: [
          /* @__PURE__ */ q.jsx("td", { colSpan: 3, children: ke.unassignedExact < 0 ? "Project discount / credit" : "Other project items (see Estimate summary)" }),
          /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: vf(ke.unassignedDisplayTotal) })
        ] }) }) : null
      ] })
    ] }) : null,
    ke.roomComparisonTable ? /* @__PURE__ */ q.jsxs("section", { className: "cep-section cep-section-compact cep-comparison cep-comparison-print", children: [
      /* @__PURE__ */ q.jsx("h2", { className: "cep-h2 cep-h2-muted", children: ke.roomComparisonTable.isPerRoomMode ? "Optional material comparison by room" : "Optional material group comparison" }),
      /* @__PURE__ */ q.jsx("p", { className: "cep-muted cep-comparison-note", children: ke.roomComparisonTable.isPerRoomMode ? "Illustrative only — alternate material tier pricing for the rooms shown. Other rooms use the selected material above." : "Illustrative only — shows estimated area totals at alternate material tiers with the same scope and add-ons." }),
      ke.roomComparisonTable.roomBlocks.map((ye) => /* @__PURE__ */ q.jsxs("div", { className: "cep-comparison-room-block", children: [
        /* @__PURE__ */ q.jsx("h3", { className: "cep-h3", children: ye.roomDisplayName }),
        ye.groupBlocks.map((Oe) => /* @__PURE__ */ q.jsxs("div", { className: "cep-comparison-group-block", children: [
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
        ] }, `${ye.roomId}-${Oe.group}`))
      ] }, ye.roomId)),
      /* @__PURE__ */ q.jsxs("div", { className: "cep-comparison-project-totals", children: [
        /* @__PURE__ */ q.jsx("p", { className: "cep-comparison-project-totals-label", children: /* @__PURE__ */ q.jsx("strong", { children: ke.roomComparisonTable.isPerRoomMode ? "Subtotal (shown rooms)" : "Estimated project total" }) }),
        ke.roomComparisonTable.selectedGroups.map((ye) => /* @__PURE__ */ q.jsxs("p", { className: "cep-comparison-project-total-line", children: [
          ye.group,
          ye.colorLabel ? ` · ${ye.colorLabel}` : "",
          ":",
          " ",
          /* @__PURE__ */ q.jsx("strong", { children: xs(ke.roomComparisonTable.projectDisplayTotals[ye.group] ?? 0) })
        ] }, ye.group))
      ] })
    ] }) : null,
    ke.customerFacingNoteLines.length > 0 ? /* @__PURE__ */ q.jsxs("section", { className: "cep-section cep-section-compact cep-project-notes", children: [
      /* @__PURE__ */ q.jsx("h2", { className: "cep-h2", children: "Project Notes" }),
      /* @__PURE__ */ q.jsx("ul", { className: "cep-project-notes-list", children: ke.customerFacingNoteLines.map((ye, Oe) => /* @__PURE__ */ q.jsx("li", { children: ye }, `note-${Oe}-${ye.slice(0, 24)}`)) })
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
      /* @__PURE__ */ q.jsx("div", { className: "cep-branches", children: wh.map((ye) => /* @__PURE__ */ q.jsxs("address", { className: "cep-branch", children: [
        /* @__PURE__ */ q.jsx("strong", { children: ye.city }),
        ye.lines.map((Oe) => /* @__PURE__ */ q.jsx("span", { children: Oe }, Oe))
      ] }, ye.city)) }),
      /* @__PURE__ */ q.jsx("p", { className: "cep-website", children: "www.elitestonefabrication.com" })
    ] })
  ] });
}
const Eh = ".cep-header{display:flex;align-items:center;gap:14px;margin-bottom:10px;padding-bottom:10px;border-bottom:2px solid #b91c1c}.cep-header-text{flex:1;min-width:0}.cep-comparison-room-block{margin-bottom:8px}.cep-comparison-group-block{margin-bottom:6px}.cep-comparison-group-heading{margin:0 0 4px;font-size:.72rem}.cep-comparison-detail-table{margin-bottom:4px}.cep-comparison-project-totals{margin-top:6px}.cep-comparison-project-totals-label{margin:0 0 4px;font-size:.66rem}.cep-comparison-project-total-line{margin:2px 0;font-size:.66rem}.cep-logo{width:108px;height:auto;flex-shrink:0}.cep-title{margin:0;font-size:1.2rem;font-weight:700;letter-spacing:-.01em;line-height:1.2;color:#0f172a}.cep-date{margin:4px 0 0;font-size:.8rem;font-weight:500;color:#475569}.cep-section{margin-bottom:8px}.cep-section-compact{margin-bottom:6px}.cep-muted-inline{font-weight:500;color:#64748b;font-size:.66rem}.cep-h2{margin:0 0 5px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#64748b}.cep-h2-muted{color:#94a3b8;font-weight:600}.cep-h3{margin:0 0 4px;font-size:.8rem;font-weight:700;color:#0f172a}.cep-muted{margin:0 0 5px;font-size:.72rem;line-height:1.35;color:#64748b}.cep-overview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 12px;margin:0;padding:8px 10px;border:1px solid #e2e8f0;border-radius:4px;background:#fafbfc}.cep-overview-item{margin:0;min-width:0}.cep-overview-item dt{margin:0;font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748b;line-height:1.2}.cep-overview-item dd{margin:1px 0 0;font-size:.74rem;font-weight:600;color:#0f172a;line-height:1.25}.cep-overview-span-2{grid-column:span 2}.cep-overview-span-3{grid-column:1 / -1}.cep-material-group{margin-bottom:5px}.cep-material-group:last-of-type{margin-bottom:4px}.cep-table-scope tfoot th,.cep-table-scope tfoot td{font-size:.68rem}.cep-material-scope-foot td{font-weight:600;font-size:.68rem;background:#f8fafc;border-top:1px solid #cbd5e1}.cep-material-group-amt{vertical-align:bottom;padding-left:10px!important;white-space:nowrap}.cep-group-material-label{display:block;font-weight:500;font-size:.58rem;color:#64748b;text-transform:none;letter-spacing:normal;line-height:1.2;margin-bottom:1px}.cep-group-material-value{display:block;font-weight:700;font-size:.72rem;color:#475569;font-variant-numeric:tabular-nums}.cep-vanity-group-amt{margin:2px 0 0;text-align:right;font-size:.66rem}.cep-scope-grand{margin:6px 0 0;padding-top:5px;border-top:1px solid #e2e8f0;font-size:.7rem;font-weight:600;color:#475569}.cep-room-breakdown-lead{margin:0 0 8px;max-width:52rem}.cep-room-breakdown-table{page-break-inside:auto}.cep-room-breakdown-main-row td{vertical-align:top;padding-top:6px;padding-bottom:4px}.cep-room-breakdown-detail-row td{padding-top:0;padding-bottom:6px;border-top:none;font-size:.62rem;color:#64748b}.cep-room-addon-list{margin:0;padding:0 0 0 14px;list-style:disc}.cep-room-custom-line{padding-left:14px!important}.cep-addon-room{color:#64748b;font-weight:500}.cep-subtotal-row td{border-top:1px solid #cbd5e1;background:#f8fafc}.cep-num{text-align:right;font-variant-numeric:tabular-nums}.cep-comparison{opacity:.92;padding:6px 8px;border:1px dashed #e2e8f0;border-radius:4px;background:#fafbfc}.cep-comparison-note{margin-bottom:4px;font-size:.66rem}.cep-comparison-table{font-size:.66rem}.cep-comparison-table th{background:#f1f5f9;font-weight:600}.cep-estimate-summary{border:1px solid #cbd5e1;border-radius:4px;padding:8px 10px 6px;background:#fff}.cep-summary-total-row td{border-top:2px solid #0f172a;padding-top:6px}.cep-summary-total-value{font-size:1rem;color:#b91c1c}.cep-round-note{margin-top:4px;font-size:.62rem}.cep-closing{margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0}.cep-footer-terms-sig{width:100%;max-width:100%;box-sizing:border-box}.cep-terms-box{padding:8px 10px;border:1px solid #cbd5e1;border-radius:4px;background:#fafbfc}.cep-terms-title{margin:0 0 4px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#334155}.cep-terms-list{margin:0;padding-left:1rem;font-size:.64rem;line-height:1.35;color:#334155}.cep-terms-list li{margin-bottom:2px}.cep-project-notes-list{margin:0;padding-left:1rem;font-size:.72rem;line-height:1.4;color:#334155}.cep-project-notes-list li{margin-bottom:3px}.cep-signature-block{margin:8px 0;padding:6px 0 4px}.cep-sig-line-inline{display:grid;grid-template-columns:auto minmax(2rem,1fr) auto 5rem;align-items:flex-end;column-gap:8px;row-gap:0;margin-bottom:9px}.cep-sig-line-inline:last-child{margin-bottom:0}.cep-sig-role{font-size:.66rem;font-weight:600;color:#374151;white-space:nowrap;padding-bottom:2px;line-height:1.2}.cep-sig-role-date{padding-left:4px}.cep-sig-under{border-bottom:1.5px solid #0f172a;min-height:.95em;margin-bottom:1px}.cep-sig-under-main{min-width:0}.cep-sig-under-date{width:100%;max-width:5rem}.cep-branches{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:6px;width:100%}.cep-branch{margin:0;font-style:normal;font-size:.62rem;line-height:1.35;color:#334155;text-align:center}.cep-branch strong{display:block;margin-bottom:2px;font-size:.66rem;color:#0f172a}.cep-branch span{display:block}.cep-website{margin:0;text-align:center;font-size:.7rem;font-weight:700;letter-spacing:.02em;color:#b91c1c}.cep-table-compact{font-size:.72rem}.cep-table-compact th,.cep-table-compact td{padding:3px 6px}.cep-meta{width:100%;border-collapse:collapse;font-size:.9rem}.cep-meta th{text-align:left;font-weight:600;color:var(--text-secondary);padding:6px 12px 6px 0;width:140px;vertical-align:top}.cep-meta td{padding:6px 0;color:var(--text)}.cep-table{width:100%;border-collapse:collapse;font-size:.86rem}.cep-table th,.cep-table td{border:1px solid var(--border);padding:8px 10px;text-align:left}.cep-table th{background:#f8fafc;font-weight:700;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em}.cep-summary-table tbody tr td{padding-top:3px;padding-bottom:3px}.cep-table-amounts .cep-amt{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}.cep-measure-notes ul{margin:0;padding-left:1.15rem;font-size:.84rem}.cep-round-note{margin:8px 0 0;font-size:.78rem;color:var(--text-secondary)}.cep-total-block{text-align:center;padding:16px;border:2px solid var(--elite-red);border-radius:var(--radius-sm);background:var(--elite-red-soft)}.cep-total-label{margin:0;font-size:.82rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary)}.cep-total-value{margin:6px 0 0;font-size:2rem;font-weight:800;color:var(--elite-red)}.cep-terms ul{margin:0;padding-left:1.2rem;font-size:.84rem;line-height:1.5}", Rh = "@media print{.cep-header{margin-bottom:5px;padding-bottom:5px}.cep-logo{width:88px}.cep-title{font-size:12pt;line-height:1.15}.cep-date{font-size:7.5pt}.cep-section{margin-bottom:3px;page-break-inside:auto;break-inside:auto}.cep-section-compact{margin-bottom:2px}.cep-h2{font-size:6.5pt;margin-bottom:2px}.cep-h3{font-size:7pt;margin-bottom:1px}.cep-overview-grid{padding:4px 6px;gap:2px 8px}.cep-overview-item dt{font-size:5.5pt}.cep-overview-item dd{font-size:6.5pt}.cep-table-compact{font-size:7pt}.cep-table-compact th,.cep-table-compact td{padding:1px 4px}.cep-breakdown{page-break-inside:auto!important;break-inside:auto}.cep-breakdown .cep-muted{margin-bottom:2px;font-size:6.5pt;line-height:1.25}.cep-material-group{margin-bottom:3px;page-break-inside:avoid;break-inside:avoid}.cep-material-scope-foot td{font-size:6pt}.cep-group-material-label{font-size:5.25pt;margin-bottom:0}.cep-group-material-value{font-size:7pt}.cep-vanity-group-amt{font-size:6pt;margin-top:1px}.cep-estimate-summary{page-break-inside:avoid;break-inside:avoid;padding:5px 7px 3px}.cep-summary-total-value{font-size:10pt}.cep-round-note{margin-top:2px;font-size:6pt;line-height:1.25}.cep-comparison-print{page-break-inside:auto;break-inside:auto;padding:2px 4px!important;margin-bottom:2px}.cep-comparison-table-print{font-size:6pt}.cep-comparison-table-print th,.cep-comparison-table-print td{padding:1px 3px!important;line-height:1.15}.cep-comparison-print .cep-comparison-note{margin-bottom:2px;font-size:6pt!important;line-height:1.2}.cep-closing{margin-top:4px;padding-top:4px;page-break-inside:auto;break-inside:auto}.cep-footer-terms-sig{page-break-inside:avoid;break-inside:avoid}.cep-terms-box{padding:4px 6px}.cep-terms-list{font-size:6.25pt;line-height:1.28}.cep-terms-list li{margin-bottom:0}.cep-signature-block{margin:4px 0;padding:3px 0 2px}.cep-sig-line-inline{grid-template-columns:auto minmax(1.5rem,1fr) auto 4.25rem;column-gap:6px;margin-bottom:5px}.cep-sig-role{font-size:6.25pt}.cep-sig-under{border-bottom-width:1.25px}.cep-sig-under-date{max-width:4.25rem}.cep-branches{gap:4px;margin-bottom:3px;margin-top:2px}.cep-branch{font-size:6pt;line-height:1.28}.cep-website{font-size:6.5pt;margin-top:2px}}", Ch = ".customer-estimate-print{width:100%;max-width:100%;box-sizing:border-box}.cep-closing{width:100%;max-width:100%}.cep-footer-terms-sig,.cep-signature-block,.cep-sig-line-inline{width:100%;max-width:100%;box-sizing:border-box}.cep-sig-role{white-space:nowrap;word-break:normal}.cep-branches{width:100%;max-width:100%;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;box-sizing:border-box}.cep-branch{min-width:0;white-space:normal;word-break:normal;overflow-wrap:normal}.cep-branch strong,.cep-branch span{display:block;white-space:normal;word-break:normal}.cep-website{width:100%;white-space:nowrap}.cep-table{width:100%;table-layout:auto}.cep-overview-grid{width:100%;box-sizing:border-box}";
function tc(fe) {
  return fe && typeof fe == "object" ? fe : null;
}
function kt(fe, ce = "") {
  return String(fe ?? "").trim() || ce;
}
function af(fe) {
  return !!fe;
}
function Ma(fe, ce = 0) {
  const W = Number(fe);
  return Number.isFinite(W) ? W : ce;
}
function mh(fe) {
  const ce = tc(fe);
  if (!ce) return null;
  const W = tc(ce.header), ke = tc(ce.display);
  if (!W || !ke) return null;
  const nn = kt(W.quoteNumber);
  if (!nn) return null;
  const ye = Array.isArray(ke.estimateSummaryRows) ? ke.estimateSummaryRows.map((A) => {
    const D = tc(A);
    return {
      key: kt(D?.key, "row"),
      label: kt(D?.label),
      displayAmount: Ma(D?.displayAmount)
    };
  }) : [], Oe = Array.isArray(ke.roomAreaPrintRows) ? ke.roomAreaPrintRows.map((A) => {
    const D = tc(A), Ae = Array.isArray(D?.addonLines) ? D.addonLines.map((ft) => ({ label: kt(tc(ft)?.label) })) : [], ee = Array.isArray(D?.customerCustomLines) ? D.customerCustomLines.map((ft) => {
      const tr = tc(ft);
      return {
        lineKey: kt(tr?.lineKey) || void 0,
        name: kt(tr?.name),
        amountExact: Ma(tr?.amountExact)
      };
    }) : [], X = Array.isArray(D?.customerNoteLines) ? D.customerNoteLines.map((ft) => kt(ft)).filter(Boolean) : [];
    return {
      roomId: kt(D?.roomId, "room"),
      displayName: kt(D?.displayName),
      isVanity: af(D?.isVanity),
      vanityProgramLabel: kt(D?.vanityProgramLabel) || void 0,
      materialGroup: kt(D?.materialGroup),
      colorLabel: kt(D?.colorLabel) || void 0,
      displayedMaterial: Ma(D?.displayedMaterial),
      displayedAddOns: Ma(D?.displayedAddOns),
      displayedAreaTotal: Ma(D?.displayedAreaTotal),
      addonLines: Ae,
      customerCustomLines: ee,
      customerNoteLines: X
    };
  }) : [];
  let Tn = null;
  const Re = tc(ke.roomComparisonTable);
  if (Re && Array.isArray(Re.roomBlocks)) {
    const A = Re.roomBlocks.map((ee) => {
      const X = tc(ee), ft = Array.isArray(X?.groupBlocks) ? X.groupBlocks.map((tr) => {
        const Yt = tc(tr);
        return {
          group: kt(Yt?.group),
          colorLabel: kt(Yt?.colorLabel) || void 0,
          countertopDisplay: Ma(Yt?.countertopDisplay),
          backsplashDisplay: Ma(Yt?.backsplashDisplay),
          fhbDisplay: Ma(Yt?.fhbDisplay),
          addonsDisplay: Ma(Yt?.addonsDisplay),
          roomTotalDisplay: Ma(Yt?.roomTotalDisplay)
        };
      }) : [];
      return {
        roomId: kt(X?.roomId, "room"),
        roomDisplayName: kt(X?.roomDisplayName),
        isVanity: af(X?.isVanity),
        groupBlocks: ft
      };
    }), D = tc(Re.projectDisplayTotals) != null ? Object.fromEntries(
      Object.entries(tc(Re.projectDisplayTotals)).map(([ee, X]) => [ee, Ma(X)])
    ) : {}, Ae = Array.isArray(Re.selectedGroups) ? Re.selectedGroups.map((ee) => {
      const X = tc(ee);
      return {
        group: kt(X?.group),
        colorLabel: kt(X?.colorLabel) || void 0
      };
    }) : [];
    Tn = {
      roomBlocks: A,
      roomRows: Array.isArray(Re.roomRows) ? Re.roomRows : [],
      projectDisplayTotals: D,
      selectedGroups: Ae,
      isPerRoomMode: af(Re.isPerRoomMode)
    };
  }
  const ie = Array.isArray(ke.customerFacingNoteLines) ? ke.customerFacingNoteLines.map((A) => kt(A)).filter(Boolean) : [], Be = {
    estimateSummaryRows: ye,
    finalRounded: Ma(ke.finalRounded),
    showRoomBreakdown: af(ke.showRoomBreakdown),
    roomAreaPrintRows: Oe,
    unassignedExact: Ma(ke.unassignedExact),
    unassignedDisplayTotal: Ma(ke.unassignedDisplayTotal),
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
    preparedBy: Be.preparedByDisplayName,
    quoteNumber: nn,
    primaryGroup: kt(W.primaryGroup),
    primaryColorLabel: kt(W.primaryColorLabel),
    colorTbd: af(W.colorTbd),
    estimateTotalExact: Ma(ce.finalRounded),
    customerDisplay: Be,
    estimateDate: kt(W.estimateDate)
  };
}
function kh(fe) {
  const ce = mh(fe);
  return ce ? fh.renderToStaticMarkup(/* @__PURE__ */ q.jsx(xh, { ...ce })) : "";
}
function Sh(fe) {
  const ce = kh(fe);
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
    ${Eh}
    ${Rh}
    ${Ch}
  </style>
</head>
<body>${ce}</body>
</html>`;
}
export {
  Sh as buildCustomerEstimatePrintHtml,
  kh as renderCustomerEstimateDocumentMarkup
};
