function jf(ge) {
  return ge && ge.__esModule && Object.prototype.hasOwnProperty.call(ge, "default") ? ge.default : ge;
}
var hf = { exports: {} }, nf = {};
var Df;
function qf() {
  if (Df) return nf;
  Df = 1;
  var ge = /* @__PURE__ */ Symbol.for("react.transitional.element"), ue = /* @__PURE__ */ Symbol.for("react.fragment");
  function W(Ae, ve, Se) {
    var nn = null;
    if (Se !== void 0 && (nn = "" + Se), ve.key !== void 0 && (nn = "" + ve.key), "key" in ve) {
      Se = {};
      for (var On in ve)
        On !== "key" && (Se[On] = ve[On]);
    } else Se = ve;
    return ve = Se.ref, {
      $$typeof: ge,
      type: Ae,
      key: nn,
      ref: ve !== void 0 ? ve : null,
      props: Se
    };
  }
  return nf.Fragment = ue, nf.jsx = W, nf.jsxs = W, nf;
}
var tf = {}, df = { exports: {} }, gn = {};
var Nf;
function $f() {
  if (Nf) return gn;
  Nf = 1;
  var ge = /* @__PURE__ */ Symbol.for("react.transitional.element"), ue = /* @__PURE__ */ Symbol.for("react.portal"), W = /* @__PURE__ */ Symbol.for("react.fragment"), Ae = /* @__PURE__ */ Symbol.for("react.strict_mode"), ve = /* @__PURE__ */ Symbol.for("react.profiler"), Se = /* @__PURE__ */ Symbol.for("react.consumer"), nn = /* @__PURE__ */ Symbol.for("react.context"), On = /* @__PURE__ */ Symbol.for("react.forward_ref"), Re = /* @__PURE__ */ Symbol.for("react.suspense"), ie = /* @__PURE__ */ Symbol.for("react.memo"), He = /* @__PURE__ */ Symbol.for("react.lazy"), P = /* @__PURE__ */ Symbol.for("react.activity"), N = Symbol.iterator;
  function Fe(T) {
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
  }, X = Object.assign, ht = {};
  function rr(T, Y, we) {
    this.props = T, this.context = Y, this.refs = ht, this.updater = we || ee;
  }
  rr.prototype.isReactComponent = {}, rr.prototype.setState = function(T, Y) {
    if (typeof T != "object" && typeof T != "function" && T != null)
      throw Error(
        "takes an object of state variables to update or a function which returns an object of state variables."
      );
    this.updater.enqueueSetState(this, T, Y, "setState");
  }, rr.prototype.forceUpdate = function(T) {
    this.updater.enqueueForceUpdate(this, T, "forceUpdate");
  };
  function Ot() {
  }
  Ot.prototype = rr.prototype;
  function vl(T, Y, we) {
    this.props = T, this.context = Y, this.refs = ht, this.updater = we || ee;
  }
  var Kt = vl.prototype = new Ot();
  Kt.constructor = vl, X(Kt, rr.prototype), Kt.isPureReactComponent = !0;
  var Vn = Array.isArray;
  function Ie() {
  }
  var Ve = { H: null, A: null, T: null, S: null }, Rt = Object.prototype.hasOwnProperty;
  function rn(T, Y, we) {
    var Te = we.ref;
    return {
      $$typeof: ge,
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
    return typeof T == "object" && T !== null && T.$$typeof === ge;
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
  function Pe(T) {
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
    var _e = typeof T;
    (_e === "undefined" || _e === "boolean") && (T = null);
    var ke = !1;
    if (T === null) ke = !0;
    else
      switch (_e) {
        case "bigint":
        case "string":
        case "number":
          ke = !0;
          break;
        case "object":
          switch (T.$$typeof) {
            case ge:
            case ue:
              ke = !0;
              break;
            case He:
              return ke = T._init, J(
                ke(T._payload),
                Y,
                we,
                Te,
                me
              );
          }
      }
    if (ke)
      return me = me(T), ke = Te === "" ? "." + nt(T, 0) : Te, Vn(me) ? (we = "", ke != null && (we = ke.replace(qr, "$&/") + "/"), J(me, Y, we, "", function(tt) {
        return tt;
      })) : me != null && (si(me) && (me = Kn(
        me,
        we + (me.key == null || T && T.key === me.key ? "" : ("" + me.key).replace(
          qr,
          "$&/"
        ) + "/") + ke
      )), Y.push(me)), 1;
    ke = 0;
    var Ct = Te === "" ? "." : Te + ":";
    if (Vn(T))
      for (var En = 0; En < T.length; En++)
        Te = T[En], _e = Ct + nt(Te, En), ke += J(
          Te,
          Y,
          we,
          _e,
          me
        );
    else if (En = Fe(T), typeof En == "function")
      for (T = En.call(T), En = 0; !(Te = T.next()).done; )
        Te = Te.value, _e = Ct + nt(Te, En++), ke += J(
          Te,
          Y,
          we,
          _e,
          me
        );
    else if (_e === "object") {
      if (typeof T.then == "function")
        return J(
          Pe(T),
          Y,
          we,
          Te,
          me
        );
      throw Y = String(T), Error(
        "Objects are not valid as a React child (found: " + (Y === "[object Object]" ? "object with keys {" + Object.keys(T).join(", ") + "}" : Y) + "). If you meant to render a collection of children, use an array instead."
      );
    }
    return ke;
  }
  function he(T, Y, we) {
    if (T == null) return T;
    var Te = [], me = 0;
    return J(T, Te, "", "", function(_e) {
      return Y.call(we, _e, me++);
    }), Te;
  }
  function xr(T) {
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
  var yl = typeof reportError == "function" ? reportError : function(T) {
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
  return gn.Activity = P, gn.Children = fe, gn.Component = rr, gn.Fragment = W, gn.Profiler = ve, gn.PureComponent = vl, gn.StrictMode = Ae, gn.Suspense = Re, gn.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = Ve, gn.__COMPILER_RUNTIME = {
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
      for (_e in Y.key !== void 0 && (me = "" + Y.key), Y)
        !Rt.call(Y, _e) || _e === "key" || _e === "__self" || _e === "__source" || _e === "ref" && Y.ref === void 0 || (Te[_e] = Y[_e]);
    var _e = arguments.length - 2;
    if (_e === 1) Te.children = we;
    else if (1 < _e) {
      for (var ke = Array(_e), Ct = 0; Ct < _e; Ct++)
        ke[Ct] = arguments[Ct + 2];
      Te.children = ke;
    }
    return rn(T.type, me, Te);
  }, gn.createContext = function(T) {
    return T = {
      $$typeof: nn,
      _currentValue: T,
      _currentValue2: T,
      _threadCount: 0,
      Provider: null,
      Consumer: null
    }, T.Provider = T, T.Consumer = {
      $$typeof: Se,
      _context: T
    }, T;
  }, gn.createElement = function(T, Y, we) {
    var Te, me = {}, _e = null;
    if (Y != null)
      for (Te in Y.key !== void 0 && (_e = "" + Y.key), Y)
        Rt.call(Y, Te) && Te !== "key" && Te !== "__self" && Te !== "__source" && (me[Te] = Y[Te]);
    var ke = arguments.length - 2;
    if (ke === 1) me.children = we;
    else if (1 < ke) {
      for (var Ct = Array(ke), En = 0; En < ke; En++)
        Ct[En] = arguments[En + 2];
      me.children = Ct;
    }
    if (T && T.defaultProps)
      for (Te in ke = T.defaultProps, ke)
        me[Te] === void 0 && (me[Te] = ke[Te]);
    return rn(T, _e, me);
  }, gn.createRef = function() {
    return { current: null };
  }, gn.forwardRef = function(T) {
    return { $$typeof: On, render: T };
  }, gn.isValidElement = si, gn.lazy = function(T) {
    return {
      $$typeof: He,
      _payload: { _status: -1, _result: T },
      _init: xr
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
      me !== null && me(we, Te), typeof Te == "object" && Te !== null && typeof Te.then == "function" && Te.then(Ie, yl);
    } catch (_e) {
      yl(_e);
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
  return Lf || (Lf = 1, (function(ge, ue) {
    process.env.NODE_ENV !== "production" && (function() {
      function W(R, L) {
        Object.defineProperty(Se.prototype, R, {
          get: function() {
            console.warn(
              "%s(...) is deprecated in plain JavaScript React classes. %s",
              L[0],
              L[1]
            );
          }
        });
      }
      function Ae(R) {
        return R === null || typeof R != "object" ? null : (R = Da && R[Da] || R["@@iterator"], typeof R == "function" ? R : null);
      }
      function ve(R, L) {
        R = (R = R.constructor) && (R.displayName || R.name) || "ReactClass";
        var ne = R + "." + L;
        Ge[ne] || (console.error(
          "Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.",
          L,
          R
        ), Ge[ne] = !0);
      }
      function Se(R, L, ne) {
        this.props = R, this.context = L, this.refs = kt, this.updater = ne || St;
      }
      function nn() {
      }
      function On(R, L, ne) {
        this.props = R, this.context = L, this.refs = kt, this.updater = ne || St;
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
          case ke:
            return "Suspense";
          case Ct:
            return "SuspenseList";
          case mt:
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
            case _e:
              var L = R.render;
              return R = R.displayName, R || (R = L.displayName || L.name || "", R = R !== "" ? "ForwardRef(" + R + ")" : "ForwardRef"), R;
            case En:
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
      function Fe() {
        var R = De.A;
        return R === null ? null : R.getOwner();
      }
      function ee() {
        return Error("react-stack-top-frame");
      }
      function X(R) {
        if (Er.call(R, "key")) {
          var L = Object.getOwnPropertyDescriptor(R, "key").get;
          if (L && L.isReactWarning) return !1;
        }
        return R.key !== void 0;
      }
      function ht(R, L) {
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
      function rr() {
        var R = P(this.type);
        return vn[R] || (vn[R] = !0, console.error(
          "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
        )), R = this.props.ref, R !== void 0 ? R : null;
      }
      function Ot(R, L, ne, Ee, Oe, ln) {
        var Ke = ne.ref;
        return R = {
          $$typeof: yl,
          type: R,
          key: L,
          props: ne,
          _owner: Ee
        }, (Ke !== void 0 ? Ke : null) !== null ? Object.defineProperty(R, "ref", {
          enumerable: !1,
          get: rr
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
          value: Oe
        }), Object.defineProperty(R, "_debugTask", {
          configurable: !1,
          enumerable: !1,
          writable: !0,
          value: ln
        }), Object.freeze && (Object.freeze(R.props), Object.freeze(R)), R;
      }
      function vl(R, L) {
        return L = Ot(
          R.type,
          L,
          R.props,
          R._owner,
          R._debugStack,
          R._debugTask
        ), R._store && (L._store.validated = R._store.validated), L;
      }
      function Kt(R) {
        Vn(R) ? R._store && (R._store.validated = 1) : typeof R == "object" && R !== null && R.$$typeof === tt && (R._payload.status === "fulfilled" ? Vn(R._payload.value) && R._payload.value._store && (R._payload.value._store.validated = 1) : R._store && (R._store.validated = 1));
      }
      function Vn(R) {
        return typeof R == "object" && R !== null && R.$$typeof === yl;
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
      function Rt(R) {
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
      function rn(R, L, ne, Ee, Oe) {
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
                case yl:
                case fe:
                  Ke = !0;
                  break;
                case tt:
                  return Ke = R._init, rn(
                    Ke(R._payload),
                    L,
                    ne,
                    Ee,
                    Oe
                  );
              }
          }
        if (Ke) {
          Ke = R, Oe = Oe(Ke);
          var an = Ee === "" ? "." + Ve(Ke, 0) : Ee;
          return Xl(Oe) ? (ne = "", an != null && (ne = an.replace(dt, "$&/") + "/"), rn(Oe, L, ne, "", function(Jl) {
            return Jl;
          })) : Oe != null && (Vn(Oe) && (Oe.key != null && (Ke && Ke.key === Oe.key || He(Oe.key)), ne = vl(
            Oe,
            ne + (Oe.key == null || Ke && Ke.key === Oe.key ? "" : ("" + Oe.key).replace(
              dt,
              "$&/"
            ) + "/") + an
          ), Ee !== "" && Ke != null && Vn(Ke) && Ke.key == null && Ke._store && !Ke._store.validated && (ne._store.validated = 2), Oe = ne), L.push(Oe)), 1;
        }
        if (Ke = 0, an = Ee === "" ? "." : Ee + ":", Xl(R))
          for (var We = 0; We < R.length; We++)
            Ee = R[We], ln = an + Ve(Ee, We), Ke += rn(
              Ee,
              L,
              ne,
              ln,
              Oe
            );
        else if (We = Ae(R), typeof We == "function")
          for (We === R.entries && (rc || console.warn(
            "Using Maps as children is not supported. Use an array of keyed ReactElements instead."
          ), rc = !0), R = We.call(R), We = 0; !(Ee = R.next()).done; )
            Ee = Ee.value, ln = an + Ve(Ee, We++), Ke += rn(
              Ee,
              L,
              ne,
              ln,
              Oe
            );
        else if (ln === "object") {
          if (typeof R.then == "function")
            return rn(
              Rt(R),
              L,
              ne,
              Ee,
              Oe
            );
          throw L = String(R), Error(
            "Objects are not valid as a React child (found: " + (L === "[object Object]" ? "object with keys {" + Object.keys(R).join(", ") + "}" : L) + "). If you meant to render a collection of children, use an array instead."
          );
        }
        return Ke;
      }
      function Kn(R, L, ne) {
        if (R == null) return R;
        var Ee = [], Oe = 0;
        return rn(R, Ee, "", "", function(ln) {
          return L.call(ne, ln, Oe++);
        }), Ee;
      }
      function si(R) {
        if (R._status === -1) {
          var L = R._ioInfo;
          L != null && (L.start = L.end = performance.now()), L = R._result;
          var ne = L();
          if (ne.then(
            function(Oe) {
              if (R._status === 0 || R._status === -1) {
                R._status = 1, R._result = Oe;
                var ln = R._ioInfo;
                ln != null && (ln.end = performance.now()), ne.status === void 0 && (ne.status = "fulfilled", ne.value = Oe);
              }
            },
            function(Oe) {
              if (R._status === 0 || R._status === -1) {
                R._status = 2, R._result = Oe;
                var ln = R._ioInfo;
                ln != null && (ln.end = performance.now()), ne.status === void 0 && (ne.status = "rejected", ne.reason = Oe);
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
            el = (ge && ge[L]).call(
              ge,
              "timers"
            ).setImmediate;
          } catch {
            el = function(Ee) {
              Eo === !1 && (Eo = !0, typeof MessageChannel > "u" && console.error(
                "This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning."
              ));
              var Oe = new MessageChannel();
              Oe.port1.onmessage = Ee, Oe.port2.postMessage(void 0);
            };
          }
        return el(R);
      }
      function Pe(R) {
        return 1 < R.length && typeof AggregateError == "function" ? new AggregateError(R) : R[0];
      }
      function J(R, L) {
        L !== oa - 1 && console.error(
          "You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. "
        ), oa = L;
      }
      function he(R, L, ne) {
        var Ee = De.actQueue;
        if (Ee !== null)
          if (Ee.length !== 0)
            try {
              xr(Ee), nt(function() {
                return he(R, L, ne);
              });
              return;
            } catch (Oe) {
              De.thrownErrors.push(Oe);
            }
          else De.actQueue = null;
        0 < De.thrownErrors.length ? (Ee = Pe(De.thrownErrors), De.thrownErrors.length = 0, ne(Ee)) : L(R);
      }
      function xr(R) {
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
          } catch (Oe) {
            R.splice(0, L + 1), De.thrownErrors.push(Oe);
          } finally {
            Zl = !1;
          }
        }
      }
      typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart == "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
      var yl = /* @__PURE__ */ Symbol.for("react.transitional.element"), fe = /* @__PURE__ */ Symbol.for("react.portal"), T = /* @__PURE__ */ Symbol.for("react.fragment"), Y = /* @__PURE__ */ Symbol.for("react.strict_mode"), we = /* @__PURE__ */ Symbol.for("react.profiler"), Te = /* @__PURE__ */ Symbol.for("react.consumer"), me = /* @__PURE__ */ Symbol.for("react.context"), _e = /* @__PURE__ */ Symbol.for("react.forward_ref"), ke = /* @__PURE__ */ Symbol.for("react.suspense"), Ct = /* @__PURE__ */ Symbol.for("react.suspense_list"), En = /* @__PURE__ */ Symbol.for("react.memo"), tt = /* @__PURE__ */ Symbol.for("react.lazy"), mt = /* @__PURE__ */ Symbol.for("react.activity"), Da = Symbol.iterator, Ge = {}, St = {
        isMounted: function() {
          return !1;
        },
        enqueueForceUpdate: function(R) {
          ve(R, "forceUpdate");
        },
        enqueueReplaceState: function(R) {
          ve(R, "replaceState");
        },
        enqueueSetState: function(R) {
          ve(R, "setState");
        }
      }, Tn = Object.assign, kt = {};
      Object.freeze(kt), Se.prototype.isReactComponent = {}, Se.prototype.setState = function(R, L) {
        if (typeof R != "object" && typeof R != "function" && R != null)
          throw Error(
            "takes an object of state variables to update or a function which returns an object of state variables."
          );
        this.updater.enqueueSetState(this, R, L, "setState");
      }, Se.prototype.forceUpdate = function(R) {
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
      nn.prototype = Se.prototype, Gt = On.prototype = new nn(), Gt.constructor = On, Tn(Gt, Se.prototype), Gt.isPureReactComponent = !0;
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
      }, Er = Object.prototype.hasOwnProperty, At = console.createTask ? console.createTask : function() {
        return null;
      };
      Gt = {
        react_stack_bottom_frame: function(R) {
          return R();
        }
      };
      var $r, Na, vn = {}, lr = Gt.react_stack_bottom_frame.bind(
        Gt,
        ee
      )(), _n = At(N(ee)), rc = !1, dt = /\/+/g, xo = typeof reportError == "function" ? reportError : function(R) {
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
      }, Eo = !1, el = null, oa = 0, fi = !1, Zl = !1, Ql = typeof queueMicrotask == "function" ? function(R) {
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
          if (!Vn(R))
            throw Error(
              "React.Children.only expected to receive a single React element child."
            );
          return R;
        }
      };
      ue.Activity = mt, ue.Children = bl, ue.Component = Se, ue.Fragment = T, ue.Profiler = we, ue.PureComponent = On, ue.StrictMode = Y, ue.Suspense = ke, ue.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = De, ue.__COMPILER_RUNTIME = Gt, ue.act = function(R) {
        var L = De.actQueue, ne = oa;
        oa++;
        var Ee = De.actQueue = L !== null ? L : [], Oe = !1;
        try {
          var ln = R();
        } catch (We) {
          De.thrownErrors.push(We);
        }
        if (0 < De.thrownErrors.length)
          throw J(L, ne), R = Pe(De.thrownErrors), De.thrownErrors.length = 0, R;
        if (ln !== null && typeof ln == "object" && typeof ln.then == "function") {
          var Ke = ln;
          return Ql(function() {
            Oe || fi || (fi = !0, console.error(
              "You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);"
            ));
          }), {
            then: function(We, Jl) {
              Oe = !0, Ke.then(
                function(nl) {
                  if (J(L, ne), ne === 0) {
                    try {
                      xr(Ee), nt(function() {
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
                      var gt = Pe(
                        De.thrownErrors
                      );
                      De.thrownErrors.length = 0, Jl(gt);
                    }
                  } else We(nl);
                },
                function(nl) {
                  J(L, ne), 0 < De.thrownErrors.length && (nl = Pe(
                    De.thrownErrors
                  ), De.thrownErrors.length = 0), Jl(nl);
                }
              );
            }
          };
        }
        var an = ln;
        if (J(L, ne), ne === 0 && (xr(Ee), Ee.length !== 0 && Ql(function() {
          Oe || fi || (fi = !0, console.error(
            "A component suspended inside an `act` scope, but the `act` call was not awaited. When testing React components that depend on asynchronous data, you must await the result:\n\nawait act(() => ...)"
          ));
        }), De.actQueue = null), 0 < De.thrownErrors.length)
          throw R = Pe(De.thrownErrors), De.thrownErrors.length = 0, R;
        return {
          then: function(We, Jl) {
            Oe = !0, ne === 0 ? (De.actQueue = Ee, nt(function() {
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
        var Ee = Tn({}, R.props), Oe = R.key, ln = R._owner;
        if (L != null) {
          var Ke;
          e: {
            if (Er.call(L, "ref") && (Ke = Object.getOwnPropertyDescriptor(
              L,
              "ref"
            ).get) && Ke.isReactWarning) {
              Ke = !1;
              break e;
            }
            Ke = L.ref !== void 0;
          }
          Ke && (ln = Fe()), X(L) && (He(L.key), Oe = "" + L.key);
          for (an in L)
            !Er.call(L, an) || an === "key" || an === "__self" || an === "__source" || an === "ref" && L.ref === void 0 || (Ee[an] = L[an]);
        }
        var an = arguments.length - 2;
        if (an === 1) Ee.children = ne;
        else if (1 < an) {
          Ke = Array(an);
          for (var We = 0; We < an; We++)
            Ke[We] = arguments[We + 2];
          Ee.children = Ke;
        }
        for (Ee = Ot(
          R.type,
          Oe,
          Ee,
          ln,
          R._debugStack,
          R._debugTask
        ), Oe = 2; Oe < arguments.length; Oe++)
          Kt(arguments[Oe]);
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
          Kt(arguments[Ee]);
        Ee = {};
        var Oe = null;
        if (L != null)
          for (We in Na || !("__self" in L) || "key" in L || (Na = !0, console.warn(
            "Your app (or one of its dependencies) is using an outdated JSX transform. Update to the modern JSX transform for faster performance: https://react.dev/link/new-jsx-transform"
          )), X(L) && (He(L.key), Oe = "" + L.key), L)
            Er.call(L, We) && We !== "key" && We !== "__self" && We !== "__source" && (Ee[We] = L[We]);
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
        Oe && ht(
          Ee,
          typeof R == "function" ? R.displayName || R.name || "Unknown" : R
        );
        var We = 1e4 > De.recentlyCreatedOwnerStacks++;
        return Ot(
          R,
          Oe,
          Ee,
          Fe(),
          We ? Error("react-stack-top-frame") : lr,
          We ? At(N(R)) : _n
        );
      }, ue.createRef = function() {
        var R = { current: null };
        return Object.seal(R), R;
      }, ue.forwardRef = function(R) {
        R != null && R.$$typeof === En ? console.error(
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
        var L = { $$typeof: _e, render: R }, ne;
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
          $$typeof: En,
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
          var Ee = R(), Oe = De.S;
          Oe !== null && Oe(ne, Ee), typeof Ee == "object" && Ee !== null && typeof Ee.then == "function" && (De.asyncTransitions++, Ee.then(qr, qr), Ee.then(Re, xo));
        } catch (ln) {
          xo(ln);
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
var _f;
function Ms() {
  return _f || (_f = 1, process.env.NODE_ENV === "production" ? df.exports = $f() : df.exports = eh()), df.exports;
}
var Bf;
function nh() {
  return Bf || (Bf = 1, process.env.NODE_ENV !== "production" && (function() {
    function ge(T) {
      if (T == null) return null;
      if (typeof T == "function")
        return T.$$typeof === si ? null : T.displayName || T.name || null;
      if (typeof T == "string") return T;
      switch (T) {
        case ht:
          return "Fragment";
        case Ot:
          return "Profiler";
        case rr:
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
          case Kt:
            return T.displayName || "Context";
          case vl:
            return (T._context.displayName || "Context") + ".Consumer";
          case Vn:
            var Y = T.render;
            return T = T.displayName, T || (T = Y.displayName || Y.name || "", T = T !== "" ? "ForwardRef(" + T + ")" : "ForwardRef"), T;
          case Rt:
            return Y = T.displayName || null, Y !== null ? Y : ge(T.type) || "Memo";
          case rn:
            Y = T._payload, T = T._init;
            try {
              return ge(T(Y));
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
    function Ae(T) {
      if (T === ht) return "<>";
      if (typeof T == "object" && T !== null && T.$$typeof === rn)
        return "<...>";
      try {
        var Y = ge(T);
        return Y ? "<" + Y + ">" : "<...>";
      } catch {
        return "<...>";
      }
    }
    function ve() {
      var T = Ln.A;
      return T === null ? null : T.getOwner();
    }
    function Se() {
      return Error("react-stack-top-frame");
    }
    function nn(T) {
      if (qr.call(T, "key")) {
        var Y = Object.getOwnPropertyDescriptor(T, "key").get;
        if (Y && Y.isReactWarning) return !1;
      }
      return T.key !== void 0;
    }
    function On(T, Y) {
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
      var T = ge(this.type);
      return he[T] || (he[T] = !0, console.error(
        "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
      )), T = this.props.ref, T !== void 0 ? T : null;
    }
    function ie(T, Y, we, Te, me, _e) {
      var ke = we.ref;
      return T = {
        $$typeof: ee,
        type: T,
        key: Y,
        props: we,
        _owner: Te
      }, (ke !== void 0 ? ke : null) !== null ? Object.defineProperty(T, "ref", {
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
        value: _e
      }), Object.freeze && (Object.freeze(T.props), Object.freeze(T)), T;
    }
    function He(T, Y, we, Te, me, _e) {
      var ke = Y.children;
      if (ke !== void 0)
        if (Te)
          if (nt(ke)) {
            for (Te = 0; Te < ke.length; Te++)
              P(ke[Te]);
            Object.freeze && Object.freeze(ke);
          } else
            console.error(
              "React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead."
            );
        else P(ke);
      if (qr.call(Y, "key")) {
        ke = ge(T);
        var Ct = Object.keys(Y).filter(function(tt) {
          return tt !== "key";
        });
        Te = 0 < Ct.length ? "{key: someKey, " + Ct.join(": ..., ") + ": ...}" : "{key: someKey}", fe[ke + Te] || (Ct = 0 < Ct.length ? "{" + Ct.join(": ..., ") + ": ...}" : "{}", console.error(
          `A props object containing a "key" prop is being spread into JSX:
  let props = %s;
  <%s {...props} />
React keys must be passed directly to JSX without using spread:
  let props = %s;
  <%s key={someKey} {...props} />`,
          Te,
          ke,
          Ct,
          ke
        ), fe[ke + Te] = !0);
      }
      if (ke = null, we !== void 0 && (W(we), ke = "" + we), nn(Y) && (W(Y.key), ke = "" + Y.key), "key" in Y) {
        we = {};
        for (var En in Y)
          En !== "key" && (we[En] = Y[En]);
      } else we = Y;
      return ke && On(
        we,
        typeof T == "function" ? T.displayName || T.name || "Unknown" : T
      ), ie(
        T,
        ke,
        we,
        ve(),
        me,
        _e
      );
    }
    function P(T) {
      N(T) ? T._store && (T._store.validated = 1) : typeof T == "object" && T !== null && T.$$typeof === rn && (T._payload.status === "fulfilled" ? N(T._payload.value) && T._payload.value._store && (T._payload.value._store.validated = 1) : T._store && (T._store.validated = 1));
    }
    function N(T) {
      return typeof T == "object" && T !== null && T.$$typeof === ee;
    }
    var Fe = Ms(), ee = /* @__PURE__ */ Symbol.for("react.transitional.element"), X = /* @__PURE__ */ Symbol.for("react.portal"), ht = /* @__PURE__ */ Symbol.for("react.fragment"), rr = /* @__PURE__ */ Symbol.for("react.strict_mode"), Ot = /* @__PURE__ */ Symbol.for("react.profiler"), vl = /* @__PURE__ */ Symbol.for("react.consumer"), Kt = /* @__PURE__ */ Symbol.for("react.context"), Vn = /* @__PURE__ */ Symbol.for("react.forward_ref"), Ie = /* @__PURE__ */ Symbol.for("react.suspense"), Ve = /* @__PURE__ */ Symbol.for("react.suspense_list"), Rt = /* @__PURE__ */ Symbol.for("react.memo"), rn = /* @__PURE__ */ Symbol.for("react.lazy"), Kn = /* @__PURE__ */ Symbol.for("react.activity"), si = /* @__PURE__ */ Symbol.for("react.client.reference"), Ln = Fe.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, qr = Object.prototype.hasOwnProperty, nt = Array.isArray, Pe = console.createTask ? console.createTask : function() {
      return null;
    };
    Fe = {
      react_stack_bottom_frame: function(T) {
        return T();
      }
    };
    var J, he = {}, xr = Fe.react_stack_bottom_frame.bind(
      Fe,
      Se
    )(), yl = Pe(Ae(Se)), fe = {};
    tf.Fragment = ht, tf.jsx = function(T, Y, we) {
      var Te = 1e4 > Ln.recentlyCreatedOwnerStacks++;
      return He(
        T,
        Y,
        we,
        !1,
        Te ? Error("react-stack-top-frame") : xr,
        Te ? Pe(Ae(T)) : yl
      );
    }, tf.jsxs = function(T, Y, we) {
      var Te = 1e4 > Ln.recentlyCreatedOwnerStacks++;
      return He(
        T,
        Y,
        we,
        !0,
        Te ? Error("react-stack-top-frame") : xr,
        Te ? Pe(Ae(T)) : yl
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
  var ge = Ms();
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
  var Ae = {
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
  }, ve = /* @__PURE__ */ Symbol.for("react.portal");
  function Se(Re, ie, He) {
    var P = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return {
      $$typeof: ve,
      key: P == null ? null : "" + P,
      children: Re,
      containerInfo: ie,
      implementation: He
    };
  }
  var nn = ge.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  function On(Re, ie) {
    if (Re === "font") return "";
    if (typeof ie == "string")
      return ie === "use-credentials" ? ie : "";
  }
  return la.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = Ae, la.createPortal = function(Re, ie) {
    var He = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
    if (!ie || ie.nodeType !== 1 && ie.nodeType !== 9 && ie.nodeType !== 11)
      throw Error(ue(299));
    return Se(Re, ie, null, He);
  }, la.flushSync = function(Re) {
    var ie = nn.T, He = Ae.p;
    try {
      if (nn.T = null, Ae.p = 2, Re) return Re();
    } finally {
      nn.T = ie, Ae.p = He, Ae.d.f();
    }
  }, la.preconnect = function(Re, ie) {
    typeof Re == "string" && (ie ? (ie = ie.crossOrigin, ie = typeof ie == "string" ? ie === "use-credentials" ? ie : "" : void 0) : ie = null, Ae.d.C(Re, ie));
  }, la.prefetchDNS = function(Re) {
    typeof Re == "string" && Ae.d.D(Re);
  }, la.preinit = function(Re, ie) {
    if (typeof Re == "string" && ie && typeof ie.as == "string") {
      var He = ie.as, P = On(He, ie.crossOrigin), N = typeof ie.integrity == "string" ? ie.integrity : void 0, Fe = typeof ie.fetchPriority == "string" ? ie.fetchPriority : void 0;
      He === "style" ? Ae.d.S(
        Re,
        typeof ie.precedence == "string" ? ie.precedence : void 0,
        {
          crossOrigin: P,
          integrity: N,
          fetchPriority: Fe
        }
      ) : He === "script" && Ae.d.X(Re, {
        crossOrigin: P,
        integrity: N,
        fetchPriority: Fe,
        nonce: typeof ie.nonce == "string" ? ie.nonce : void 0
      });
    }
  }, la.preinitModule = function(Re, ie) {
    if (typeof Re == "string")
      if (typeof ie == "object" && ie !== null) {
        if (ie.as == null || ie.as === "script") {
          var He = On(
            ie.as,
            ie.crossOrigin
          );
          Ae.d.M(Re, {
            crossOrigin: He,
            integrity: typeof ie.integrity == "string" ? ie.integrity : void 0,
            nonce: typeof ie.nonce == "string" ? ie.nonce : void 0
          });
        }
      } else ie == null && Ae.d.M(Re);
  }, la.preload = function(Re, ie) {
    if (typeof Re == "string" && typeof ie == "object" && ie !== null && typeof ie.as == "string") {
      var He = ie.as, P = On(He, ie.crossOrigin);
      Ae.d.L(Re, He, {
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
        var He = On(ie.as, ie.crossOrigin);
        Ae.d.m(Re, {
          as: typeof ie.as == "string" && ie.as !== "script" ? ie.as : void 0,
          crossOrigin: He,
          integrity: typeof ie.integrity == "string" ? ie.integrity : void 0
        });
      } else Ae.d.m(Re);
  }, la.requestFormReset = function(Re) {
    Ae.d.r(Re);
  }, la.unstable_batchedUpdates = function(Re, ie) {
    return Re(ie);
  }, la.useFormState = function(Re, ie, He) {
    return nn.H.useFormState(Re, ie, He);
  }, la.useFormStatus = function() {
    return nn.H.useHostTransitionStatus();
  }, la.version = "19.2.6", la;
}
var ia = {};
var Uf;
function lh() {
  return Uf || (Uf = 1, process.env.NODE_ENV !== "production" && (function() {
    function ge() {
    }
    function ue(P) {
      return "" + P;
    }
    function W(P, N, Fe) {
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
        implementation: Fe
      };
    }
    function Ae(P, N) {
      if (P === "font") return "";
      if (typeof N == "string")
        return N === "use-credentials" ? N : "";
    }
    function ve(P) {
      return P === null ? "`null`" : P === void 0 ? "`undefined`" : P === "" ? "an empty string" : 'something with type "' + typeof P + '"';
    }
    function Se(P) {
      return P === null ? "`null`" : P === void 0 ? "`undefined`" : P === "" ? "an empty string" : typeof P == "string" ? JSON.stringify(P) : typeof P == "number" ? "`" + P + "`" : 'something with type "' + typeof P + '"';
    }
    function nn() {
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
    var On = Ms(), Re = {
      d: {
        f: ge,
        r: function() {
          throw Error(
            "Invalid form element. requestFormReset must be passed a form that was rendered by React."
          );
        },
        D: ge,
        C: ge,
        L: ge,
        m: ge,
        X: ge,
        S: ge,
        M: ge
      },
      p: 0,
      findDOMNode: null
    }, ie = /* @__PURE__ */ Symbol.for("react.portal"), He = On.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    typeof Map == "function" && Map.prototype != null && typeof Map.prototype.forEach == "function" && typeof Set == "function" && Set.prototype != null && typeof Set.prototype.clear == "function" && typeof Set.prototype.forEach == "function" || console.error(
      "React depends on Map and Set built-in types. Make sure that you load a polyfill in older browsers. https://reactjs.org/link/react-polyfills"
    ), ia.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = Re, ia.createPortal = function(P, N) {
      var Fe = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
      if (!N || N.nodeType !== 1 && N.nodeType !== 9 && N.nodeType !== 11)
        throw Error("Target container is not a DOM element.");
      return W(P, N, null, Fe);
    }, ia.flushSync = function(P) {
      var N = He.T, Fe = Re.p;
      try {
        if (He.T = null, Re.p = 2, P)
          return P();
      } finally {
        He.T = N, Re.p = Fe, Re.d.f() && console.error(
          "flushSync was called from inside a lifecycle method. React cannot flush when React is already rendering. Consider moving this call to a scheduler task or micro task."
        );
      }
    }, ia.preconnect = function(P, N) {
      typeof P == "string" && P ? N != null && typeof N != "object" ? console.error(
        "ReactDOM.preconnect(): Expected the `options` argument (second) to be an object but encountered %s instead. The only supported option at this time is `crossOrigin` which accepts a string.",
        Se(N)
      ) : N != null && typeof N.crossOrigin != "string" && console.error(
        "ReactDOM.preconnect(): Expected the `crossOrigin` option (second argument) to be a string but encountered %s instead. Try removing this option or passing a string value instead.",
        ve(N.crossOrigin)
      ) : console.error(
        "ReactDOM.preconnect(): Expected the `href` argument (first) to be a non-empty string but encountered %s instead.",
        ve(P)
      ), typeof P == "string" && (N ? (N = N.crossOrigin, N = typeof N == "string" ? N === "use-credentials" ? N : "" : void 0) : N = null, Re.d.C(P, N));
    }, ia.prefetchDNS = function(P) {
      if (typeof P != "string" || !P)
        console.error(
          "ReactDOM.prefetchDNS(): Expected the `href` argument (first) to be a non-empty string but encountered %s instead.",
          ve(P)
        );
      else if (1 < arguments.length) {
        var N = arguments[1];
        typeof N == "object" && N.hasOwnProperty("crossOrigin") ? console.error(
          "ReactDOM.prefetchDNS(): Expected only one argument, `href`, but encountered %s as a second argument instead. This argument is reserved for future options and is currently disallowed. It looks like the you are attempting to set a crossOrigin property for this DNS lookup hint. Browsers do not perform DNS queries using CORS and setting this attribute on the resource hint has no effect. Try calling ReactDOM.prefetchDNS() with just a single string argument, `href`.",
          Se(N)
        ) : console.error(
          "ReactDOM.prefetchDNS(): Expected only one argument, `href`, but encountered %s as a second argument instead. This argument is reserved for future options and is currently disallowed. Try calling ReactDOM.prefetchDNS() with just a single string argument, `href`.",
          Se(N)
        );
      }
      typeof P == "string" && Re.d.D(P);
    }, ia.preinit = function(P, N) {
      if (typeof P == "string" && P ? N == null || typeof N != "object" ? console.error(
        "ReactDOM.preinit(): Expected the `options` argument (second) to be an object with an `as` property describing the type of resource to be preinitialized but encountered %s instead.",
        Se(N)
      ) : N.as !== "style" && N.as !== "script" && console.error(
        'ReactDOM.preinit(): Expected the `as` property in the `options` argument (second) to contain a valid value describing the type of resource to be preinitialized but encountered %s instead. Valid values for `as` are "style" and "script".',
        Se(N.as)
      ) : console.error(
        "ReactDOM.preinit(): Expected the `href` argument (first) to be a non-empty string but encountered %s instead.",
        ve(P)
      ), typeof P == "string" && N && typeof N.as == "string") {
        var Fe = N.as, ee = Ae(Fe, N.crossOrigin), X = typeof N.integrity == "string" ? N.integrity : void 0, ht = typeof N.fetchPriority == "string" ? N.fetchPriority : void 0;
        Fe === "style" ? Re.d.S(
          P,
          typeof N.precedence == "string" ? N.precedence : void 0,
          {
            crossOrigin: ee,
            integrity: X,
            fetchPriority: ht
          }
        ) : Fe === "script" && Re.d.X(P, {
          crossOrigin: ee,
          integrity: X,
          fetchPriority: ht,
          nonce: typeof N.nonce == "string" ? N.nonce : void 0
        });
      }
    }, ia.preinitModule = function(P, N) {
      var Fe = "";
      typeof P == "string" && P || (Fe += " The `href` argument encountered was " + ve(P) + "."), N !== void 0 && typeof N != "object" ? Fe += " The `options` argument encountered was " + ve(N) + "." : N && "as" in N && N.as !== "script" && (Fe += " The `as` option encountered was " + Se(N.as) + "."), Fe ? console.error(
        "ReactDOM.preinitModule(): Expected up to two arguments, a non-empty `href` string and, optionally, an `options` object with a valid `as` property.%s",
        Fe
      ) : (Fe = N && typeof N.as == "string" ? N.as : "script", Fe) === "script" || (Fe = Se(Fe), console.error(
        'ReactDOM.preinitModule(): Currently the only supported "as" type for this function is "script" but received "%s" instead. This warning was generated for `href` "%s". In the future other module types will be supported, aligning with the import-attributes proposal. Learn more here: (https://github.com/tc39/proposal-import-attributes)',
        Fe,
        P
      )), typeof P == "string" && (typeof N == "object" && N !== null ? (N.as == null || N.as === "script") && (Fe = Ae(
        N.as,
        N.crossOrigin
      ), Re.d.M(P, {
        crossOrigin: Fe,
        integrity: typeof N.integrity == "string" ? N.integrity : void 0,
        nonce: typeof N.nonce == "string" ? N.nonce : void 0
      })) : N == null && Re.d.M(P));
    }, ia.preload = function(P, N) {
      var Fe = "";
      if (typeof P == "string" && P || (Fe += " The `href` argument encountered was " + ve(P) + "."), N == null || typeof N != "object" ? Fe += " The `options` argument encountered was " + ve(N) + "." : typeof N.as == "string" && N.as || (Fe += " The `as` option encountered was " + ve(N.as) + "."), Fe && console.error(
        'ReactDOM.preload(): Expected two arguments, a non-empty `href` string and an `options` object with an `as` property valid for a `<link rel="preload" as="..." />` tag.%s',
        Fe
      ), typeof P == "string" && typeof N == "object" && N !== null && typeof N.as == "string") {
        Fe = N.as;
        var ee = Ae(
          Fe,
          N.crossOrigin
        );
        Re.d.L(P, Fe, {
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
      var Fe = "";
      typeof P == "string" && P || (Fe += " The `href` argument encountered was " + ve(P) + "."), N !== void 0 && typeof N != "object" ? Fe += " The `options` argument encountered was " + ve(N) + "." : N && "as" in N && typeof N.as != "string" && (Fe += " The `as` option encountered was " + ve(N.as) + "."), Fe && console.error(
        'ReactDOM.preloadModule(): Expected two arguments, a non-empty `href` string and, optionally, an `options` object with an `as` property valid for a `<link rel="modulepreload" as="..." />` tag.%s',
        Fe
      ), typeof P == "string" && (N ? (Fe = Ae(
        N.as,
        N.crossOrigin
      ), Re.d.m(P, {
        as: typeof N.as == "string" && N.as !== "script" ? N.as : void 0,
        crossOrigin: Fe,
        integrity: typeof N.integrity == "string" ? N.integrity : void 0
      })) : Re.d.m(P));
    }, ia.requestFormReset = function(P) {
      Re.d.r(P);
    }, ia.unstable_batchedUpdates = function(P, N) {
      return P(N);
    }, ia.useFormState = function(P, N, Fe) {
      return nn().useFormState(P, N, Fe);
    }, ia.useFormStatus = function() {
      return nn().useHostTransitionStatus();
    }, ia.version = "19.2.6", typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop == "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
  })()), ia;
}
var Wf;
function yf() {
  if (Wf) return gf.exports;
  Wf = 1;
  function ge() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function")) {
      if (process.env.NODE_ENV !== "production")
        throw new Error("^_^");
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(ge);
      } catch (ue) {
        console.error(ue);
      }
    }
  }
  return process.env.NODE_ENV === "production" ? (ge(), gf.exports = rh()) : gf.exports = lh(), gf.exports;
}
var Yf;
function ih() {
  if (Yf) return rf;
  Yf = 1;
  var ge = Ms(), ue = yf();
  function W(i) {
    var o = "https://react.dev/errors/" + i;
    if (1 < arguments.length) {
      o += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var f = 2; f < arguments.length; f++)
        o += "&args[]=" + encodeURIComponent(arguments[f]);
    }
    return "Minified React error #" + i + "; visit " + o + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  var Ae = /* @__PURE__ */ Symbol.for("react.transitional.element"), ve = /* @__PURE__ */ Symbol.for("react.portal"), Se = /* @__PURE__ */ Symbol.for("react.fragment"), nn = /* @__PURE__ */ Symbol.for("react.strict_mode"), On = /* @__PURE__ */ Symbol.for("react.profiler"), Re = /* @__PURE__ */ Symbol.for("react.consumer"), ie = /* @__PURE__ */ Symbol.for("react.context"), He = /* @__PURE__ */ Symbol.for("react.forward_ref"), P = /* @__PURE__ */ Symbol.for("react.suspense"), N = /* @__PURE__ */ Symbol.for("react.suspense_list"), Fe = /* @__PURE__ */ Symbol.for("react.memo"), ee = /* @__PURE__ */ Symbol.for("react.lazy"), X = /* @__PURE__ */ Symbol.for("react.scope"), ht = /* @__PURE__ */ Symbol.for("react.activity"), rr = /* @__PURE__ */ Symbol.for("react.legacy_hidden"), Ot = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), vl = /* @__PURE__ */ Symbol.for("react.view_transition"), Kt = Symbol.iterator;
  function Vn(i) {
    return i === null || typeof i != "object" ? null : (i = Kt && i[Kt] || i["@@iterator"], typeof i == "function" ? i : null);
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
  var Rt = Object.assign, rn = Object.prototype.hasOwnProperty, Kn = RegExp(
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
  var xr = /([A-Z])/g, yl = /^ms-/, fe = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function T(i) {
    return fe.test("" + i) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : i;
  }
  var Y = ge.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, we = ue.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Te = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, me = we.d;
  we.d = {
    f: me.f,
    r: me.r,
    D: Vl,
    C: fr,
    L: _a,
    m: Wc,
    X: ts,
    S: Rr,
    M: Su
  };
  var _e = [], ke = null, Ct = /(<\/|<)(s)(cript)/gi;
  function En(i, o, f, g) {
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
  function mt(i, o, f, g) {
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
        return mt(2, null, g | 1, null);
      case "select":
        return mt(
          2,
          f.value != null ? f.value : f.defaultValue,
          g,
          null
        );
      case "svg":
        return mt(4, null, g, null);
      case "picture":
        return mt(2, null, g | 2, null);
      case "math":
        return mt(5, null, g, null);
      case "foreignObject":
        return mt(2, null, g, null);
      case "table":
        return mt(6, null, g, null);
      case "thead":
      case "tbody":
      case "tfoot":
        return mt(7, null, g, null);
      case "colgroup":
        return mt(9, null, g, null);
      case "tr":
        return mt(8, null, g, null);
      case "head":
        if (2 > i.insertionMode)
          return mt(3, null, g, null);
        break;
      case "html":
        if (i.insertionMode === 0)
          return mt(1, null, g, null);
    }
    return 6 <= i.insertionMode || 2 > i.insertionMode ? mt(2, null, g, null) : i.tagScope !== g ? mt(
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
  function St(i, o) {
    return o.tagScope & 32 && (i.instructions |= 128), mt(
      o.insertionMode,
      o.selectedValue,
      o.tagScope | 12,
      Ge(o.viewTransition)
    );
  }
  function Tn(i, o) {
    i = Ge(o.viewTransition);
    var f = o.tagScope | 16;
    return i !== null && i.share !== "none" && (f |= 64), mt(
      o.insertionMode,
      o.selectedValue,
      f,
      i
    );
  }
  var kt = /* @__PURE__ */ new Map();
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
            m = kt.get(g), m === void 0 && (m = he(
              g.replace(xr, "-$1").toLowerCase().replace(yl, "-ms-")
            ), kt.set(g, m)), p = typeof p == "number" ? p === 0 || nt.has(g) ? "" + p : p + "px" : he(("" + p).trim());
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
  function Er(i, o) {
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
        if ((!(2 < o.length) || o[0] !== "o" && o[0] !== "O" || o[1] !== "n" && o[1] !== "N") && (o = Pe.get(o) || o, qr(o))) {
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
  function lr(i, o, f) {
    if (o != null) {
      if (f != null) throw Error(W(60));
      if (typeof o != "object" || !("__html" in o))
        throw Error(W(61));
      o = o.__html, o != null && i.push("" + o);
    }
  }
  function _n(i) {
    var o = "";
    return ge.Children.forEach(i, function(f) {
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
  function dt(i, o) {
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
  var xo = /(<\/|<)(s)(tyle)/gi;
  function Eo(i, o, f, g) {
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
  function oa(i, o) {
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
    return i.push(">"), o = Array.isArray(f) ? 2 > f.length ? f[0] : null : f, typeof o != "function" && typeof o != "symbol" && o !== null && o !== void 0 && i.push(he("" + o)), lr(i, g, f), i.push(Oe("title")), null;
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
    return i.push(">"), lr(i, g, f), typeof f == "string" && i.push(("" + f).replace(Ct, En)), i.push(Oe("script")), null;
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
    return i.push(">"), lr(i, g, f), f;
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
    return i.push(">"), lr(i, g, f), typeof f == "string" ? (i.push(he(f)), null) : f;
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
            var ye = f[$];
            if (ye != null)
              switch ($) {
                case "children":
                  G = ye;
                  break;
                case "dangerouslySetInnerHTML":
                  re = ye;
                  break;
                case "href":
                  ye === "" ? Xt(i, "href", "") : vn(i, $, ye);
                  break;
                default:
                  vn(i, $, ye);
              }
          }
        if (i.push(">"), lr(i, re, G), typeof G == "string") {
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
        return i.push(">"), lr(i, Ze, on), on;
      case "option":
        var Xe = Q.selectedValue;
        i.push(L("option"));
        var at = null, cn = null, wn = null, Mn = null, en;
        for (en in f)
          if (rn.call(f, en)) {
            var yt = f[en];
            if (yt != null)
              switch (en) {
                case "children":
                  at = yt;
                  break;
                case "selected":
                  wn = yt;
                  break;
                case "dangerouslySetInnerHTML":
                  Mn = yt;
                  break;
                case "value":
                  cn = yt;
                default:
                  vn(
                    i,
                    en,
                    yt
                  );
              }
          }
        if (Xe != null) {
          var Sn = cn !== null ? "" + cn : _n(at);
          if (Ie(Xe)) {
            for (var Cr = 0; Cr < Xe.length; Cr++)
              if ("" + Xe[Cr] === Sn) {
                i.push(' selected=""');
                break;
              }
          } else
            "" + Xe === Sn && i.push(' selected=""');
        } else wn && i.push(' selected=""');
        return i.push(">"), lr(i, Mn, at), at;
      case "textarea":
        i.push(L("textarea"));
        var Dn = null, xn = null, kn = null, qe;
        for (qe in f)
          if (rn.call(f, qe)) {
            var An = f[qe];
            if (An != null)
              switch (qe) {
                case "children":
                  kn = An;
                  break;
                case "value":
                  Dn = An;
                  break;
                case "defaultValue":
                  xn = An;
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
        if (Dn === null && xn !== null && (Dn = xn), i.push(">"), kn != null) {
          if (Dn != null) throw Error(W(92));
          if (Ie(kn)) {
            if (1 < kn.length)
              throw Error(W(93));
            Dn = "" + kn[0];
          }
          Dn = "" + kn;
        }
        return typeof Dn == "string" && Dn[0] === `
` && i.push(`
`), Dn !== null && i.push(he("" + Dn)), null;
      case "input":
        i.push(L("input"));
        var $t = null, sn = null, pa = null, Zi = null, mr = null, Pl = null, Fl = null, Ol = null, Ei = null, Qi;
        for (Qi in f)
          if (rn.call(f, Qi)) {
            var Jt = f[Qi];
            if (Jt != null)
              switch (Qi) {
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(W(399, "input"));
                case "name":
                  $t = Jt;
                  break;
                case "formAction":
                  sn = Jt;
                  break;
                case "formEncType":
                  pa = Jt;
                  break;
                case "formMethod":
                  Zi = Jt;
                  break;
                case "formTarget":
                  mr = Jt;
                  break;
                case "defaultChecked":
                  Ei = Jt;
                  break;
                case "defaultValue":
                  Fl = Jt;
                  break;
                case "checked":
                  Ol = Jt;
                  break;
                case "value":
                  Pl = Jt;
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
          pa,
          Zi,
          mr,
          $t
        );
        return Ol !== null ? Xl(i, "checked", Ol) : Ei !== null && Xl(i, "checked", Ei), Pl !== null ? vn(i, "value", Pl) : Fl !== null && vn(i, "value", Fl), i.push("/>"), Va?.forEach(Er, i), null;
      case "button":
        i.push(L("button"));
        var Ka = null, xc = null, eu = null, Lo = null, Ta = null, Sr = null, Ec = null, kr;
        for (kr in f)
          if (rn.call(f, kr)) {
            var Cl = f[kr];
            if (Cl != null)
              switch (kr) {
                case "children":
                  Ka = Cl;
                  break;
                case "dangerouslySetInnerHTML":
                  xc = Cl;
                  break;
                case "name":
                  eu = Cl;
                  break;
                case "formAction":
                  Lo = Cl;
                  break;
                case "formEncType":
                  Ta = Cl;
                  break;
                case "formMethod":
                  Sr = Cl;
                  break;
                case "formTarget":
                  Ec = Cl;
                  break;
                default:
                  vn(
                    i,
                    kr,
                    Cl
                  );
              }
          }
        var Ji = Na(
          i,
          g,
          p,
          Lo,
          Ta,
          Sr,
          Ec,
          eu
        );
        if (i.push(">"), Ji?.forEach(Er, i), lr(i, xc, Ka), typeof Ka == "string") {
          i.push(he(Ka));
          var Rc = null;
        } else Rc = Ka;
        return Rc;
      case "form":
        i.push(L("form"));
        var Vi = null, nu = null, _t = null, Cc = null, xa = null, _o = null, ja;
        for (ja in f)
          if (rn.call(f, ja)) {
            var Mt = f[ja];
            if (Mt != null)
              switch (ja) {
                case "children":
                  Vi = Mt;
                  break;
                case "dangerouslySetInnerHTML":
                  nu = Mt;
                  break;
                case "action":
                  _t = Mt;
                  break;
                case "encType":
                  Cc = Mt;
                  break;
                case "method":
                  xa = Mt;
                  break;
                case "target":
                  _o = Mt;
                  break;
                default:
                  vn(
                    i,
                    ja,
                    Mt
                  );
              }
          }
        var ml = null, un = null;
        if (typeof _t == "function") {
          var Ki = $r(
            g,
            _t
          );
          Ki !== null ? (_t = Ki.action || "", Cc = Ki.encType, xa = Ki.method, _o = Ki.target, ml = Ki.data, un = Ki.name) : (i.push(
            " ",
            "action",
            '="',
            De,
            '"'
          ), _o = xa = Cc = _t = null, rc(g, p));
        }
        if (_t != null && vn(i, "action", _t), Cc != null && vn(i, "encType", Cc), xa != null && vn(i, "method", xa), _o != null && vn(i, "target", _o), i.push(">"), un !== null && (i.push('<input type="hidden"'), Xt(i, "name", un), i.push("/>"), ml?.forEach(Er, i)), lr(i, nu, Vi), typeof Vi == "string") {
          i.push(he(Vi));
          var Bo = null;
        } else Bo = Vi;
        return Bo;
      case "menuitem":
        i.push(L("menuitem"));
        for (var Ea in f)
          if (rn.call(f, Ea)) {
            var bt = f[Ea];
            if (bt != null)
              switch (Ea) {
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(W(400));
                default:
                  vn(
                    i,
                    Ea,
                    bt
                  );
              }
          }
        return i.push(">"), null;
      case "object":
        i.push(L("object"));
        var Zr = null, Ra = null, qa;
        for (qa in f)
          if (rn.call(f, qa)) {
            var Ml = f[qa];
            if (Ml != null)
              switch (qa) {
                case "children":
                  Zr = Ml;
                  break;
                case "dangerouslySetInnerHTML":
                  Ra = Ml;
                  break;
                case "data":
                  var gr = T("" + Ml);
                  if (gr === "") break;
                  i.push(
                    " ",
                    "data",
                    '="',
                    he(gr),
                    '"'
                  );
                  break;
                default:
                  vn(
                    i,
                    qa,
                    Ml
                  );
              }
          }
        if (i.push(">"), lr(i, Ra, Zr), typeof Zr == "string") {
          i.push(he(Zr));
          var zo = null;
        } else zo = Zr;
        return zo;
      case "title":
        var Ar = Q.tagScope & 1, _u = Q.tagScope & 4;
        if (Q.insertionMode === 4 || Ar || f.itemProp != null)
          var $a = oa(
            i,
            f
          );
        else
          _u ? $a = null : (oa(p.hoistableChunks, f), $a = void 0);
        return $a;
      case "link":
        var mc = Q.tagScope & 1, tu = Q.tagScope & 4, ru = f.rel, Ri = f.href, eo = f.precedence;
        if (Q.insertionMode === 4 || mc || f.itemProp != null || typeof ru != "string" || typeof Ri != "string" || Ri === "") {
          dt(i, f);
          var no = null;
        } else if (f.rel === "stylesheet")
          if (typeof eo != "string" || f.disabled != null || f.onLoad || f.onError)
            no = dt(
              i,
              f
            );
          else {
            var Pr = p.styles.get(eo), Sc = g.styleResources.hasOwnProperty(Ri) ? g.styleResources[Ri] : void 0;
            if (Sc !== null) {
              g.styleResources[Ri] = null, Pr || (Pr = {
                precedence: he(eo),
                rules: [],
                hrefs: [],
                sheets: /* @__PURE__ */ new Map()
              }, p.styles.set(eo, Pr));
              var kc = {
                state: 0,
                props: Rt({}, f, {
                  "data-precedence": f.precedence,
                  precedence: null
                })
              };
              if (Sc) {
                Sc.length === 2 && Yc(kc.props, Sc);
                var Bu = p.preloads.stylesheets.get(Ri);
                Bu && 0 < Bu.length ? Bu.length = 0 : kc.state = 1;
              }
              Pr.sheets.set(Ri, kc), A && A.stylesheets.add(kc);
            } else if (Pr) {
              var zu = Pr.sheets.get(Ri);
              zu && A && A.stylesheets.add(zu);
            }
            I && i.push("<!-- -->"), no = null;
          }
        else
          f.onLoad || f.onError ? no = dt(
            i,
            f
          ) : (I && i.push("<!-- -->"), no = tu ? null : dt(p.hoistableChunks, f));
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
              Pc.length === 2 && (au = Rt({}, f), Yc(au, Pc));
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
        var cu = Q.tagScope & 1, Ca = f.precedence, Il = f.href, us = f.nonce;
        if (Q.insertionMode === 4 || cu || f.itemProp != null || typeof Ca != "string" || typeof Il != "string" || Il === "") {
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
          var ma = Array.isArray(to) ? 2 > to.length ? to[0] : null : to;
          typeof ma != "function" && typeof ma != "symbol" && ma !== null && ma !== void 0 && i.push(("" + ma).replace(xo, Eo)), lr(i, Fc, to), i.push(Oe("style"));
          var Oc = null;
        } else {
          var Sa = p.styles.get(Ca);
          if ((g.styleResources.hasOwnProperty(Il) ? g.styleResources[Il] : void 0) !== null) {
            g.styleResources[Il] = null, Sa || (Sa = {
              precedence: he(Ca),
              rules: [],
              hrefs: [],
              sheets: /* @__PURE__ */ new Map()
            }, p.styles.set(Ca, Sa));
            var ss = p.nonce.style;
            if (!ss || ss === us) {
              Sa.hrefs.push(he(Il));
              var fs = Sa.rules, li = null, Uo = null, Sl;
              for (Sl in f)
                if (rn.call(f, Sl)) {
                  var ka = f[Sl];
                  if (ka != null)
                    switch (Sl) {
                      case "children":
                        li = ka;
                        break;
                      case "dangerouslySetInnerHTML":
                        Uo = ka;
                    }
                }
              var ro = Array.isArray(li) ? 2 > li.length ? li[0] : null : li;
              typeof ro != "function" && typeof ro != "symbol" && ro !== null && ro !== void 0 && fs.push(
                ("" + ro).replace(xo, Eo)
              ), lr(fs, Uo, li);
            }
          }
          Sa && A && A.styles.add(Sa), I && i.push("<!-- -->"), Oc = void 0;
        }
        return Oc;
      case "meta":
        var Dl = Q.tagScope & 1, Yu = Q.tagScope & 4;
        if (Q.insertionMode === 4 || Dl || f.itemProp != null)
          var hs = el(
            i,
            f,
            "meta"
          );
        else
          I && i.push("<!-- -->"), hs = Yu ? null : typeof f.charSet == "string" ? el(p.charsetChunks, f, "meta") : f.name === "viewport" ? el(p.viewportChunks, f, "meta") : el(p.hoistableChunks, f, "meta");
        return hs;
      case "listing":
      case "pre":
        i.push(L(o));
        var Wo = null, l = null, a;
        for (a in f)
          if (rn.call(f, a)) {
            var s = f[a];
            if (s != null)
              switch (a) {
                case "children":
                  Wo = s;
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
          if (Wo != null) throw Error(W(60));
          if (typeof l != "object" || !("__html" in l))
            throw Error(W(61));
          var v = l.__html;
          v != null && (typeof v == "string" && 0 < v.length && v[0] === `
` ? i.push(`
`, v) : i.push("" + v));
        }
        return typeof Wo == "string" && Wo[0] === `
` && i.push(`
`), Wo;
      case "img":
        var w = Q.tagScope & 3, C = f.src, S = f.srcSet;
        if (!(f.loading === "lazy" || !C && !S || typeof C != "string" && C != null || typeof S != "string" && S != null || f.fetchPriority === "low" || w) && (typeof C != "string" || C[4] !== ":" || C[0] !== "d" && C[0] !== "D" || C[1] !== "a" && C[1] !== "A" || C[2] !== "t" && C[2] !== "T" || C[3] !== "a" && C[3] !== "A") && (typeof S != "string" || S[4] !== ":" || S[0] !== "d" && S[0] !== "D" || S[1] !== "a" && S[1] !== "A" || S[2] !== "t" && S[2] !== "T" || S[3] !== "a" && S[3] !== "A")) {
          A !== null && Q.tagScope & 64 && (A.suspenseyImages = !0);
          var B = typeof f.sizes == "string" ? f.sizes : void 0, O = S ? S + `
` + (B || "") : C, z = p.preloads.images, Z = z.get(O);
          if (Z)
            (f.fetchPriority === "high" || 10 > p.highImagePreloads.size) && (z.delete(O), p.highImagePreloads.add(Z));
          else if (!g.imageResources.hasOwnProperty(O)) {
            g.imageResources[O] = _e;
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
            }), 0 <= (pe.remainingCapacity -= yn.length + 2)) ? (p.resets.image[O] = _e, pe.highImagePreloads && (pe.highImagePreloads += ", "), pe.highImagePreloads += yn) : (Z = [], dt(Z, {
              rel: "preload",
              as: "image",
              href: S ? void 0 : C,
              imageSrcSet: S,
              imageSizes: B,
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
          var wt = m || p.preamble;
          if (wt.bodyChunks)
            throw Error(W(545, "`<body>`"));
          m !== null && i.push("<!--body-->"), wt.bodyChunks = [];
          var $n = Zl(
            wt.bodyChunks,
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
          var vr = m || p.preamble;
          if (vr.htmlChunks)
            throw Error(W(545, "`<html>`"));
          m !== null && i.push("<!--html-->"), vr.htmlChunks = [""];
          var ll = Zl(
            vr.htmlChunks,
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
          var Nl = null, Je = null, Fr;
          for (Fr in f)
            if (rn.call(f, Fr)) {
              var It = f[Fr];
              if (It != null) {
                var Qr = Fr;
                switch (Fr) {
                  case "children":
                    Nl = It;
                    break;
                  case "dangerouslySetInnerHTML":
                    Je = It;
                    break;
                  case "style":
                    Gt(i, It);
                    break;
                  case "suppressContentEditableWarning":
                  case "suppressHydrationWarning":
                  case "ref":
                    break;
                  case "className":
                    Qr = "class";
                  default:
                    if (qr(Fr) && typeof It != "function" && typeof It != "symbol" && It !== !1) {
                      if (It === !0) It = "";
                      else if (typeof It == "object") continue;
                      i.push(
                        " ",
                        Qr,
                        '="',
                        he(It),
                        '"'
                      );
                    }
                }
              }
            }
          return i.push(">"), lr(i, Je, Nl), Nl;
        }
    }
    return Ql(i, f, o);
  }
  var Ee = /* @__PURE__ */ new Map();
  function Oe(i) {
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
  function gt(i) {
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
  function ca(i) {
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
  var La = !1, sr = !0;
  function tl(i) {
    var o = i.rules, f = i.hrefs, g = 0;
    if (f.length) {
      for (this.push(ke.startInlineStyle), this.push(' media="not all" data-precedence="'), this.push(i.precedence), this.push('" data-href="'); g < f.length - 1; g++)
        this.push(f[g]), this.push(" ");
      for (this.push(f[g]), this.push('">'), g = 0; g < o.length; g++) this.push(o[g]);
      sr = this.push("</style>"), La = !0, o.length = 0, f.length = 0;
    }
  }
  function Yn(i) {
    return i.state !== 2 ? La = !0 : !1;
  }
  function lc(i, o, f) {
    return La = !1, sr = !0, ke = f, o.styles.forEach(tl, i), ke = null, o.stylesheets.forEach(Yn), La && (f.stylesToHoist = !0), sr;
  }
  function wl(i) {
    for (var o = 0; o < i.length; o++) this.push(i[o]);
    i.length = 0;
  }
  var Rn = [];
  function ns(i) {
    dt(Rn, i.props);
    for (var o = 0; o < Rn.length; o++)
      this.push(Rn[o]);
    Rn.length = 0, i.state = 2;
  }
  function dn(i) {
    var o = 0 < i.sheets.size;
    i.sheets.forEach(ns, this), i.sheets.clear();
    var f = i.rules, g = i.hrefs;
    if (!o || g.length) {
      if (this.push(ke.startInlineStyle), this.push(' data-precedence="'), this.push(i.precedence), i = 0, g.length) {
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
      for (dt(Rn, {
        rel: "preload",
        as: "style",
        href: i.props.href,
        crossOrigin: o.crossOrigin,
        fetchPriority: o.fetchPriority,
        integrity: o.integrity,
        media: o.media,
        hrefLang: o.hrefLang,
        referrerPolicy: o.referrerPolicy
      }), i = 0; i < Rn.length; i++)
        this.push(Rn[i]);
      Rn.length = 0;
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
          i.push(f), g = ca(
            "" + g.props.href
          ), i.push(g), i.push("]"), f = ",[";
        else {
          i.push(f);
          var p = g.props["data-precedence"], m = g.props, A = T("" + g.props.href);
          A = ca(A), i.push(A), p = "" + p, i.push(","), p = ca(p), i.push(p);
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
                  Bn(
                    i,
                    Q,
                    p
                  );
              }
          i.push("]"), f = ",[", g.state = 3;
        }
    }), i.push("]");
  }
  function Bn(i, o, f) {
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
    i.push(","), g = ca(g), i.push(g), i.push(","), g = ca(o), i.push(g);
  }
  function Cn() {
    return { styles: /* @__PURE__ */ new Set(), stylesheets: /* @__PURE__ */ new Set(), suspenseyImages: !1 };
  }
  function Vl(i) {
    var o = Lt || null;
    if (o) {
      var f = o.resumableState, g = o.renderState;
      if (typeof i == "string" && i) {
        if (!f.dnsResources.hasOwnProperty(i)) {
          f.dnsResources[i] = null, f = g.headers;
          var p, m;
          (m = f && 0 < f.remainingCapacity) && (m = (p = "<" + ("" + i).replace(
            Gc,
            Ro
          ) + ">; rel=dns-prefetch", 0 <= (f.remainingCapacity -= p.length + 2))), m ? (g.resets.dns[i] = null, f.preconnects && (f.preconnects += ", "), f.preconnects += p) : (p = [], dt(p, { href: i, rel: "dns-prefetch" }), g.preconnects.add(p));
        }
        No(o);
      }
    } else me.D(i);
  }
  function fr(i, o) {
    var f = Lt || null;
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
              Ro
            ) + ">; rel=preconnect", typeof o == "string") {
              var I = ("" + o).replace(
                pl,
                Ba
              );
              Q += '; crossorigin="' + I + '"';
            }
            Q = (A = Q, 0 <= (g.remainingCapacity -= A.length + 2));
          }
          Q ? (p.resets.connect[m][i] = null, g.preconnects && (g.preconnects += ", "), g.preconnects += A) : (m = [], dt(m, {
            rel: "preconnect",
            href: i,
            crossOrigin: o
          }), p.preconnects.add(m));
        }
        No(f);
      }
    } else me.C(i, o);
  }
  function _a(i, o, f) {
    var g = Lt || null;
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
            p.imageResources[G] = _e, p = m.headers;
            var re;
            p && 0 < p.remainingCapacity && typeof A != "string" && I === "high" && (re = rt(i, o, f), 0 <= (p.remainingCapacity -= re.length + 2)) ? (m.resets.image[G] = _e, p.highImagePreloads && (p.highImagePreloads += ", "), p.highImagePreloads += re) : (p = [], dt(
              p,
              Rt(
                { rel: "preload", href: A ? void 0 : i, as: o },
                f
              )
            ), I === "high" ? m.highImagePreloads.add(p) : (m.bulkPreloads.add(p), m.preloads.images.set(G, p)));
            break;
          case "style":
            if (p.styleResources.hasOwnProperty(i)) return;
            A = [], dt(
              A,
              Rt({ rel: "preload", href: i, as: o }, f)
            ), p.styleResources[i] = !f || typeof f.crossOrigin != "string" && typeof f.integrity != "string" ? _e : [f.crossOrigin, f.integrity], m.preloads.stylesheets.set(i, A), m.bulkPreloads.add(A);
            break;
          case "script":
            if (p.scriptResources.hasOwnProperty(i)) return;
            A = [], m.preloads.scripts.set(i, A), m.bulkPreloads.add(A), dt(
              A,
              Rt({ rel: "preload", href: i, as: o }, f)
            ), p.scriptResources[i] = !f || typeof f.crossOrigin != "string" && typeof f.integrity != "string" ? _e : [f.crossOrigin, f.integrity];
            break;
          default:
            if (p.unknownResources.hasOwnProperty(o)) {
              if (A = p.unknownResources[o], A.hasOwnProperty(i))
                return;
            } else
              A = {}, p.unknownResources[o] = A;
            A[i] = _e, (p = m.headers) && 0 < p.remainingCapacity && o === "font" && (G = rt(i, o, f), 0 <= (p.remainingCapacity -= G.length + 2)) ? (m.resets.font[i] = _e, p.fontPreloads && (p.fontPreloads += ", "), p.fontPreloads += G) : (p = [], i = Rt({ rel: "preload", href: i, as: o }, f), dt(p, i), o) === "font" ? m.fontPreloads.add(p) : m.bulkPreloads.add(p);
        }
        No(g);
      }
    } else me.L(i, o, f);
  }
  function Wc(i, o) {
    var f = Lt || null;
    if (f) {
      var g = f.resumableState, p = f.renderState;
      if (i) {
        var m = o && typeof o.as == "string" ? o.as : "script";
        switch (m) {
          case "script":
            if (g.moduleScriptResources.hasOwnProperty(i)) return;
            m = [], g.moduleScriptResources[i] = !o || typeof o.crossOrigin != "string" && typeof o.integrity != "string" ? _e : [o.crossOrigin, o.integrity], p.preloads.moduleScripts.set(i, m);
            break;
          default:
            if (g.moduleUnknownResources.hasOwnProperty(m)) {
              var A = g.unknownResources[m];
              if (A.hasOwnProperty(i)) return;
            } else
              A = {}, g.moduleUnknownResources[m] = A;
            m = [], A[i] = _e;
        }
        dt(m, Rt({ rel: "modulepreload", href: i }, o)), p.bulkPreloads.add(m), No(f);
      }
    } else me.m(i, o);
  }
  function Rr(i, o, f) {
    var g = Lt || null;
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
          props: Rt(
            { rel: "stylesheet", href: i, "data-precedence": o },
            f
          )
        }, Q && (Q.length === 2 && Yc(o.props, Q), (m = m.preloads.stylesheets.get(i)) && 0 < m.length ? m.length = 0 : o.state = 1), A.sheets.set(i, o), No(g));
      }
    } else me.S(i, o, f);
  }
  function ts(i, o) {
    var f = Lt || null;
    if (f) {
      var g = f.resumableState, p = f.renderState;
      if (i) {
        var m = g.scriptResources.hasOwnProperty(i) ? g.scriptResources[i] : void 0;
        m !== null && (g.scriptResources[i] = null, o = Rt({ src: i, async: !0 }, o), m && (m.length === 2 && Yc(o, m), i = p.preloads.scripts.get(i)) && (i.length = 0), i = [], p.scripts.add(i), fi(i, o), No(f));
      }
    } else me.X(i, o);
  }
  function Su(i, o) {
    var f = Lt || null;
    if (f) {
      var g = f.resumableState, p = f.renderState;
      if (i) {
        var m = g.moduleScriptResources.hasOwnProperty(
          i
        ) ? g.moduleScriptResources[i] : void 0;
        m !== null && (g.moduleScriptResources[i] = null, o = Rt({ src: i, type: "module", async: !0 }, o), m && (m.length === 2 && Yc(o, m), i = p.preloads.moduleScripts.get(i)) && (i.length = 0), i = [], p.scripts.add(i), fi(i, o), No(f));
      }
    } else me.M(i, o);
  }
  function Yc(i, o) {
    i.crossOrigin == null && (i.crossOrigin = o[0]), i.integrity == null && (i.integrity = o[1]);
  }
  function rt(i, o, f) {
    i = ("" + i).replace(
      Gc,
      Ro
    ), o = ("" + o).replace(
      pl,
      Ba
    ), o = "<" + i + '>; rel=preload; as="' + o + '"';
    for (var g in f)
      rn.call(f, g) && (i = f[g], typeof i == "string" && (o += "; " + g.toLowerCase() + '="' + ("" + i).replace(
        pl,
        Ba
      ) + '"'));
    return o;
  }
  var Gc = /[<>\r\n]/g;
  function Ro(i) {
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
  function Ba(i) {
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
  function rs(i) {
    this.styles.add(i);
  }
  function ls(i) {
    this.stylesheets.add(i);
  }
  function Co(i, o) {
    o.styles.forEach(rs, i), o.stylesheets.forEach(ls, i), o.suspenseyImages && (i.suspenseyImages = !0);
  }
  function mo(i, o) {
    var f = i.idPrefix, g = [], p = i.bootstrapScriptContent, m = i.bootstrapScripts, A = i.bootstrapModules;
    p !== void 0 && (g.push("<script"), oc(g, i), g.push(
      ">",
      ("" + p).replace(Ct, En),
      "<\/script>"
    )), p = f + "P:";
    var Q = f + "S:";
    f += "B:";
    var I = /* @__PURE__ */ new Set(), G = /* @__PURE__ */ new Set(), re = /* @__PURE__ */ new Set(), $ = /* @__PURE__ */ new Map(), ye = /* @__PURE__ */ new Set(), Ne = /* @__PURE__ */ new Set(), on = /* @__PURE__ */ new Set(), Ze = {
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
        je.scriptResources[Mn] = null, je.moduleScriptResources[Mn] = null, je = [], dt(je, wn), ye.add(je), g.push('<script src="', he(Xe), '"'), typeof cn == "string" && g.push(
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
        }, typeof wn == "string" ? cn.href = ze = wn : (cn.href = ze = wn.src, cn.integrity = at = typeof wn.integrity == "string" ? wn.integrity : void 0, cn.crossOrigin = Xe = typeof wn == "string" || wn.crossOrigin == null ? void 0 : wn.crossOrigin === "use-credentials" ? "use-credentials" : ""), wn = i, je = ze, wn.scriptResources[je] = null, wn.moduleScriptResources[je] = null, wn = [], dt(wn, cn), ye.add(wn), g.push(
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
      bootstrapScripts: ye,
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
      case Se:
        return "Fragment";
      case On:
        return "Profiler";
      case nn:
        return "StrictMode";
      case P:
        return "Suspense";
      case N:
        return "SuspenseList";
      case ht:
        return "Activity";
    }
    if (typeof i == "object")
      switch (i.$$typeof) {
        case ve:
          return "Portal";
        case ie:
          return i.displayName || "Context";
        case Re:
          return (i._context.displayName || "Context") + ".Consumer";
        case He:
          var o = i.render;
          return i = i.displayName, i || (i = o.displayName || o.name || "", i = i !== "" ? "ForwardRef(" + i + ")" : "ForwardRef"), i;
        case Fe:
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
  var Zt = {}, So = null;
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
    var o = So;
    o !== i && (o === null ? yi(i) : i === null ? Zc(o) : o.depth === i.depth ? sc(o, i) : o.depth > i.depth ? fc(o, i) : Ur(o, i), So = i);
  }
  var ku = {
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
  var dc = Math.clz32 ? Math.clz32 : Yr, ua = Math.log, ko = Math.LN2;
  function Yr(i) {
    return i >>>= 0, i === 0 ? 32 : 31 - (ua(i) / ko | 0) | 0;
  }
  function jt() {
  }
  var jn = Error(W(460));
  function Au(i, o, f) {
    switch (f = i[f], f === void 0 ? i.push(o) : f !== o && (o.then(jt, jt), o = f), o.status) {
      case "fulfilled":
        return o.value;
      case "rejected":
        throw o.reason;
      default:
        switch (typeof o.status == "string" ? o.then(jt, jt) : (i = o, i.status = "pending", i.then(
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
  var Li = typeof Object.is == "function" ? Object.is : Pu, bi = null, Ao = null, _i = null, Bi = null, Po = null, $e = null, ql = !1, Dt = !1, wi = 0, Qt = 0, sa = -1, za = 0, pi = null, zi = null, Nt = 0;
  function Hi() {
    if (bi === null)
      throw Error(W(321));
    return bi;
  }
  function Ui() {
    if (0 < Nt) throw Error(W(312));
    return { memoizedState: null, queue: null, next: null };
  }
  function Ha() {
    return $e === null ? Po === null ? (ql = !1, Po = $e = Ui()) : (ql = !0, $e = Po) : $e.next === null ? (ql = !1, $e = $e.next = Ui()) : (ql = !0, $e = $e.next), $e;
  }
  function fa() {
    var i = pi;
    return pi = null, i;
  }
  function Ua() {
    Bi = _i = Ao = bi = null, Dt = !1, Po = null, Nt = 0, $e = zi = null;
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
    if (25 <= Nt) throw Error(W(301));
    if (i === bi)
      if (Dt = !0, i = { action: f, next: null }, zi === null && (zi = /* @__PURE__ */ new Map()), f = zi.get(o), f === void 0)
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
  function Fo() {
    throw Error(W(479));
  }
  function Oo(i, o, f) {
    Hi();
    var g = Qt++, p = _i;
    if (typeof i.$$FORM_ACTION == "function") {
      var m = null, A = Bi;
      p = p.formState;
      var Q = i.$$IS_SIGNATURE_EQUAL;
      if (p !== null && typeof Q == "function") {
        var I = p[1];
        Q.call(i, p[2], p[3]) && (m = f !== void 0 ? "p" + f : "k" + Ve(
          JSON.stringify([A, null, g]),
          0
        ), I === m && (sa = g, o = p[0]));
      }
      var G = i.bind(null, o);
      return i = function($) {
        G($);
      }, typeof G.$$FORM_ACTION == "function" && (i.$$FORM_ACTION = function($) {
        $ = G.$$FORM_ACTION($), f !== void 0 && (f += "", $.action = f);
        var ye = $.data;
        return ye && (m === null && (m = f !== void 0 ? "p" + f : "k" + Ve(
          JSON.stringify([
            A,
            null,
            g
          ]),
          0
        )), ye.append("$ACTION_KEY", m)), $;
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
  function Mo(i) {
    var o = za;
    return za += 1, pi === null && (pi = []), Au(pi, i, o);
  }
  function qt() {
    throw Error(W(393));
  }
  var is = {
    readContext: function(i) {
      return i._currentValue2;
    },
    use: function(i) {
      if (i !== null && typeof i == "object") {
        if (typeof i.then == "function") return Mo(i);
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
    useInsertionEffect: jt,
    useLayoutEffect: jt,
    useCallback: function(i, o) {
      return $l(function() {
        return i;
      }, o);
    },
    useImperativeHandle: jt,
    useEffect: jt,
    useDebugValue: jt,
    useDeferredValue: function(i, o) {
      return Hi(), o !== void 0 ? o : i;
    },
    useTransition: function() {
      return Hi(), [!1, Mu];
    },
    useId: function() {
      var i = Ao.treeContext, o = i.overflow;
      i = i.id, i = (i & ~(1 << 32 - dc(i) - 1)).toString(32) + o;
      var f = ha;
      if (f === null) throw Error(W(404));
      return o = wi++, i = "_" + f.idPrefix + "R_" + i, 0 < o && (i += "H" + o.toString(32)), i + "_";
    },
    useSyncExternalStore: function(i, o, f) {
      if (f === void 0)
        throw Error(W(407));
      return f();
    },
    useOptimistic: function(i) {
      return Hi(), [i, Fo];
    },
    useActionState: Oo,
    useFormState: Oo,
    useHostTransitionStatus: function() {
      return Hi(), Te;
    },
    useMemoCache: function(i) {
      for (var o = Array(i), f = 0; f < i; f++)
        o[f] = Ot;
      return o;
    },
    useCacheRefresh: function() {
      return qt;
    },
    useEffectEvent: function() {
      return Ou;
    }
  }, ha = null, gc = {
    getCacheForType: function() {
      throw Error(W(248));
    },
    cacheSignal: function() {
      throw Error(W(248));
    }
  }, Qc, Wi;
  function da(i) {
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
  var Io = !1;
  function ei(i, o) {
    if (!i || Io) return "";
    Io = !0;
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
                  var ye = Ne;
                }
                Reflect.construct(i, [], $);
              } else {
                try {
                  $.call();
                } catch (Ne) {
                  ye = Ne;
                }
                i.call($.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (Ne) {
                ye = Ne;
              }
              ($ = i()) && typeof $.catch == "function" && $.catch(function() {
              });
            }
          } catch (Ne) {
            if (Ne && ye && typeof Ne.stack == "string")
              return [Ne.stack, ye.stack];
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
      Io = !1, Error.prepareStackTrace = f;
    }
    return (f = i ? i.displayName || i.name : "") ? da(f) : "";
  }
  function ga(i) {
    if (typeof i == "string") return da(i);
    if (typeof i == "function")
      return i.prototype && i.prototype.isReactComponent ? ei(i, !0) : ei(i, !1);
    if (typeof i == "object" && i !== null) {
      switch (i.$$typeof) {
        case He:
          return ei(i.render, !1);
        case Fe:
          return ei(i.type, !1);
        case ee:
          var o = i, f = o._payload;
          o = o._init;
          try {
            i = o(f);
          } catch {
            return da("Lazy");
          }
          return ga(i);
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
          f = da(
            f + (o ? " [" + o + "]" : "")
          );
        }
        return f;
      }
    }
    switch (i) {
      case N:
        return da("SuspenseList");
      case P:
        return da("Suspense");
    }
    return "";
  }
  function va(i, o) {
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
    this.destination = null, this.flushScheduled = !1, this.resumableState = i, this.renderState = o, this.rootFormatContext = f, this.progressiveChunkSize = g === void 0 ? 12800 : g, this.status = 10, this.fatalError = null, this.pendingRootTasks = this.allPendingTasks = this.nextSegmentId = 0, this.completedPreambleSegments = this.completedRootSegment = null, this.byteSize = 0, this.abortableTasks = $, this.pingedTasks = [], this.clientRenderedBoundaries = [], this.completedBoundaries = [], this.partialBoundaries = [], this.trackedPostpones = null, this.onError = p === void 0 ? Iu : p, this.onPostpone = G === void 0 ? jt : G, this.onAllReady = m === void 0 ? jt : m, this.onShellReady = A === void 0 ? jt : A, this.onShellError = Q === void 0 ? jt : Q, this.onFatalError = I === void 0 ? jt : I, this.formState = re === void 0 ? null : re;
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
    ), f = Tl(
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
    ), xl(i), o.pingedTasks.push(i), o;
  }
  var Lt = null;
  function Ti(i, o) {
    i.pingedTasks.push(o), i.pingedTasks.length === 1 && (i.flushScheduled = i.destination !== null, os(i));
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
      contentState: Cn(),
      fallbackState: Cn(),
      contentPreamble: g,
      fallbackPreamble: p,
      trackedContentKeyPath: null,
      trackedFallbackNode: null
    }, o !== null && (o.pendingTasks++, g = o.boundaries, g !== null && (i.allPendingTasks++, f.pendingTasks++, g.push(f)), i = o.inheritedHoistables, i !== null && Co(f.contentState, i)), f;
  }
  function yc(i, o, f, g, p, m, A, Q, I, G, re, $, ye, Ne, on) {
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
      treeContext: ye,
      row: Ne,
      componentStack: on,
      thenableState: o
    };
    return I.add(Ze), Ze;
  }
  function Jc(i, o, f, g, p, m, A, Q, I, G, re, $, ye, Ne) {
    i.allPendingTasks++, m === null ? i.pendingRootTasks++ : m.pendingTasks++, ye !== null && ye.pendingTasks++, f.pendingTasks++;
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
      row: ye,
      componentStack: Ne,
      thenableState: o
    };
    return Q.add(on), on;
  }
  function Tl(i, o, f, g, p, m) {
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
  function xl(i) {
    var o = i.node;
    typeof o == "object" && o !== null && o.$$typeof === Ae && (i.componentStack = { parent: i.componentStack, type: o.type });
  }
  function rl(i) {
    return i === null ? null : { parent: i.parent, type: "Suspense Fallback" };
  }
  function El(i) {
    var o = {};
    return i && Object.defineProperty(o, "componentStack", {
      configurable: !0,
      enumerable: !0,
      get: function() {
        try {
          var f = "", g = i;
          do
            f += ga(g.type), g = g.parent;
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
  function Rl(i, o) {
    var f = i.onShellError, g = i.onFatalError;
    f(o), g(o), i.destination !== null ? (i.status = 14, i.destination.destroy(o)) : (i.status = 13, i.fatalError = o);
  }
  function lt(i, o) {
    ni(i, o.next, o.hoistables);
  }
  function ni(i, o, f) {
    for (; o !== null; ) {
      f !== null && (Co(o.hoistables, f), o.inheritedHoistables = f);
      var g = o.boundaries;
      if (g !== null) {
        o.boundaries = null;
        for (var p = 0; p < g.length; p++) {
          var m = g[p];
          f !== null && Co(m.contentState, f), Gi(i, m, null, null);
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
        if (m.pendingTasks !== 1 || m.parentFlushed || va(i, m)) {
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
      hoistables: Cn(),
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
          var $ = p !== "backwards" && p !== "unstable_legacy-backwards" ? re : f - 1 - re, ye = g[$];
          o.row = I = Kc(
            I
          ), o.treeContext = Wr(A, f, $);
          var Ne = G[$];
          typeof Ne == "number" ? (pc(i, o, Ne, ye, $), delete G[$]) : ir(i, o, ye, $), --I.pendingTasks === 0 && lt(i, I);
        }
      else
        for (G = 0; G < f; G++)
          re = p !== "backwards" && p !== "unstable_legacy-backwards" ? G : f - 1 - G, $ = g[re], o.row = I = Kc(I), o.treeContext = Wr(A, f, re), ir(i, o, $, re), --I.pendingTasks === 0 && lt(i, I);
    } else if (p !== "backwards" && p !== "unstable_legacy-backwards")
      for (p = 0; p < f; p++)
        G = g[p], o.row = I = Kc(I), o.treeContext = Wr(
          A,
          f,
          p
        ), ir(i, o, G, p), --I.pendingTasks === 0 && lt(i, I);
    else {
      for (p = o.blockedSegment, G = p.children.length, re = p.chunks.length, $ = f - 1; 0 <= $; $--) {
        ye = g[$], o.row = I = Kc(
          I
        ), o.treeContext = Wr(A, f, $), Ne = Tl(
          i,
          re,
          null,
          o.formatContext,
          $ === 0 ? p.lastPushedText : !0,
          !0
        ), p.children.splice(G, 0, Ne), o.blockedSegment = Ne;
        try {
          ir(i, o, ye, $), vi(
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
    for (o.thenableState = null, bi = {}, Ao = o, _i = i, Bi = f, Qt = wi = 0, sa = -1, za = 0, pi = A, i = g(p, m); Dt; )
      Dt = !1, Qt = wi = 0, sa = -1, za = 0, Nt += 1, $e = null, i = g(p, m);
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
    m = o.keyPath, o.keyPath = f, p ? (f = o.treeContext, o.treeContext = Wr(f, 1, 0), ir(i, o, g, -1), o.treeContext = f) : Q ? ir(i, o, g, -1) : Xr(i, o, g, -1), o.keyPath = m;
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
          A === p && (A = Rt({}, A, p));
          for (var G in I)
            A[G] === void 0 && (A[G] = I[G]);
        }
        p = A, A = Zt, I = g.contextType, typeof I == "object" && I !== null && (A = I._currentValue2), A = new g(p, A);
        var re = A.state !== void 0 ? A.state : null;
        if (A.updater = ku, A.props = p, A.state = re, I = { queue: [], replace: !1 }, A._reactInternals = I, m = g.contextType, A.context = typeof m == "object" && m !== null ? m._currentValue2 : Zt, m = g.getDerivedStateFromProps, typeof m == "function" && (m = m(p, re), re = m == null ? re : Rt({}, re, m), A.state = re), typeof g.getDerivedStateFromProps != "function" && typeof A.getSnapshotBeforeUpdate != "function" && (typeof A.UNSAFE_componentWillMount == "function" || typeof A.componentWillMount == "function"))
          if (g = A.state, typeof A.componentWillMount == "function" && A.componentWillMount(), typeof A.UNSAFE_componentWillMount == "function" && A.UNSAFE_componentWillMount(), g !== A.state && ku.enqueueReplaceState(
            A,
            A.state,
            null
          ), I.queue !== null && 0 < I.queue.length)
            if (g = I.queue, m = I.replace, I.queue = null, I.replace = !1, m && g.length === 1)
              A.state = g[0];
            else {
              for (I = m ? g[0] : A.state, re = !0, m = m ? 1 : 0; m < g.length; m++)
                G = g[m], G = typeof G == "function" ? G.call(A, I, p, void 0) : G, G != null && (re ? (re = !1, I = Rt({}, I, G)) : Rt(I, G));
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
          sa
        );
      }
    else if (typeof g == "string")
      if (A = o.blockedSegment, A === null)
        A = p.children, I = o.formatContext, re = o.keyPath, o.formatContext = Da(I, g, p), o.keyPath = f, ir(i, o, A, -1), o.formatContext = I, o.keyPath = re;
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
          f = Tl(
            i,
            0,
            null,
            o.formatContext,
            !1,
            !1
          ), A.preambleChildren.push(f), o.blockedSegment = f;
          try {
            f.status = 6, ir(i, o, re, -1), vi(
              f.chunks,
              i.renderState,
              f.lastPushedText,
              f.textEmbedded
            ), f.status = 1;
          } finally {
            o.blockedSegment = A;
          }
        } else ir(i, o, re, -1);
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
          o.push(Oe(g));
        }
        A.lastPushedText = !1;
      }
    else {
      switch (g) {
        case rr:
        case nn:
        case On:
        case Se:
          g = o.keyPath, o.keyPath = f, Xr(i, o, p.children, -1), o.keyPath = g;
          return;
        case ht:
          g = o.blockedSegment, g === null ? p.mode !== "hidden" && (g = o.keyPath, o.keyPath = f, ir(i, o, p.children, -1), o.keyPath = g) : p.mode !== "hidden" && (i.renderState.generateStaticMarkup || g.chunks.push("<!--&-->"), g.lastPushedText = !1, A = o.keyPath, o.keyPath = f, ir(i, o, p.children, -1), o.keyPath = A, i.renderState.generateStaticMarkup || g.chunks.push("<!--/&-->"), g.lastPushedText = !1);
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
        case vl:
        case X:
          throw Error(W(343));
        case P:
          e: if (o.replay !== null) {
            g = o.keyPath, A = o.formatContext, I = o.row, o.keyPath = f, o.formatContext = Tn(
              i.resumableState,
              A
            ), o.row = null, f = p.children;
            try {
              ir(i, o, f, -1);
            } finally {
              o.keyPath = g, o.formatContext = A, o.row = I;
            }
          } else {
            g = o.keyPath, m = o.formatContext;
            var $ = o.row, ye = o.blockedBoundary;
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
            var je = Tl(
              i,
              Q.chunks.length,
              ze,
              o.formatContext,
              !1,
              !1
            );
            Q.children.push(je), Q.lastPushedText = !1;
            var Xe = Tl(
              i,
              0,
              null,
              o.formatContext,
              !1,
              !1
            );
            if (Xe.parentFlushed = !0, i.trackedPostpones !== null) {
              A = o.componentStack, I = [f[0], "Suspense Fallback", f[2]], re = [I[1], I[2], [], null], i.trackedPostpones.workingMap.set(I, re), ze.trackedFallbackNode = re, o.blockedSegment = je, o.blockedPreamble = ze.fallbackPreamble, o.keyPath = I, o.formatContext = St(
                i.resumableState,
                m
              ), o.componentStack = rl(A), je.status = 6;
              try {
                ir(i, o, on, -1), vi(
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
                Tn(
                  i.resumableState,
                  o.formatContext
                ),
                o.context,
                o.treeContext,
                null,
                A
              ), xl(o), i.pingedTasks.push(o);
            } else {
              o.blockedBoundary = ze, o.blockedPreamble = ze.contentPreamble, o.hoistableState = ze.contentState, o.blockedSegment = Xe, o.keyPath = f, o.formatContext = Tn(
                i.resumableState,
                m
              ), o.row = null, Xe.status = 6;
              try {
                if (ir(i, o, p, -1), vi(
                  Xe.chunks,
                  i.renderState,
                  Xe.lastPushedText,
                  Xe.textEmbedded
                ), Xe.status = 1, hr(ze, Xe), ze.pendingTasks === 0 && ze.status === 0) {
                  if (ze.status = 1, !va(i, ze)) {
                    $ !== null && --$.pendingTasks === 0 && lt(i, $), i.pendingRootTasks === 0 && o.blockedPreamble && Qa(i);
                    break e;
                  }
                } else
                  $ !== null && $.together && Vc(i, $);
              } catch (at) {
                ze.status = 4, i.status === 12 ? (Xe.status = 3, A = i.fatalError) : (Xe.status = 4, A = at), I = El(o.componentStack), re = Gn(
                  i,
                  A,
                  I
                ), ze.errorDigest = re, Xa(i, ze);
              } finally {
                o.blockedBoundary = ye, o.blockedPreamble = G, o.hoistableState = Ne, o.blockedSegment = Q, o.keyPath = g, o.formatContext = m, o.row = $;
              }
              o = yc(
                i,
                null,
                on,
                -1,
                ye,
                je,
                ze.fallbackPreamble,
                ze.fallbackState,
                Ze,
                [f[0], "Suspense Fallback", f[2]],
                St(
                  i.resumableState,
                  o.formatContext
                ),
                o.context,
                o.treeContext,
                o.row,
                rl(
                  o.componentStack
                )
              ), xl(o), i.pingedTasks.push(o);
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
              sa
            );
            return;
          case Fe:
            wc(i, o, f, g.type, p, m);
            return;
          case ie:
            if (I = p.children, A = o.keyPath, p = p.value, re = g._currentValue2, g._currentValue2 = p, m = So, So = g = {
              parent: m,
              depth: m === null ? 0 : m.depth + 1,
              context: g,
              parentValue: re,
              value: p
            }, o.context = g, o.keyPath = f, Xr(i, o, I, -1), i = So, i === null) throw Error(W(403));
            i.context._currentValue2 = i.parentValue, i = So = i.parent, o.context = i, o.keyPath = A;
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
    var m = o.replay, A = o.blockedBoundary, Q = Tl(
      i,
      0,
      null,
      o.formatContext,
      !1,
      !1
    );
    Q.id = f, Q.parentFlushed = !0;
    try {
      o.replay = null, o.blockedSegment = Q, ir(i, o, g, p), Q.status = 1, A === null ? i.completedRootSegment = Q : (hr(A, Q), A.parentFlushed && i.partialBoundaries.push(A));
    } finally {
      o.replay = m, o.blockedSegment = null;
    }
  }
  function Xr(i, o, f, g) {
    o.replay !== null && typeof o.replay.slots == "number" ? pc(i, o, o.replay.slots, f, g) : (o.node = f, o.childIndex = g, f = o.componentStack, xl(o), it(i, o), o.componentStack = f);
  }
  function it(i, o) {
    var f = o.node, g = o.childIndex;
    if (f !== null) {
      if (typeof f == "object") {
        switch (f.$$typeof) {
          case Ae:
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
                      var ye = $[2];
                      I = $[3], G = o.node, o.replay = {
                        nodes: ye,
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
                        o.replay.pendingTasks--, A = El(o.componentStack), m = i, i = o.blockedBoundary, p = Mn, A = Gn(m, p, A), ti(
                          m,
                          i,
                          ye,
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
                        ), A.parentFlushed = !0, A.rootSegmentID = p, o.blockedBoundary = A, o.hoistableState = A.contentState, o.keyPath = m, o.formatContext = Tn(
                          i.resumableState,
                          on
                        ), o.row = null, o.replay = {
                          nodes: Q,
                          slots: I,
                          pendingTasks: 1
                        };
                        try {
                          if (ir(i, o, at, -1), o.replay.pendingTasks === 1 && 0 < o.replay.nodes.length)
                            throw Error(W(488));
                          if (o.replay.pendingTasks--, A.pendingTasks === 0 && A.status === 0) {
                            A.status = 1, i.completedBoundaries.push(A);
                            break n;
                          }
                        } catch (Mn) {
                          A.status = 4, ye = El(o.componentStack), re = Gn(
                            i,
                            Mn,
                            ye
                          ), A.errorDigest = re, o.replay.pendingTasks--, i.clientRenderedBoundaries.push(A);
                        } finally {
                          o.blockedBoundary = je, o.hoistableState = Xe, o.replay = ze, o.keyPath = Ne, o.formatContext = on, o.row = Ze;
                        }
                        ye = Jc(
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
                          St(
                            i.resumableState,
                            o.formatContext
                          ),
                          o.context,
                          o.treeContext,
                          o.row,
                          rl(
                            o.componentStack
                          )
                        ), xl(ye), i.pingedTasks.push(ye);
                      }
                    }
                    g.splice(f, 1);
                    break e;
                  }
                }
              }
            else wc(i, o, m, p, A, Q);
            return;
          case ve:
            throw Error(W(257));
          case ee:
            if (ye = f._init, f = ye(f._payload), i.status === 12) throw null;
            Xr(i, o, f, g);
            return;
        }
        if (Ie(f)) {
          mn(i, o, f, g);
          return;
        }
        if ((ye = Vn(f)) && (ye = ye.call(f))) {
          if (f = ye.next(), !f.done) {
            A = [];
            do
              A.push(f.value), f = ye.next();
            while (!f.done);
            mn(i, o, A, g);
          }
          return;
        }
        if (typeof f.then == "function")
          return o.thenableState = null, Xr(i, o, Mo(f), g);
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
  function mn(i, o, f, g) {
    var p = o.keyPath;
    if (g !== -1 && (o.keyPath = [o.keyPath, "Fragment", g], o.replay !== null)) {
      for (var m = o.replay, A = m.nodes, Q = 0; Q < A.length; Q++) {
        var I = A[Q];
        if (I[1] === g) {
          g = I[2], I = I[3], o.replay = { nodes: g, slots: I, pendingTasks: 1 };
          try {
            if (mn(i, o, f, -1), o.replay.pendingTasks === 1 && 0 < o.replay.nodes.length)
              throw Error(W(488));
            o.replay.pendingTasks--;
          } catch ($) {
            if (typeof $ == "object" && $ !== null && ($ === jn || typeof $.then == "function"))
              throw $;
            o.replay.pendingTasks--, f = El(o.componentStack);
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
        I = f[g], o.treeContext = Wr(m, A, g), G = Q[g], typeof G == "number" ? (pc(i, o, G, I, g), delete Q[g]) : ir(i, o, I, g);
      o.treeContext = m, o.keyPath = p;
      return;
    }
    for (Q = 0; Q < A; Q++)
      g = f[Q], o.treeContext = Wr(m, A, Q), ir(i, o, g, Q);
    o.treeContext = m, o.keyPath = p;
  }
  function ya(i, o, f) {
    if (f.status = 5, f.rootSegmentID = i.nextSegmentId++, i = f.trackedContentKeyPath, i === null) throw Error(W(486));
    var g = f.trackedFallbackNode, p = [], m = o.workingMap.get(i);
    return m === void 0 ? (f = [
      i[1],
      i[2],
      p,
      null,
      g,
      f.rootSegmentID
    ], o.workingMap.set(i, f), vt(f, i[0], o), f) : (m[4] = g, m[5] = f.rootSegmentID, m);
  }
  function Ga(i, o, f, g) {
    g.status = 5;
    var p = f.keyPath, m = f.blockedBoundary;
    if (m === null)
      g.id = i.nextSegmentId++, o.rootSlots = g.id, i.completedRootSegment !== null && (i.completedRootSegment.status = 5);
    else {
      if (m !== null && m.status === 0) {
        var A = ya(
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
        p === null ? o.rootSlots = g.id : (f = o.workingMap.get(p), f === void 0 ? (f = [p[1], p[2], [], g.id], vt(f, p[0], o)) : f[3] = g.id);
      else {
        if (p === null) {
          if (i = o.rootSlots, i === null)
            i = o.rootSlots = {};
          else if (typeof i == "number")
            throw Error(W(491));
        } else if (m = o.workingMap, A = m.get(p), A === void 0)
          i = {}, A = [p[1], p[2], [], i], m.set(p, A), vt(A, p[0], o);
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
  function ba(i, o, f) {
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
    var g = o.blockedSegment, p = Tl(
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
  function ir(i, o, f, g) {
    var p = o.formatContext, m = o.context, A = o.keyPath, Q = o.treeContext, I = o.componentStack, G = o.blockedSegment;
    if (G === null) {
      G = o.replay;
      try {
        return Xr(i, o, f, g);
      } catch (ye) {
        if (Ua(), f = ye === jn ? jl() : ye, i.status !== 12 && typeof f == "object" && f !== null) {
          if (typeof f.then == "function") {
            g = ye === jn ? fa() : null, i = ba(i, o, g).ping, f.then(i, i), o.formatContext = p, o.context = m, o.keyPath = A, o.treeContext = Q, o.componentStack = I, o.replay = G, Kl(m);
            return;
          }
          if (f.message === "Maximum call stack size exceeded") {
            f = ye === jn ? fa() : null, f = ba(i, o, f), i.pingedTasks.push(f), o.formatContext = p, o.context = m, o.keyPath = A, o.treeContext = Q, o.componentStack = I, o.replay = G, Kl(m);
            return;
          }
        }
      }
    } else {
      var re = G.children.length, $ = G.chunks.length;
      try {
        return Xr(i, o, f, g);
      } catch (ye) {
        if (Ua(), G.children.length = re, G.chunks.length = $, f = ye === jn ? jl() : ye, i.status !== 12 && typeof f == "object" && f !== null) {
          if (typeof f.then == "function") {
            G = f, f = ye === jn ? fa() : null, i = Du(i, o, f).ping, G.then(i, i), o.formatContext = p, o.context = m, o.keyPath = A, o.treeContext = Q, o.componentStack = I, Kl(m);
            return;
          }
          if (f.message === "Maximum call stack size exceeded") {
            G = ye === jn ? fa() : null, G = Du(i, o, G), i.pingedTasks.push(G), o.formatContext = p, o.context = m, o.keyPath = A, o.treeContext = Q, o.componentStack = I, Kl(m);
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
  function as(i, o, f) {
    var g = i.blockedBoundary, p = i.blockedSegment;
    if (p !== null) {
      if (p.status === 6) return;
      p.status = 3;
    }
    var m = El(i.componentStack);
    if (g === null) {
      if (o.status !== 13 && o.status !== 14) {
        if (g = i.replay, g === null) {
          o.trackedPostpones !== null && p !== null ? (g = o.trackedPostpones, Gn(o, f, m), Ga(o, g, i, p), Gi(o, null, i.row, p)) : (Gn(o, f, m), Rl(o, f));
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
            return as(Q, o, f);
          }), g.fallbackAbortableTasks.clear(), Gi(o, g, i.row, p);
        g.status = 4, p = Gn(o, f, m), g.status = 4, g.errorDigest = p, Xa(o, g), g.parentFlushed && o.clientRenderedBoundaries.push(g);
      }
      g.pendingTasks--, p = g.row, p !== null && --p.pendingTasks === 0 && lt(o, p), g.fallbackAbortableTasks.forEach(function(Q) {
        return as(Q, o, f);
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
                var re = G.value, $ = re.props, ye = $.href, Ne = re.props, on = rt(Ne.href, "style", {
                  crossOrigin: Ne.crossOrigin,
                  integrity: Ne.integrity,
                  nonce: Ne.nonce,
                  type: Ne.type,
                  fetchPriority: Ne.fetchPriority,
                  referrerPolicy: Ne.referrerPolicy,
                  media: Ne.media
                });
                if (0 <= (p.remainingCapacity -= on.length + 2))
                  f.resets.style[ye] = _e, m && (m += ", "), m += on, f.resets.style[ye] = typeof $.crossOrigin == "string" || typeof $.integrity == "string" ? [$.crossOrigin, $.integrity] : _e;
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
    i.trackedPostpones === null && Nu(i, !0), i.trackedPostpones === null && Qa(i), i.onShellError = jt, i = i.onShellReady, i();
  }
  function Tc(i) {
    Nu(
      i,
      i.trackedPostpones === null ? !0 : i.completedRootSegment === null || i.completedRootSegment.status !== 5
    ), Qa(i), i = i.onAllReady, i();
  }
  function hr(i, o) {
    if (o.chunks.length === 0 && o.children.length === 1 && o.children[0].boundary === null && o.children[0].id === -1) {
      var f = o.children[0];
      f.id = o.id, f.parentFlushed = !0, f.status !== 1 && f.status !== 3 && f.status !== 4 || hr(i, f);
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
        if (o.status === 0 && (o.status = 1), g !== null && g.parentFlushed && (g.status === 1 || g.status === 3) && hr(o, g), o.parentFlushed && i.completedBoundaries.push(o), o.status === 1)
          f = o.row, f !== null && Co(f.hoistables, o.contentState), va(i, o) || (o.fallbackAbortableTasks.forEach(Rs, i), o.fallbackAbortableTasks.clear(), f !== null && --f.pendingTasks === 0 && lt(i, f)), i.pendingRootTasks === 0 && i.trackedPostpones === null && o.contentPreamble !== null && Qa(i);
        else if (o.status === 5 && (o = o.row, o !== null)) {
          if (i.trackedPostpones !== null) {
            f = i.trackedPostpones;
            var p = o.next;
            if (p !== null && (g = p.boundaries, g !== null))
              for (p.boundaries = null, p = 0; p < g.length; p++) {
                var m = g[p];
                ya(i, f, m), Gi(i, m, null, null);
              }
          }
          --o.pendingTasks === 0 && lt(i, o);
        }
      } else
        g === null || !g.parentFlushed || g.status !== 1 && g.status !== 3 || (hr(o, g), o.completedSegments.length === 1 && o.parentFlushed && i.partialBoundaries.push(o)), o = o.row, o !== null && o.together && Vc(i, o);
    i.allPendingTasks === 0 && Tc(i);
  }
  function os(i) {
    if (i.status !== 14 && i.status !== 13) {
      var o = So, f = Y.H;
      Y.H = is;
      var g = Y.A;
      Y.A = gc;
      var p = Lt;
      Lt = i;
      var m = ha;
      ha = i.resumableState;
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
                var ye = qe === jn ? jl() : qe;
                if (typeof ye == "object" && ye !== null && typeof ye.then == "function") {
                  var Ne = I.ping;
                  ye.then(Ne, Ne), I.thenableState = qe === jn ? fa() : null;
                } else {
                  I.replay.pendingTasks--, I.abortSet.delete(I);
                  var on = El(I.componentStack);
                  G = void 0;
                  var Ze = $, ze = I.blockedBoundary, je = $.status === 12 ? $.fatalError : ye, Xe = I.replay.nodes, at = I.replay.slots;
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
                var en = G.trackedPostpones, yt = El(I.componentStack);
                I.abortSet.delete(I), Gn(G, Mn, yt), Ga(G, en, I, Ze), Gi(
                  G,
                  I.blockedBoundary,
                  I.row,
                  Ze
                );
              } else if (typeof Mn == "object" && Mn !== null && typeof Mn.then == "function") {
                Ze.status = 0, I.thenableState = qe === jn ? fa() : null;
                var Sn = I.ping;
                Mn.then(Sn, Sn);
              } else {
                var Cr = El(I.componentStack);
                I.abortSet.delete(I), Ze.status = 4;
                var Dn = I.blockedBoundary, xn = I.row;
                if (xn !== null && --xn.pendingTasks === 0 && lt(G, xn), G.allPendingTasks--, $ = Gn(
                  G,
                  Mn,
                  Cr
                ), Dn === null) Rl(G, Mn);
                else if (Dn.pendingTasks--, Dn.status !== 4) {
                  Dn.status = 4, Dn.errorDigest = $, Xa(G, Dn);
                  var kn = Dn.row;
                  kn !== null && --kn.pendingTasks === 0 && lt(G, kn), Dn.parentFlushed && G.clientRenderedBoundaries.push(Dn), G.pendingRootTasks === 0 && G.trackedPostpones === null && Dn.contentPreamble !== null && Qa(G);
                }
                G.allPendingTasks === 0 && Tc(G);
              }
            }
          }
        }
        A.splice(0, Q), i.destination !== null && $c(i, i.destination);
      } catch (qe) {
        Gn(i, qe, {}), Rl(i, qe);
      } finally {
        ha = m, Y.H = f, Y.A = g, f === is && Kl(o), Lt = p;
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
  function dr(i, o, f, g) {
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
          p = wa(i, o, p, g);
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
  var ar = 0;
  function wa(i, o, f, g) {
    var p = f.boundary;
    if (p === null)
      return dr(i, o, f, g);
    if (p.parentFlushed = !0, p.status === 4) {
      var m = p.row;
      return m !== null && --m.pendingTasks === 0 && lt(i, m), i.renderState.generateStaticMarkup || (p = p.errorDigest, o.push("<!--$!-->"), o.push("<template"), p && (o.push(' data-dgst="'), p = he(p), o.push(p), o.push('"')), o.push("></template>")), dr(i, o, f, g), i = i.renderState.generateStaticMarkup ? !0 : o.push("<!--/$-->"), i;
    }
    if (p.status !== 1)
      return p.status === 0 && (p.rootSegmentID = i.nextSegmentId++), 0 < p.completedSegments.length && i.partialBoundaries.push(p), an(
        o,
        i.renderState,
        p.rootSegmentID
      ), g && Co(g, p.fallbackState), dr(i, o, f, g), o.push("<!--/$-->");
    if (!Do && va(i, p) && ar + p.byteSize > i.progressiveChunkSize)
      return p.rootSegmentID = i.nextSegmentId++, i.completedBoundaries.push(p), an(
        o,
        i.renderState,
        p.rootSegmentID
      ), dr(i, o, f, g), o.push("<!--/$-->");
    if (ar += p.byteSize, g && Co(g, p.contentState), f = p.row, f !== null && va(i, p) && --f.pendingTasks === 0 && lt(i, f), i.renderState.generateStaticMarkup || o.push("<!--$-->"), f = p.completedSegments, f.length !== 1) throw Error(W(391));
    return wa(i, o, f[0], g), i = i.renderState.generateStaticMarkup ? !0 : o.push("<!--/$-->"), i;
  }
  function qn(i, o, f, g) {
    return We(
      o,
      i.renderState,
      f.parentFormatContext,
      f.id
    ), wa(i, o, f, g), Jl(o, f.parentFormatContext);
  }
  function zn(i, o, f) {
    ar = f.byteSize;
    for (var g = f.completedSegments, p = 0; p < g.length; p++)
      Ja(
        i,
        o,
        f,
        g[p]
      );
    g.length = 0, g = f.row, g !== null && va(i, f) && --g.pendingTasks === 0 && lt(i, g), lc(
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
  var Do = !1;
  function $c(i, o) {
    try {
      if (!(0 < i.pendingRootTasks)) {
        var f, g = i.completedRootSegment;
        if (g !== null) {
          if (g.status === 5) return;
          var p = i.completedPreambleSegments;
          if (p === null) return;
          ar = i.byteSize;
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
          var ye = A.charsetChunks;
          for (re = 0; re < ye.length; re++)
            o.push(ye[re]);
          ye.length = 0, A.preconnects.forEach(wl, o), A.preconnects.clear();
          var Ne = A.viewportChunks;
          for (re = 0; re < Ne.length; re++)
            o.push(Ne[re]);
          Ne.length = 0, A.fontPreloads.forEach(wl, o), A.fontPreloads.clear(), A.highImagePreloads.forEach(wl, o), A.highImagePreloads.clear(), ke = A, A.styles.forEach(dn, o), ke = null;
          var on = A.importMapChunks;
          for (re = 0; re < on.length; re++)
            o.push(on[re]);
          on.length = 0, A.bootstrapScripts.forEach(wl, o), A.scripts.forEach(wl, o), A.scripts.clear(), A.bulkPreloads.forEach(wl, o), A.bulkPreloads.clear(), m.instructions |= 32;
          var Ze = A.hoistableChunks;
          for (re = 0; re < Ze.length; re++)
            o.push(Ze[re]);
          for (m = Ze.length = 0; m < p.length; m++) {
            var ze = p[m];
            for (A = 0; A < ze.length; A++)
              wa(i, o, ze[A], null);
          }
          var je = i.renderState.preamble, Xe = je.headChunks;
          if (je.htmlChunks || Xe) {
            var at = Oe("head");
            o.push(at);
          }
          var cn = je.bodyChunks;
          if (cn)
            for (p = 0; p < cn.length; p++)
              o.push(cn[p]);
          wa(i, o, g, null), i.completedRootSegment = null;
          var wn = i.renderState;
          if (i.allPendingTasks !== 0 || i.clientRenderedBoundaries.length !== 0 || i.completedBoundaries.length !== 0 || i.trackedPostpones !== null && (i.trackedPostpones.rootNodes.length !== 0 || i.trackedPostpones.rootSlots !== null)) {
            var Mn = i.resumableState;
            if ((Mn.instructions & 64) === 0) {
              if (Mn.instructions |= 64, o.push(wn.startInlineScript), (Mn.instructions & 32) === 0) {
                Mn.instructions |= 32;
                var en = "_" + Mn.idPrefix + "R_";
                o.push(' id="');
                var yt = he(en);
                o.push(yt), o.push('"');
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
        var Cr = Sn.viewportChunks;
        for (g = 0; g < Cr.length; g++)
          o.push(Cr[g]);
        Cr.length = 0, Sn.preconnects.forEach(wl, o), Sn.preconnects.clear(), Sn.fontPreloads.forEach(wl, o), Sn.fontPreloads.clear(), Sn.highImagePreloads.forEach(
          wl,
          o
        ), Sn.highImagePreloads.clear(), Sn.styles.forEach(ac, o), Sn.scripts.forEach(wl, o), Sn.scripts.clear(), Sn.bulkPreloads.forEach(wl, o), Sn.bulkPreloads.clear();
        var Dn = Sn.hoistableChunks;
        for (g = 0; g < Dn.length; g++)
          o.push(Dn[g]);
        Dn.length = 0;
        var xn = i.clientRenderedBoundaries;
        for (f = 0; f < xn.length; f++) {
          var kn = xn[f];
          Sn = o;
          var qe = i.resumableState, An = i.renderState, $t = kn.rootSegmentID, sn = kn.errorDigest;
          Sn.push(An.startInlineScript), Sn.push(">"), (qe.instructions & 4) === 0 ? (qe.instructions |= 4, Sn.push(
            '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};;$RX("'
          )) : Sn.push('$RX("'), Sn.push(An.boundaryPrefix);
          var pa = $t.toString(16);
          if (Sn.push(pa), Sn.push('"'), sn) {
            Sn.push(",");
            var Zi = gt(
              sn || ""
            );
            Sn.push(Zi);
          }
          var mr = Sn.push(")<\/script>");
          if (!mr) {
            i.destination = null, f++, xn.splice(0, f);
            return;
          }
        }
        xn.splice(0, f);
        var Pl = i.completedBoundaries;
        for (f = 0; f < Pl.length; f++)
          if (!zn(i, o, Pl[f])) {
            i.destination = null, f++, Pl.splice(0, f);
            return;
          }
        Pl.splice(0, f), Do = !0;
        var Fl = i.partialBoundaries;
        for (f = 0; f < Fl.length; f++) {
          var Ol = Fl[f];
          e: {
            xn = i, kn = o, ar = Ol.byteSize;
            var Ei = Ol.completedSegments;
            for (mr = 0; mr < Ei.length; mr++)
              if (!Ja(
                xn,
                kn,
                Ol,
                Ei[mr]
              )) {
                mr++, Ei.splice(0, mr);
                var Qi = !1;
                break e;
              }
            Ei.splice(0, mr);
            var Jt = Ol.row;
            Jt !== null && Jt.together && Ol.pendingTasks === 1 && (Jt.pendingTasks === 1 ? ni(
              xn,
              Jt,
              Jt.hoistables
            ) : Jt.pendingTasks--), Qi = lc(
              kn,
              Ol.contentState,
              xn.renderState
            );
          }
          if (!Qi) {
            i.destination = null, f++, Fl.splice(0, f);
            return;
          }
        }
        Fl.splice(0, f), Do = !1;
        var Va = i.completedBoundaries;
        for (f = 0; f < Va.length; f++)
          if (!zn(i, o, Va[f])) {
            i.destination = null, f++, Va.splice(0, f);
            return;
          }
        Va.splice(0, f);
      }
    } finally {
      Do = !1, i.allPendingTasks === 0 && i.clientRenderedBoundaries.length === 0 && i.completedBoundaries.length === 0 && (i.flushScheduled = !1, f = i.resumableState, f.hasBody && (Fl = Oe("body"), o.push(Fl)), f.hasHtml && (f = Oe("html"), o.push(f)), i.status = 14, o.push(null), i.destination = null);
    }
  }
  function No(i) {
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
        Gn(i, f, {}), Rl(i, f);
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
          return as(p, i, g);
        }), f.clear();
      }
      i.destination !== null && $c(i, i.destination);
    } catch (p) {
      Gn(i, p, {}), Rl(i, p);
    }
  }
  function vt(i, o, f) {
    if (o === null) f.rootNodes.push(i);
    else {
      var g = f.workingMap, p = g.get(o);
      p === void 0 && (p = [o[1], o[2], [], null], g.set(o, p), vt(p, o[0], f)), p[2].push(i);
    }
  }
  function Xi() {
  }
  function cs(i, o, f, g) {
    var p = !1, m = null, A = "", Q = !1;
    if (o = tt(o ? o.identifierPrefix : void 0), i = Ya(
      i,
      o,
      mo(o, f),
      mt(0, null, 0, null),
      1 / 0,
      Xi,
      void 0,
      function() {
        Q = !0;
      },
      void 0,
      void 0,
      void 0
    ), i.flushScheduled = i.destination !== null, os(i), i.status === 10 && (i.status = 11), i.trackedPostpones === null && Nu(i, i.pendingRootTasks === 0), Cs(i, g), Lu(i, {
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
    return cs(
      i,
      o,
      !0,
      'The server used "renderToStaticMarkup" which does not support Suspense. If you intended to have the server wait for the suspended component please switch to "renderToReadableStream" which supports Suspense on the server'
    );
  }, rf.renderToString = function(i, o) {
    return cs(
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
  var ge = Ms(), ue = yf();
  function W(l) {
    var a = "https://react.dev/errors/" + l;
    if (1 < arguments.length) {
      a += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var s = 2; s < arguments.length; s++)
        a += "&args[]=" + encodeURIComponent(arguments[s]);
    }
    return "Minified React error #" + l + "; visit " + a + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  var Ae = /* @__PURE__ */ Symbol.for("react.transitional.element"), ve = /* @__PURE__ */ Symbol.for("react.portal"), Se = /* @__PURE__ */ Symbol.for("react.fragment"), nn = /* @__PURE__ */ Symbol.for("react.strict_mode"), On = /* @__PURE__ */ Symbol.for("react.profiler"), Re = /* @__PURE__ */ Symbol.for("react.consumer"), ie = /* @__PURE__ */ Symbol.for("react.context"), He = /* @__PURE__ */ Symbol.for("react.forward_ref"), P = /* @__PURE__ */ Symbol.for("react.suspense"), N = /* @__PURE__ */ Symbol.for("react.suspense_list"), Fe = /* @__PURE__ */ Symbol.for("react.memo"), ee = /* @__PURE__ */ Symbol.for("react.lazy"), X = /* @__PURE__ */ Symbol.for("react.scope"), ht = /* @__PURE__ */ Symbol.for("react.activity"), rr = /* @__PURE__ */ Symbol.for("react.legacy_hidden"), Ot = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), vl = /* @__PURE__ */ Symbol.for("react.view_transition"), Kt = Symbol.iterator;
  function Vn(l) {
    return l === null || typeof l != "object" ? null : (l = Kt && l[Kt] || l["@@iterator"], typeof l == "function" ? l : null);
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
  var Rt = new MessageChannel(), rn = [];
  Rt.port1.onmessage = function() {
    var l = rn.shift();
    l && l();
  };
  function Kn(l) {
    rn.push(l), Rt.port2.postMessage(null);
  }
  function si(l) {
    setTimeout(function() {
      throw l;
    });
  }
  var Ln = Promise, qr = typeof queueMicrotask == "function" ? queueMicrotask : function(l) {
    Ln.resolve(null).then(l).catch(si);
  }, nt = null, Pe = 0;
  function J(l, a) {
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
  function he(l, a) {
    return J(l, a), !0;
  }
  function xr(l) {
    nt && 0 < Pe && (l.enqueue(new Uint8Array(nt.buffer, 0, Pe)), nt = null, Pe = 0);
  }
  var yl = new TextEncoder();
  function fe(l) {
    return yl.encode(l);
  }
  function T(l) {
    return yl.encode(l);
  }
  function Y(l) {
    return l.byteLength;
  }
  function we(l, a) {
    typeof l.error == "function" ? l.error(a) : l.close();
  }
  var Te = Object.assign, me = Object.prototype.hasOwnProperty, _e = RegExp(
    "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
  ), ke = {}, Ct = {};
  function En(l) {
    return me.call(Ct, l) ? !0 : me.call(ke, l) ? !1 : _e.test(l) ? Ct[l] = !0 : (ke[l] = !0, !1);
  }
  var tt = new Set(
    "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
      " "
    )
  ), mt = /* @__PURE__ */ new Map([
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
  var St = /([A-Z])/g, Tn = /^ms-/, kt = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function Gt(l) {
    return kt.test("" + l) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : l;
  }
  var Xl = ge.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Xt = ue.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, De = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, Er = Xt.d;
  Xt.d = {
    f: Er.f,
    r: Er.r,
    D: as,
    C: Nu,
    L: xi,
    m: Tc,
    X: Gi,
    S: hr,
    M: os
  };
  var At = [], $r = null;
  T('"></template>');
  var Na = T("<script"), vn = T("<\/script>"), lr = T('<script src="'), _n = T('<script type="module" src="'), rc = T(' nonce="'), dt = T(' integrity="'), xo = T(' crossorigin="'), Eo = T(' async=""><\/script>'), el = T("<style"), oa = /(<\/|<)(s)(cript)/gi;
  function fi(l, a, s, v) {
    return "" + a + (s === "s" ? "\\u0073" : "\\u0053") + v;
  }
  var Zl = T(
    '<script type="importmap">'
  ), Ql = T("<\/script>");
  function bl(l, a, s, v, w, C) {
    s = typeof a == "string" ? a : a && a.script;
    var S = s === void 0 ? Na : T(
      '<script nonce="' + Ge(s) + '"'
    ), B = typeof a == "string" ? void 0 : a && a.style, O = B === void 0 ? el : T(
      '<style nonce="' + Ge(B) + '"'
    ), z = l.idPrefix, Z = [], K = l.bootstrapScriptContent, xe = l.bootstrapScripts, pe = l.bootstrapModules;
    if (K !== void 0 && (Z.push(S), ya(Z, l), Z.push(
      Cn,
      fe(
        ("" + K).replace(oa, fi)
      ),
      vn
    )), K = [], v !== void 0 && (K.push(Zl), K.push(
      fe(
        ("" + JSON.stringify(v)).replace(oa, fi)
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
      startInlineScript: S,
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
      nonce: { script: s, style: B },
      hoistableState: null,
      stylesToHoist: !1
    }, xe !== void 0)
      for (v = 0; v < xe.length; v++)
        z = xe[v], B = S = void 0, O = {
          rel: "preload",
          as: "script",
          fetchPriority: "low",
          nonce: a
        }, typeof z == "string" ? O.href = C = z : (O.href = C = z.src, O.integrity = B = typeof z.integrity == "string" ? z.integrity : void 0, O.crossOrigin = S = typeof z == "string" || z.crossOrigin == null ? void 0 : z.crossOrigin === "use-credentials" ? "use-credentials" : ""), z = l, K = C, z.scriptResources[K] = null, z.moduleScriptResources[K] = null, z = [], rt(z, O), w.bootstrapScripts.add(z), Z.push(
          lr,
          fe(Ge(C)),
          Yn
        ), s && Z.push(
          rc,
          fe(Ge(s)),
          Yn
        ), typeof B == "string" && Z.push(
          dt,
          fe(Ge(B)),
          Yn
        ), typeof S == "string" && Z.push(
          xo,
          fe(Ge(S)),
          Yn
        ), ya(Z, l), Z.push(Eo);
    if (pe !== void 0)
      for (a = 0; a < pe.length; a++)
        B = pe[a], C = v = void 0, S = {
          rel: "modulepreload",
          fetchPriority: "low",
          nonce: s
        }, typeof B == "string" ? S.href = xe = B : (S.href = xe = B.src, S.integrity = C = typeof B.integrity == "string" ? B.integrity : void 0, S.crossOrigin = v = typeof B == "string" || B.crossOrigin == null ? void 0 : B.crossOrigin === "use-credentials" ? "use-credentials" : ""), B = l, O = xe, B.scriptResources[O] = null, B.moduleScriptResources[O] = null, B = [], rt(B, S), w.bootstrapScripts.add(B), Z.push(
          _n,
          fe(Ge(xe)),
          Yn
        ), s && Z.push(
          rc,
          fe(Ge(s)),
          Yn
        ), typeof C == "string" && Z.push(
          dt,
          fe(Ge(C)),
          Yn
        ), typeof v == "string" && Z.push(
          xo,
          fe(Ge(v)),
          Yn
        ), ya(Z, l), Z.push(Eo);
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
  function Oe(l, a, s) {
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
  var nl = /* @__PURE__ */ new Map(), gt = T(' style="'), hi = T(":"), ca = T(";");
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
                v.replace(St, "-$1").toLowerCase().replace(Tn, "-ms-")
              )
            ), nl.set(v, C)), w = typeof w == "number" ? w === 0 || tt.has(v) ? fe("" + w) : fe(w + "px") : fe(
              Ge(("" + w).trim())
            );
          s ? (s = !1, l.push(
            gt,
            C,
            hi,
            w
          )) : l.push(ca, C, hi, w);
        }
      }
    s || l.push(Yn);
  }
  var sr = T(" "), tl = T('="'), Yn = T('"'), lc = T('=""');
  function wl(l, a, s) {
    s && typeof s != "function" && typeof s != "symbol" && l.push(sr, fe(a), lc);
  }
  function Rn(l, a, s) {
    typeof s != "function" && typeof s != "symbol" && typeof s != "boolean" && l.push(
      sr,
      fe(a),
      tl,
      fe(Ge(s)),
      Yn
    );
  }
  var ns = T(
    Ge(
      "javascript:throw new Error('React form unexpectedly submitted.')"
    )
  ), dn = T('<input type="hidden"');
  function ic(l, a) {
    this.push(dn), ac(l), Rn(this, "name", a), Rn(this, "value", l), this.push(Vl);
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
  function di(l, a, s, v, w, C, S, B) {
    var O = null;
    if (typeof v == "function") {
      var z = oc(a, v);
      z !== null ? (B = z.name, v = z.action || "", w = z.encType, C = z.method, S = z.target, O = z.data) : (l.push(
        sr,
        fe("formAction"),
        tl,
        ns,
        Yn
      ), S = C = w = v = B = null, ts(a, s));
    }
    return B != null && Bn(l, "name", B), v != null && Bn(l, "formAction", v), w != null && Bn(l, "formEncType", w), C != null && Bn(l, "formMethod", C), S != null && Bn(l, "formTarget", S), O;
  }
  function Bn(l, a, s) {
    switch (a) {
      case "className":
        Rn(l, "class", s);
        break;
      case "tabIndex":
        Rn(l, "tabindex", s);
        break;
      case "dir":
      case "role":
      case "viewBox":
      case "width":
      case "height":
        Rn(l, a, s);
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
          sr,
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
        wl(l, a.toLowerCase(), s);
        break;
      case "xlinkHref":
        if (typeof s == "function" || typeof s == "symbol" || typeof s == "boolean")
          break;
        s = Gt("" + s), l.push(
          sr,
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
          sr,
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
          sr,
          fe(a),
          lc
        );
        break;
      case "capture":
      case "download":
        s === !0 ? l.push(
          sr,
          fe(a),
          lc
        ) : s !== !1 && typeof s != "function" && typeof s != "symbol" && l.push(
          sr,
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
          sr,
          fe(a),
          tl,
          fe(Ge(s)),
          Yn
        );
        break;
      case "rowSpan":
      case "start":
        typeof s == "function" || typeof s == "symbol" || isNaN(s) || l.push(
          sr,
          fe(a),
          tl,
          fe(Ge(s)),
          Yn
        );
        break;
      case "xlinkActuate":
        Rn(l, "xlink:actuate", s);
        break;
      case "xlinkArcrole":
        Rn(l, "xlink:arcrole", s);
        break;
      case "xlinkRole":
        Rn(l, "xlink:role", s);
        break;
      case "xlinkShow":
        Rn(l, "xlink:show", s);
        break;
      case "xlinkTitle":
        Rn(l, "xlink:title", s);
        break;
      case "xlinkType":
        Rn(l, "xlink:type", s);
        break;
      case "xmlBase":
        Rn(l, "xml:base", s);
        break;
      case "xmlLang":
        Rn(l, "xml:lang", s);
        break;
      case "xmlSpace":
        Rn(l, "xml:space", s);
        break;
      default:
        if ((!(2 < a.length) || a[0] !== "o" && a[0] !== "O" || a[1] !== "n" && a[1] !== "N") && (a = mt.get(a) || a, En(a))) {
          switch (typeof s) {
            case "function":
            case "symbol":
              return;
            case "boolean":
              var v = a.toLowerCase().slice(0, 5);
              if (v !== "data-" && v !== "aria-") return;
          }
          l.push(
            sr,
            fe(a),
            tl,
            fe(Ge(s)),
            Yn
          );
        }
    }
  }
  var Cn = T(">"), Vl = T("/>");
  function fr(l, a, s) {
    if (a != null) {
      if (s != null) throw Error(W(60));
      if (typeof a != "object" || !("__html" in a))
        throw Error(W(61));
      a = a.__html, a != null && l.push(fe("" + a));
    }
  }
  function _a(l) {
    var a = "";
    return ge.Children.forEach(l, function(s) {
      s != null && (a += s);
    }), a;
  }
  var Wc = T(' selected=""'), Rr = T(
    `addEventListener("submit",function(a){if(!a.defaultPrevented){var c=a.target,d=a.submitter,e=c.action,b=d;if(d){var f=d.getAttribute("formAction");null!=f&&(e=f,b=null)}"javascript:throw new Error('React form unexpectedly submitted.')"===e&&(a.preventDefault(),b?(a=document.createElement("input"),a.name=b.name,a.value=b.value,b.parentNode.insertBefore(a,b),b=new FormData(c),a.parentNode.removeChild(a)):b=new FormData(c),a=c.ownerDocument||c,(a.$$reactFormReplay=a.$$reactFormReplay||[]).push(c,d,b))}});`
  );
  function ts(l, a) {
    if ((l.instructions & 16) === 0) {
      l.instructions |= 16;
      var s = a.preamble, v = a.bootstrapChunks;
      (s.htmlChunks || s.headChunks) && v.length === 0 ? (v.push(a.startInlineScript), ya(v, l), v.push(
        Cn,
        Rr,
        vn
      )) : v.unshift(
        a.startInlineScript,
        Cn,
        Rr,
        vn
      );
    }
  }
  var Su = T("<!--F!-->"), Yc = T("<!--F-->");
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
              Bn(l, s, v);
          }
      }
    return l.push(Vl), null;
  }
  var Gc = /(<\/|<)(s)(tyle)/gi;
  function Ro(l, a, s, v) {
    return "" + a + (s === "s" ? "\\73 " : "\\53 ") + v;
  }
  function pl(l, a, s) {
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
              Bn(l, v, w);
          }
      }
    return l.push(Vl), null;
  }
  function Ba(l, a) {
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
              Bn(l, w, C);
          }
      }
    return l.push(Cn), a = Array.isArray(s) ? 2 > s.length ? s[0] : null : s, typeof a != "function" && typeof a != "symbol" && a !== null && a !== void 0 && l.push(fe(Ge("" + a))), fr(l, v, s), l.push(yi("title")), null;
  }
  var rs = T("<!--head-->"), ls = T("<!--body-->"), Co = T("<!--html-->");
  function mo(l, a) {
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
              Bn(l, w, C);
          }
      }
    return l.push(Cn), fr(l, v, s), typeof s == "string" && l.push(
      fe(("" + s).replace(oa, fi))
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
              Bn(l, w, C);
          }
      }
    return l.push(Cn), fr(l, v, s), s;
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
              Bn(l, w, C);
          }
      }
    return l.push(Cn), fr(l, v, s), typeof s == "string" ? (l.push(fe(Ge(s))), null) : s;
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
  var So = T("<!DOCTYPE html>");
  function sc(l, a, s, v, w, C, S, B, O) {
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
                  xe === "" ? Rn(l, "href", "") : Bn(l, K, xe);
                  break;
                default:
                  Bn(l, K, xe);
              }
          }
        if (l.push(Cn), fr(l, Z, z), typeof z == "string") {
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
            var wt = s[bn];
            if (wt != null)
              switch (bn) {
                case "children":
                  yn = wt;
                  break;
                case "dangerouslySetInnerHTML":
                  Qe = wt;
                  break;
                case "defaultValue":
                case "value":
                  break;
                default:
                  Bn(
                    l,
                    bn,
                    wt
                  );
              }
          }
        return l.push(Cn), fr(l, Qe, yn), yn;
      case "option":
        var $n = B.selectedValue;
        l.push(Zt("option"));
        var vr = null, ll = null, Nl = null, Je = null, Fr;
        for (Fr in s)
          if (me.call(s, Fr)) {
            var It = s[Fr];
            if (It != null)
              switch (Fr) {
                case "children":
                  vr = It;
                  break;
                case "selected":
                  Nl = It;
                  break;
                case "dangerouslySetInnerHTML":
                  Je = It;
                  break;
                case "value":
                  ll = It;
                default:
                  Bn(
                    l,
                    Fr,
                    It
                  );
              }
          }
        if ($n != null) {
          var Qr = ll !== null ? "" + ll : _a(vr);
          if (Ie($n)) {
            for (var ji = 0; ji < $n.length; ji++)
              if ("" + $n[ji] === Qr) {
                l.push(Wc);
                break;
              }
          } else
            "" + $n === Qr && l.push(Wc);
        } else Nl && l.push(Wc);
        return l.push(Cn), fr(l, Je, vr), vr;
      case "textarea":
        l.push(Zt("textarea"));
        var pt = null, lo = null, Ll = null, Or;
        for (Or in s)
          if (me.call(s, Or)) {
            var ii = s[Or];
            if (ii != null)
              switch (Or) {
                case "children":
                  Ll = ii;
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
                  Bn(
                    l,
                    Or,
                    ii
                  );
              }
          }
        if (pt === null && lo !== null && (pt = lo), l.push(Cn), Ll != null) {
          if (pt != null) throw Error(W(92));
          if (Ie(Ll)) {
            if (1 < Ll.length)
              throw Error(W(93));
            pt = "" + Ll[0];
          }
          pt = "" + Ll;
        }
        return typeof pt == "string" && pt[0] === `
` && l.push(Xc), pt !== null && l.push(
          fe(Ge("" + pt))
        ), null;
      case "input":
        l.push(Zt("input"));
        var Mr = null, io = null, Yo = null, Jr = null, Go = null, Ir = null, ao = null, Gu = null, ot = null, Xo;
        for (Xo in s)
          if (me.call(s, Xo)) {
            var ai = s[Xo];
            if (ai != null)
              switch (Xo) {
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(W(399, "input"));
                case "name":
                  Mr = ai;
                  break;
                case "formAction":
                  io = ai;
                  break;
                case "formEncType":
                  Yo = ai;
                  break;
                case "formMethod":
                  Jr = ai;
                  break;
                case "formTarget":
                  Go = ai;
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
                  Ir = ai;
                  break;
                default:
                  Bn(
                    l,
                    Xo,
                    ai
                  );
              }
          }
        var uu = di(
          l,
          v,
          w,
          io,
          Yo,
          Jr,
          Go,
          Mr
        );
        return Gu !== null ? wl(l, "checked", Gu) : ot !== null && wl(l, "checked", ot), Ir !== null ? Bn(l, "value", Ir) : ao !== null && Bn(l, "value", ao), l.push(Vl), uu?.forEach(ic, l), null;
      case "button":
        l.push(Zt("button"));
        var oo = null, su = null, fu = null, Zo = null, Aa = null, hu = null, Ci = null, co;
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
                  Zo = uo;
                  break;
                case "formEncType":
                  Aa = uo;
                  break;
                case "formMethod":
                  hu = uo;
                  break;
                case "formTarget":
                  Ci = uo;
                  break;
                default:
                  Bn(
                    l,
                    co,
                    uo
                  );
              }
          }
        var ds = di(
          l,
          v,
          w,
          Zo,
          Aa,
          hu,
          Ci,
          fu
        );
        if (l.push(Cn), ds?.forEach(ic, l), fr(l, su, oo), typeof oo == "string") {
          l.push(
            fe(Ge(oo))
          );
          var _l = null;
        } else _l = oo;
        return _l;
      case "form":
        l.push(Zt("form"));
        var gs = null, kl = null, Pa = null, qi = null, du = null, gu = null, vu;
        for (vu in s)
          if (me.call(s, vu)) {
            var so = s[vu];
            if (so != null)
              switch (vu) {
                case "children":
                  gs = so;
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
                  Bn(
                    l,
                    vu,
                    so
                  );
              }
          }
        var vs = null, Xu = null;
        if (typeof Pa == "function") {
          var Qo = oc(
            v,
            Pa
          );
          Qo !== null ? (Pa = Qo.action || "", qi = Qo.encType, du = Qo.method, gu = Qo.target, vs = Qo.data, Xu = Qo.name) : (l.push(
            sr,
            fe("action"),
            tl,
            ns,
            Yn
          ), gu = du = qi = Pa = null, ts(v, w));
        }
        if (Pa != null && Bn(l, "action", Pa), qi != null && Bn(l, "encType", qi), du != null && Bn(l, "method", du), gu != null && Bn(l, "target", gu), l.push(Cn), Xu !== null && (l.push(dn), Rn(l, "name", Xu), l.push(Vl), vs?.forEach(ic, l)), fr(l, kl, gs), typeof gs == "string") {
          l.push(
            fe(Ge(gs))
          );
          var ys = null;
        } else ys = gs;
        return ys;
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
                  Bn(
                    l,
                    yu,
                    ms
                  );
              }
          }
        return l.push(Cn), null;
      case "object":
        l.push(Zt("object"));
        var Zu = null, Ss = null, bu;
        for (bu in s)
          if (me.call(s, bu)) {
            var Jo = s[bu];
            if (Jo != null)
              switch (bu) {
                case "children":
                  Zu = Jo;
                  break;
                case "dangerouslySetInnerHTML":
                  Ss = Jo;
                  break;
                case "data":
                  var Is = Gt("" + Jo);
                  if (Is === "") break;
                  l.push(
                    sr,
                    fe("data"),
                    tl,
                    fe(Ge(Is)),
                    Yn
                  );
                  break;
                default:
                  Bn(
                    l,
                    bu,
                    Jo
                  );
              }
          }
        if (l.push(Cn), fr(l, Ss, Zu), typeof Zu == "string") {
          l.push(
            fe(Ge(Zu))
          );
          var Ds = null;
        } else Ds = Zu;
        return Ds;
      case "title":
        var mi = B.tagScope & 1, bs = B.tagScope & 4;
        if (B.insertionMode === 4 || mi || s.itemProp != null)
          var Ns = Ba(
            l,
            s
          );
        else
          bs ? Ns = null : (Ba(w.hoistableChunks, s), Ns = void 0);
        return Ns;
      case "link":
        var or = B.tagScope & 1, $i = B.tagScope & 4, Dr = s.rel, Fa = s.href, Bl = s.precedence;
        if (B.insertionMode === 4 || or || s.itemProp != null || typeof Dr != "string" || typeof Fa != "string" || Fa === "") {
          rt(l, s);
          var Nn = null;
        } else if (s.rel === "stylesheet")
          if (typeof Bl != "string" || s.disabled != null || s.onLoad || s.onError)
            Nn = rt(
              l,
              s
            );
          else {
            var il = w.styles.get(Bl), ea = v.styleResources.hasOwnProperty(Fa) ? v.styleResources[Fa] : void 0;
            if (ea !== null) {
              v.styleResources[Fa] = null, il || (il = {
                precedence: fe(Ge(Bl)),
                rules: [],
                hrefs: [],
                sheets: /* @__PURE__ */ new Map()
              }, w.styles.set(Bl, il));
              var zt = {
                state: 0,
                props: Te({}, s, {
                  "data-precedence": s.precedence,
                  precedence: null
                })
              };
              if (ea) {
                ea.length === 2 && Za(zt.props, ea);
                var Mc = w.preloads.stylesheets.get(Fa);
                Mc && 0 < Mc.length ? Mc.length = 0 : zt.state = 1;
              }
              il.sheets.set(Fa, zt), S && S.stylesheets.add(zt);
            } else if (il) {
              var wu = il.sheets.get(Fa);
              wu && S && S.stylesheets.add(wu);
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
        var ws = B.tagScope & 1, Vo = s.async;
        if (typeof s.src != "string" || !s.src || !Vo || typeof Vo == "function" || typeof Vo == "symbol" || s.onLoad || s.onError || B.insertionMode === 4 || ws || s.itemProp != null)
          var fo = mo(
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
            w.scripts.add(u), mo(u, n);
          }
          O && l.push(We), fo = null;
        }
        return fo;
      case "style":
        var d = B.tagScope & 1, b = s.precedence, E = s.href, F = s.nonce;
        if (B.insertionMode === 4 || d || s.itemProp != null || typeof b != "string" || typeof E != "string" || E === "") {
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
                    Bn(
                      l,
                      H,
                      j
                    );
                }
            }
          l.push(Cn);
          var de = Array.isArray(D) ? 2 > D.length ? D[0] : null : D;
          typeof de != "function" && typeof de != "symbol" && de !== null && de !== void 0 && l.push(
            fe(("" + de).replace(Gc, Ro))
          ), fr(l, te, D), l.push(yi("style"));
          var Ce = null;
        } else {
          var be = w.styles.get(b);
          if ((v.styleResources.hasOwnProperty(E) ? v.styleResources[E] : void 0) !== null) {
            v.styleResources[E] = null, be || (be = {
              precedence: fe(
                Ge(b)
              ),
              rules: [],
              hrefs: [],
              sheets: /* @__PURE__ */ new Map()
            }, w.styles.set(b, be));
            var ae = w.nonce.style;
            if (!ae || ae === F) {
              be.hrefs.push(
                fe(Ge(E))
              );
              var fn = be.rules, Jn = null, Ye = null, Pn;
              for (Pn in s)
                if (me.call(s, Pn)) {
                  var yr = s[Pn];
                  if (yr != null)
                    switch (Pn) {
                      case "children":
                        Jn = yr;
                        break;
                      case "dangerouslySetInnerHTML":
                        Ye = yr;
                    }
                }
              var br = Array.isArray(Jn) ? 2 > Jn.length ? Jn[0] : null : Jn;
              typeof br != "function" && typeof br != "symbol" && br !== null && br !== void 0 && fn.push(
                fe(
                  ("" + br).replace(Gc, Ro)
                )
              ), fr(fn, Ye, Jn);
            }
          }
          be && S && S.styles.add(be), O && l.push(We), Ce = void 0;
        }
        return Ce;
      case "meta":
        var In = B.tagScope & 1, er = B.tagScope & 4;
        if (B.insertionMode === 4 || In || s.itemProp != null)
          var Si = pl(
            l,
            s,
            "meta"
          );
        else
          O && l.push(We), Si = er ? null : typeof s.charSet == "string" ? pl(w.charsetChunks, s, "meta") : s.name === "viewport" ? pl(w.viewportChunks, s, "meta") : pl(w.hoistableChunks, s, "meta");
        return Si;
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
                  Bn(
                    l,
                    Hn,
                    Un
                  );
              }
          }
        if (l.push(Cn), Me != null) {
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
        var Tt = B.tagScope & 3, pn = s.src, tn = s.srcSet;
        if (!(s.loading === "lazy" || !pn && !tn || typeof pn != "string" && pn != null || typeof tn != "string" && tn != null || s.fetchPriority === "low" || Tt) && (typeof pn != "string" || pn[4] !== ":" || pn[0] !== "d" && pn[0] !== "D" || pn[1] !== "a" && pn[1] !== "A" || pn[2] !== "t" && pn[2] !== "T" || pn[3] !== "a" && pn[3] !== "A") && (typeof tn != "string" || tn[4] !== ":" || tn[0] !== "d" && tn[0] !== "D" || tn[1] !== "a" && tn[1] !== "A" || tn[2] !== "t" && tn[2] !== "T" || tn[3] !== "a" && tn[3] !== "A")) {
          S !== null && B.tagScope & 64 && (S.suspenseyImages = !0);
          var Nr = typeof s.sizes == "string" ? s.sizes : void 0, Wn = tn ? tn + `
` + (Nr || "") : pn, wr = w.preloads.images, ct = wr.get(Wn);
          if (ct)
            (s.fetchPriority === "high" || 10 > w.highImagePreloads.size) && (wr.delete(Wn), w.highImagePreloads.add(ct));
          else if (!v.imageResources.hasOwnProperty(Wn)) {
            v.imageResources[Wn] = At;
            var al = s.crossOrigin, Ko = typeof al == "string" ? al === "use-credentials" ? al : "" : void 0, ol = w.headers, ki;
            ol && 0 < ol.remainingCapacity && typeof s.srcSet != "string" && (s.fetchPriority === "high" || 500 > ol.highImagePreloads.length) && (ki = qc(pn, "image", {
              imageSrcSet: s.srcSet,
              imageSizes: s.sizes,
              crossOrigin: Ko,
              integrity: s.integrity,
              nonce: s.nonce,
              type: s.type,
              fetchPriority: s.fetchPriority,
              referrerPolicy: s.refererPolicy
            }), 0 <= (ol.remainingCapacity -= ki.length + 2)) ? (w.resets.image[Wn] = At, ol.highImagePreloads && (ol.highImagePreloads += ", "), ol.highImagePreloads += ki) : (ct = [], rt(ct, {
              rel: "preload",
              as: "image",
              href: tn ? void 0 : pn,
              imageSrcSet: tn,
              imageSizes: Nr,
              crossOrigin: Ko,
              integrity: s.integrity,
              type: s.type,
              fetchPriority: s.fetchPriority,
              referrerPolicy: s.referrerPolicy
            }), s.fetchPriority === "high" || 10 > w.highImagePreloads.size ? w.highImagePreloads.add(ct) : (w.bulkPreloads.add(ct), wr.set(Wn, ct)));
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
        if (2 > B.insertionMode) {
          var Ai = C || w.preamble;
          if (Ai.headChunks)
            throw Error(W(545, "`<head>`"));
          C !== null && l.push(rs), Ai.headChunks = [];
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
        if (2 > B.insertionMode) {
          var cr = C || w.preamble;
          if (cr.bodyChunks)
            throw Error(W(545, "`<body>`"));
          C !== null && l.push(ls), cr.bodyChunks = [];
          var e = gi(
            cr.bodyChunks,
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
        if (B.insertionMode === 0) {
          var t = C || w.preamble;
          if (t.htmlChunks)
            throw Error(W(545, "`<html>`"));
          C !== null && l.push(Co), t.htmlChunks = [So];
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
              var k = s[x];
              if (k != null) {
                var M = x;
                switch (x) {
                  case "children":
                    h = k;
                    break;
                  case "dangerouslySetInnerHTML":
                    y = k;
                    break;
                  case "style":
                    La(l, k);
                    break;
                  case "suppressContentEditableWarning":
                  case "suppressHydrationWarning":
                  case "ref":
                    break;
                  case "className":
                    M = "class";
                  default:
                    if (En(x) && typeof k != "function" && typeof k != "symbol" && k !== !1) {
                      if (k === !0) k = "";
                      else if (typeof k == "object") continue;
                      l.push(
                        sr,
                        fe(M),
                        tl,
                        fe(Ge(k)),
                        Yn
                      );
                    }
                }
              }
            }
          return l.push(Cn), fr(l, y, h), h;
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
  ), ku = T('<template id="'), hc = T('"></template>'), Wr = T("<!--&-->"), dc = T("<!--/&-->"), ua = T("<!--$-->"), ko = T(
    '<!--$?--><template id="'
  ), Yr = T('"></template>'), jt = T("<!--$!-->"), jn = T("<!--/$-->"), Au = T("<template"), Ni = T('"'), jl = T(' data-dgst="');
  T(' data-msg="'), T(' data-stck="'), T(' data-cstck="');
  var Pu = T("></template>");
  function Li(l, a, s) {
    if (J(l, ko), s === null) throw Error(W(395));
    return J(l, a.boundaryPrefix), J(l, fe(s.toString(16))), he(l, Yr);
  }
  var bi = T('<div hidden id="'), Ao = T('">'), _i = T("</div>"), Bi = T(
    '<svg aria-hidden="true" style="display:none" id="'
  ), Po = T('">'), $e = T("</svg>"), ql = T(
    '<math aria-hidden="true" style="display:none" id="'
  ), Dt = T('">'), wi = T("</math>"), Qt = T('<table hidden id="'), sa = T('">'), za = T("</table>"), pi = T('<table hidden><tbody id="'), zi = T('">'), Nt = T("</tbody></table>"), Hi = T('<table hidden><tr id="'), Ui = T('">'), Ha = T("</tr></table>"), fa = T(
    '<table hidden><colgroup id="'
  ), Ua = T('">'), Gr = T("</colgroup></table>");
  function Wa(l, a, s, v) {
    switch (s.insertionMode) {
      case 0:
      case 1:
      case 3:
      case 2:
        return J(l, bi), J(l, a.segmentPrefix), J(l, fe(v.toString(16))), he(l, Ao);
      case 4:
        return J(l, Bi), J(l, a.segmentPrefix), J(l, fe(v.toString(16))), he(l, Po);
      case 5:
        return J(l, ql), J(l, a.segmentPrefix), J(l, fe(v.toString(16))), he(l, Dt);
      case 6:
        return J(l, Qt), J(l, a.segmentPrefix), J(l, fe(v.toString(16))), he(l, sa);
      case 7:
        return J(l, pi), J(l, a.segmentPrefix), J(l, fe(v.toString(16))), he(l, zi);
      case 8:
        return J(l, Hi), J(l, a.segmentPrefix), J(l, fe(v.toString(16))), he(l, Ui);
      case 9:
        return J(l, fa), J(l, a.segmentPrefix), J(l, fe(v.toString(16))), he(l, Ua);
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
        return he(l, _i);
      case 4:
        return he(l, $e);
      case 5:
        return he(l, wi);
      case 6:
        return he(l, za);
      case 7:
        return he(l, Nt);
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
  ), Ou = T('$RS("'), Mu = T('","'), Fo = T('")<\/script>');
  T('<template data-rsi="" data-sid="'), T('" data-pid="');
  var Oo = T(
    `$RB=[];$RV=function(a){$RT=performance.now();for(var b=0;b<a.length;b+=2){var c=a[b],e=a[b+1];null!==e.parentNode&&e.parentNode.removeChild(e);var f=c.parentNode;if(f){var g=c.previousSibling,h=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d||"/&"===d)if(0===h)break;else h--;else"$"!==d&&"$?"!==d&&"$~"!==d&&"$!"!==d&&"&"!==d||h++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;e.firstChild;)f.insertBefore(e.firstChild,c);g.data="$";g._reactRetry&&requestAnimationFrame(g._reactRetry)}}a.length=0};
$RC=function(a,b){if(b=document.getElementById(b))(a=document.getElementById(a))?(a.previousSibling.data="$~",$RB.push(a,b),2===$RB.length&&("number"!==typeof $RT?requestAnimationFrame($RV.bind(null,$RB)):(a=performance.now(),setTimeout($RV.bind(null,$RB),2300>a&&2E3<a?2300-a:$RT+300-a)))):b.parentNode.removeChild(b)};`
  );
  fe(
    `$RV=function(A,g){function k(a,b){var e=a.getAttribute(b);e&&(b=a.style,l.push(a,b.viewTransitionName,b.viewTransitionClass),"auto"!==e&&(b.viewTransitionClass=e),(a=a.getAttribute("vt-name"))||(a="_T_"+K++ +"_"),b.viewTransitionName=a,B=!0)}var B=!1,K=0,l=[];try{var f=document.__reactViewTransition;if(f){f.finished.finally($RV.bind(null,g));return}var m=new Map;for(f=1;f<g.length;f+=2)for(var h=g[f].querySelectorAll("[vt-share]"),d=0;d<h.length;d++){var c=h[d];m.set(c.getAttribute("vt-name"),c)}var u=[];for(h=0;h<g.length;h+=2){var C=g[h],x=C.parentNode;if(x){var v=x.getBoundingClientRect();if(v.left||v.top||v.width||v.height){c=C;for(f=0;c;){if(8===c.nodeType){var r=c.data;if("/$"===r)if(0===f)break;else f--;else"$"!==r&&"$?"!==r&&"$~"!==r&&"$!"!==r||f++}else if(1===c.nodeType){d=c;var D=d.getAttribute("vt-name"),y=m.get(D);k(d,y?"vt-share":"vt-exit");y&&(k(y,"vt-share"),m.set(D,null));var E=d.querySelectorAll("[vt-share]");for(d=0;d<E.length;d++){var F=E[d],G=F.getAttribute("vt-name"),
H=m.get(G);H&&(k(F,"vt-share"),k(H,"vt-share"),m.set(G,null))}}c=c.nextSibling}for(var I=g[h+1],t=I.firstElementChild;t;)null!==m.get(t.getAttribute("vt-name"))&&k(t,"vt-enter"),t=t.nextElementSibling;c=x;do for(var n=c.firstElementChild;n;){var J=n.getAttribute("vt-update");J&&"none"!==J&&!l.includes(n)&&k(n,"vt-update");n=n.nextElementSibling}while((c=c.parentNode)&&1===c.nodeType&&"none"!==c.getAttribute("vt-update"));u.push.apply(u,I.querySelectorAll('img[src]:not([loading="lazy"])'))}}}if(B){var z=
document.__reactViewTransition=document.startViewTransition({update:function(){A(g);for(var a=[document.documentElement.clientHeight,document.fonts.ready],b={},e=0;e<u.length;b={g:b.g},e++)if(b.g=u[e],!b.g.complete){var p=b.g.getBoundingClientRect();0<p.bottom&&0<p.right&&p.top<window.innerHeight&&p.left<window.innerWidth&&(p=new Promise(function(w){return function(q){w.g.addEventListener("load",q);w.g.addEventListener("error",q)}}(b)),a.push(p))}return Promise.race([Promise.all(a),new Promise(function(w){var q=
performance.now();setTimeout(w,2300>q&&2E3<q?2300-q:500)})])},types:[]});z.ready.finally(function(){for(var a=l.length-3;0<=a;a-=3){var b=l[a],e=b.style;e.viewTransitionName=l[a+1];e.viewTransitionClass=l[a+1];""===b.getAttribute("style")&&b.removeAttribute("style")}});z.finished.finally(function(){document.__reactViewTransition===z&&(document.__reactViewTransition=null)});$RB=[];return}}catch(a){}A(g)}.bind(null,$RV);`
  );
  var Mo = T('$RC("'), qt = T(
    `$RM=new Map;$RR=function(n,w,p){function u(q){this._p=null;q()}for(var r=new Map,t=document,h,b,e=t.querySelectorAll("link[data-precedence],style[data-precedence]"),v=[],k=0;b=e[k++];)"not all"===b.getAttribute("media")?v.push(b):("LINK"===b.tagName&&$RM.set(b.getAttribute("href"),b),r.set(b.dataset.precedence,h=b));e=0;b=[];var l,a;for(k=!0;;){if(k){var f=p[e++];if(!f){k=!1;e=0;continue}var c=!1,m=0;var d=f[m++];if(a=$RM.get(d)){var g=a._p;c=!0}else{a=t.createElement("link");a.href=d;a.rel=
"stylesheet";for(a.dataset.precedence=l=f[m++];g=f[m++];)a.setAttribute(g,f[m++]);g=a._p=new Promise(function(q,x){a.onload=u.bind(a,q);a.onerror=u.bind(a,x)});$RM.set(d,a)}d=a.getAttribute("media");!g||d&&!matchMedia(d).matches||b.push(g);if(c)continue}else{a=v[e++];if(!a)break;l=a.getAttribute("data-precedence");a.removeAttribute("media")}c=r.get(l)||h;c===h&&(h=a);r.set(l,a);c?c.parentNode.insertBefore(a,c.nextSibling):(c=t.head,c.insertBefore(a,c.firstChild))}if(p=document.getElementById(n))p.previousSibling.data=
"$~";Promise.all(b).then($RC.bind(null,n,w),$RX.bind(null,n,"CSS failed to load"))};$RR("`
  ), is = T('$RR("'), ha = T('","'), gc = T('",'), Qc = T('"'), Wi = T(")<\/script>");
  T('<template data-rci="" data-bid="'), T('<template data-rri="" data-bid="'), T('" data-sid="'), T('" data-sty="');
  var da = T(
    '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};'
  ), Io = T(
    '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};;$RX("'
  ), ei = T('$RX("'), ga = T('"'), va = T(","), Iu = T(")<\/script>");
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
  var Lt = /[&><\u2028\u2029]/g;
  function Ti(l) {
    return JSON.stringify(l).replace(
      Lt,
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
  ), yc = T('" data-href="'), Jc = T('">'), Tl = T("</style>"), xl = !1, rl = !0;
  function El(l) {
    var a = l.rules, s = l.hrefs, v = 0;
    if (s.length) {
      for (J(this, $r.startInlineStyle), J(this, vc), J(this, l.precedence), J(this, yc); v < s.length - 1; v++)
        J(this, s[v]), J(this, bc);
      for (J(this, s[v]), J(this, Jc), v = 0; v < a.length; v++) J(this, a[v]);
      rl = he(
        this,
        Tl
      ), xl = !0, a.length = 0, s.length = 0;
    }
  }
  function Gn(l) {
    return l.state !== 2 ? xl = !0 : !1;
  }
  function Rl(l, a, s) {
    return xl = !1, rl = !0, $r = s, a.styles.forEach(El, l), $r = null, a.stylesheets.forEach(Gn), xl && (s.stylesToHoist = !0), rl;
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
  var mn = T(' id="');
  function ya(l, a) {
    (a.instructions & 32) === 0 && (a.instructions |= 32, l.push(
      mn,
      fe(Ge("_" + a.idPrefix + "R_")),
      Yn
    ));
  }
  var Ga = T("["), Xa = T(",["), ba = T(","), Du = T("]");
  function ir(l, a) {
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
          var w = v.props["data-precedence"], C = v.props, S = Gt("" + v.props.href);
          J(
            l,
            fe(Ti(S))
          ), w = "" + w, J(l, ba), J(
            l,
            fe(Ti(w))
          );
          for (var B in C)
            if (me.call(C, B) && (w = C[B], w != null))
              switch (B) {
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
                    B,
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
        if (2 < a.length && (a[0] === "o" || a[0] === "O") && (a[1] === "n" || a[1] === "N") || !En(a))
          return;
        a = "" + s;
    }
    J(l, ba), J(
      l,
      fe(Ti(v))
    ), J(l, ba), J(
      l,
      fe(Ti(a))
    );
  }
  function ti() {
    return { styles: /* @__PURE__ */ new Set(), stylesheets: /* @__PURE__ */ new Set(), suspenseyImages: !1 };
  }
  function as(l) {
    var a = un || null;
    if (a) {
      var s = a.resumableState, v = a.renderState;
      if (typeof l == "string" && l) {
        if (!s.dnsResources.hasOwnProperty(l)) {
          s.dnsResources[l] = null, s = v.headers;
          var w, C;
          (C = s && 0 < s.remainingCapacity) && (C = (w = "<" + ("" + l).replace(
            Qa,
            dr
          ) + ">; rel=dns-prefetch", 0 <= (s.remainingCapacity -= w.length + 2))), C ? (v.resets.dns[l] = null, s.preconnects && (s.preconnects += ", "), s.preconnects += w) : (w = [], rt(w, { href: l, rel: "dns-prefetch" }), v.preconnects.add(w));
        }
        ka(a);
      }
    } else Er.D(l);
  }
  function Nu(l, a) {
    var s = un || null;
    if (s) {
      var v = s.resumableState, w = s.renderState;
      if (typeof l == "string" && l) {
        var C = a === "use-credentials" ? "credentials" : typeof a == "string" ? "anonymous" : "default";
        if (!v.connectResources[C].hasOwnProperty(l)) {
          v.connectResources[C][l] = null, v = w.headers;
          var S, B;
          if (B = v && 0 < v.remainingCapacity) {
            if (B = "<" + ("" + l).replace(
              Qa,
              dr
            ) + ">; rel=preconnect", typeof a == "string") {
              var O = ("" + a).replace(
                ar,
                wa
              );
              B += '; crossorigin="' + O + '"';
            }
            B = (S = B, 0 <= (v.remainingCapacity -= S.length + 2));
          }
          B ? (w.resets.connect[C][l] = null, v.preconnects && (v.preconnects += ", "), v.preconnects += S) : (C = [], rt(C, {
            rel: "preconnect",
            href: l,
            crossOrigin: a
          }), w.preconnects.add(C));
        }
        ka(s);
      }
    } else Er.C(l, a);
  }
  function xi(l, a, s) {
    var v = un || null;
    if (v) {
      var w = v.resumableState, C = v.renderState;
      if (a && l) {
        switch (a) {
          case "image":
            if (s)
              var S = s.imageSrcSet, B = s.imageSizes, O = s.fetchPriority;
            var z = S ? S + `
` + (B || "") : l;
            if (w.imageResources.hasOwnProperty(z)) return;
            w.imageResources[z] = At, w = C.headers;
            var Z;
            w && 0 < w.remainingCapacity && typeof S != "string" && O === "high" && (Z = qc(l, a, s), 0 <= (w.remainingCapacity -= Z.length + 2)) ? (C.resets.image[z] = At, w.highImagePreloads && (w.highImagePreloads += ", "), w.highImagePreloads += Z) : (w = [], rt(
              w,
              Te(
                { rel: "preload", href: S ? void 0 : l, as: a },
                s
              )
            ), O === "high" ? C.highImagePreloads.add(w) : (C.bulkPreloads.add(w), C.preloads.images.set(z, w)));
            break;
          case "style":
            if (w.styleResources.hasOwnProperty(l)) return;
            S = [], rt(
              S,
              Te({ rel: "preload", href: l, as: a }, s)
            ), w.styleResources[l] = !s || typeof s.crossOrigin != "string" && typeof s.integrity != "string" ? At : [s.crossOrigin, s.integrity], C.preloads.stylesheets.set(l, S), C.bulkPreloads.add(S);
            break;
          case "script":
            if (w.scriptResources.hasOwnProperty(l)) return;
            S = [], C.preloads.scripts.set(l, S), C.bulkPreloads.add(S), rt(
              S,
              Te({ rel: "preload", href: l, as: a }, s)
            ), w.scriptResources[l] = !s || typeof s.crossOrigin != "string" && typeof s.integrity != "string" ? At : [s.crossOrigin, s.integrity];
            break;
          default:
            if (w.unknownResources.hasOwnProperty(a)) {
              if (S = w.unknownResources[a], S.hasOwnProperty(l))
                return;
            } else
              S = {}, w.unknownResources[a] = S;
            S[l] = At, (w = C.headers) && 0 < w.remainingCapacity && a === "font" && (z = qc(l, a, s), 0 <= (w.remainingCapacity -= z.length + 2)) ? (C.resets.font[l] = At, w.fontPreloads && (w.fontPreloads += ", "), w.fontPreloads += z) : (w = [], l = Te({ rel: "preload", href: l, as: a }, s), rt(w, l), a) === "font" ? C.fontPreloads.add(w) : C.bulkPreloads.add(w);
        }
        ka(v);
      }
    } else Er.L(l, a, s);
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
              var S = v.unknownResources[C];
              if (S.hasOwnProperty(l)) return;
            } else
              S = {}, v.moduleUnknownResources[C] = S;
            C = [], S[l] = At;
        }
        rt(C, Te({ rel: "modulepreload", href: l }, a)), w.bulkPreloads.add(C), ka(s);
      }
    } else Er.m(l, a);
  }
  function hr(l, a, s) {
    var v = un || null;
    if (v) {
      var w = v.resumableState, C = v.renderState;
      if (l) {
        a = a || "default";
        var S = C.styles.get(a), B = w.styleResources.hasOwnProperty(l) ? w.styleResources[l] : void 0;
        B !== null && (w.styleResources[l] = null, S || (S = {
          precedence: fe(Ge(a)),
          rules: [],
          hrefs: [],
          sheets: /* @__PURE__ */ new Map()
        }, C.styles.set(a, S)), a = {
          state: 0,
          props: Te(
            { rel: "stylesheet", href: l, "data-precedence": a },
            s
          )
        }, B && (B.length === 2 && Za(a.props, B), (C = C.preloads.stylesheets.get(l)) && 0 < C.length ? C.length = 0 : a.state = 1), S.sheets.set(l, a), ka(v));
      }
    } else Er.S(l, a, s);
  }
  function Gi(l, a) {
    var s = un || null;
    if (s) {
      var v = s.resumableState, w = s.renderState;
      if (l) {
        var C = v.scriptResources.hasOwnProperty(l) ? v.scriptResources[l] : void 0;
        C !== null && (v.scriptResources[l] = null, a = Te({ src: l, async: !0 }, a), C && (C.length === 2 && Za(a, C), l = w.preloads.scripts.get(l)) && (l.length = 0), l = [], w.scripts.add(l), mo(l, a), ka(s));
      }
    } else Er.X(l, a);
  }
  function os(l, a) {
    var s = un || null;
    if (s) {
      var v = s.resumableState, w = s.renderState;
      if (l) {
        var C = v.moduleScriptResources.hasOwnProperty(
          l
        ) ? v.moduleScriptResources[l] : void 0;
        C !== null && (v.moduleScriptResources[l] = null, a = Te({ src: l, type: "module", async: !0 }, a), C && (C.length === 2 && Za(a, C), l = w.preloads.moduleScripts.get(l)) && (l.length = 0), l = [], w.scripts.add(l), mo(l, a), ka(s));
      }
    } else Er.M(l, a);
  }
  function Za(l, a) {
    l.crossOrigin == null && (l.crossOrigin = a[0]), l.integrity == null && (l.integrity = a[1]);
  }
  function qc(l, a, s) {
    l = ("" + l).replace(
      Qa,
      dr
    ), a = ("" + a).replace(
      ar,
      wa
    ), a = "<" + l + '>; rel=preload; as="' + a + '"';
    for (var v in s)
      me.call(s, v) && (l = s[v], typeof l == "string" && (a += "; " + v.toLowerCase() + '="' + ("" + l).replace(
        ar,
        wa
      ) + '"'));
    return a;
  }
  var Qa = /[<>\r\n]/g;
  function dr(l) {
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
  var ar = /["';,\r\n]/g;
  function wa(l) {
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
  function Do(l) {
    return 0 < l.stylesheets.size || l.suspenseyImages;
  }
  var $c = Function.prototype.bind, No = /* @__PURE__ */ Symbol.for("react.client.reference");
  function Lu(l) {
    if (l == null) return null;
    if (typeof l == "function")
      return l.$$typeof === No ? null : l.displayName || l.name || null;
    if (typeof l == "string") return l;
    switch (l) {
      case Se:
        return "Fragment";
      case On:
        return "Profiler";
      case nn:
        return "StrictMode";
      case P:
        return "Suspense";
      case N:
        return "SuspenseList";
      case ht:
        return "Activity";
    }
    if (typeof l == "object")
      switch (l.$$typeof) {
        case ve:
          return "Portal";
        case ie:
          return l.displayName || "Context";
        case Re:
          return (l._context.displayName || "Context") + ".Consumer";
        case He:
          var a = l.render;
          return l = l.displayName, l || (l = a.displayName || a.name || "", l = l !== "" ? "ForwardRef(" + l + ")" : "ForwardRef"), l;
        case Fe:
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
  var Cs = {}, vt = null;
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
  function cs(l) {
    l.context._currentValue = l.parentValue, l = l.parent, l !== null && cs(l);
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
    var a = vt;
    a !== l && (a === null ? i(l) : l === null ? cs(a) : a.depth === l.depth ? Xi(a, l) : a.depth > l.depth ? o(a, l) : f(a, l), vt = l);
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
      var S = w - w % 5;
      return C = (v & (1 << S) - 1).toString(32), v >>= S, w -= S, {
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
  var ye = Error(W(460));
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
        throw on = a, ye;
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
  var je = typeof Object.is == "function" ? Object.is : ze, Xe = null, at = null, cn = null, wn = null, Mn = null, en = null, yt = !1, Sn = !1, Cr = 0, Dn = 0, xn = -1, kn = 0, qe = null, An = null, $t = 0;
  function sn() {
    if (Xe === null)
      throw Error(W(321));
    return Xe;
  }
  function pa() {
    if (0 < $t) throw Error(W(312));
    return { memoizedState: null, queue: null, next: null };
  }
  function Zi() {
    return en === null ? Mn === null ? (yt = !1, Mn = en = pa()) : (yt = !0, en = Mn) : en.next === null ? (yt = !1, en = en.next = pa()) : (yt = !0, en = en.next), en;
  }
  function mr() {
    var l = qe;
    return qe = null, l;
  }
  function Pl() {
    wn = cn = at = Xe = null, Sn = !1, Mn = null, $t = 0, en = An = null;
  }
  function Fl(l, a) {
    return typeof a == "function" ? a(l) : a;
  }
  function Ol(l, a, s) {
    if (Xe = sn(), en = Zi(), yt) {
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
    return l = l === Fl ? typeof a == "function" ? a() : a : s !== void 0 ? s(a) : a, en.memoizedState = l, l = en.queue = { last: null, dispatch: null }, l = l.dispatch = Qi.bind(
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
    if (25 <= $t) throw Error(W(301));
    if (l === Xe)
      if (Sn = !0, l = { action: s, next: null }, An === null && (An = /* @__PURE__ */ new Map()), s = An.get(a), s === void 0)
        An.set(a, l);
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
      var C = null, S = wn;
      w = w.formState;
      var B = l.$$IS_SIGNATURE_EQUAL;
      if (w !== null && typeof B == "function") {
        var O = w[1];
        B.call(l, w[2], w[3]) && (C = s !== void 0 ? "p" + s : "k" + Ve(
          JSON.stringify([S, null, v]),
          0
        ), O === C && (xn = v, a = w[0]));
      }
      var z = l.bind(null, a);
      return l = function(K) {
        z(K);
      }, typeof z.$$FORM_ACTION == "function" && (l.$$FORM_ACTION = function(K) {
        K = z.$$FORM_ACTION(K), s !== void 0 && (s += "", K.action = s);
        var xe = K.data;
        return xe && (C === null && (C = s !== void 0 ? "p" + s : "k" + Ve(
          JSON.stringify([
            S,
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
    var a = kn;
    return kn += 1, qe === null && (qe = []), Ne(qe, l, a);
  }
  function Lo() {
    throw Error(W(393));
  }
  var Ta = {
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
    useReducer: Ol,
    useRef: function(l) {
      Xe = sn(), en = Zi();
      var a = en.memoizedState;
      return a === null ? (l = { current: l }, en.memoizedState = l) : a;
    },
    useState: function(l) {
      return Ol(Fl, l);
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
      var s = Sr;
      if (s === null) throw Error(W(404));
      return a = Cr++, l = "_" + s.idPrefix + "R_" + l, 0 < a && (l += "H" + a.toString(32)), l + "_";
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
        a[s] = Ot;
      return a;
    },
    useCacheRefresh: function() {
      return Lo;
    },
    useEffectEvent: function() {
      return Jt;
    }
  }, Sr = null, Ec = {
    getCacheForType: function() {
      throw Error(W(248));
    },
    cacheSignal: function() {
      throw Error(W(248));
    }
  }, kr, Cl;
  function Ji(l) {
    if (kr === void 0)
      try {
        throw Error();
      } catch (s) {
        var a = s.stack.trim().match(/\n( *(at )?)/);
        kr = a && a[1] || "", Cl = -1 < s.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < s.stack.indexOf("@") ? "@unknown:0:0" : "";
      }
    return `
` + kr + l + Cl;
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
      var C = v.DetermineComponentFrameRoot(), S = C[0], B = C[1];
      if (S && B) {
        var O = S.split(`
`), z = B.split(`
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
        case Fe:
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
  function _t(l, a) {
    return (500 < a.byteSize || Do(a.contentState)) && a.contentPreamble === null;
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
  function xa(l, a, s, v, w, C, S, B, O, z, Z) {
    var K = /* @__PURE__ */ new Set();
    this.destination = null, this.flushScheduled = !1, this.resumableState = l, this.renderState = a, this.rootFormatContext = s, this.progressiveChunkSize = v === void 0 ? 12800 : v, this.status = 10, this.fatalError = null, this.pendingRootTasks = this.allPendingTasks = this.nextSegmentId = 0, this.completedPreambleSegments = this.completedRootSegment = null, this.byteSize = 0, this.abortableTasks = K, this.pingedTasks = [], this.clientRenderedBoundaries = [], this.completedBoundaries = [], this.partialBoundaries = [], this.trackedPostpones = null, this.onError = w === void 0 ? Cc : w, this.onPostpone = z === void 0 ? $ : z, this.onAllReady = C === void 0 ? $ : C, this.onShellReady = S === void 0 ? $ : S, this.onShellError = B === void 0 ? $ : B, this.onFatalError = O === void 0 ? $ : O, this.formState = Z === void 0 ? null : Z;
  }
  function _o(l, a, s, v, w, C, S, B, O, z, Z, K) {
    return a = new xa(
      a,
      s,
      v,
      w,
      C,
      S,
      B,
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
    ), s.parentFlushed = !0, l = Ea(
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
    ), Ra(l), a.pingedTasks.push(l), a;
  }
  function ja(l, a, s, v, w, C, S, B, O, z, Z) {
    return l = _o(
      l,
      a,
      s,
      v,
      w,
      C,
      S,
      B,
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
  function Mt(l, a, s, v, w, C, S, B, O) {
    return s = new xa(
      a.resumableState,
      s,
      a.rootFormatContext,
      a.progressiveChunkSize,
      v,
      w,
      C,
      S,
      B,
      O,
      null
    ), s.nextSegmentId = a.nextSegmentId, typeof a.replaySlots == "number" ? (v = Zr(
      s,
      0,
      null,
      a.rootFormatContext,
      !1,
      !1
    ), v.parentFlushed = !0, l = Ea(
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
    ), Ra(l), s.pingedTasks.push(l), s) : (l = bt(
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
    ), Ra(l), s.pingedTasks.push(l), s);
  }
  function ml(l, a, s, v, w, C, S, B, O) {
    return l = Mt(
      l,
      a,
      s,
      v,
      w,
      C,
      S,
      B,
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
      return us(l);
    }) : Kn(function() {
      return us(l);
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
  function Ea(l, a, s, v, w, C, S, B, O, z, Z, K, xe, pe, yn) {
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
      blockedPreamble: S,
      hoistableState: B,
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
  function bt(l, a, s, v, w, C, S, B, O, z, Z, K, xe, pe) {
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
      hoistableState: S,
      abortSet: B,
      keyPath: O,
      formatContext: z,
      context: Z,
      treeContext: K,
      row: xe,
      componentStack: pe,
      thenableState: a
    };
    return B.add(yn), yn;
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
  function Ra(l) {
    var a = l.node;
    typeof a == "object" && a !== null && a.$$typeof === Ae && (l.componentStack = { parent: l.componentStack, type: a.type });
  }
  function qa(l) {
    return l === null ? null : { parent: l.parent, type: "Suspense Fallback" };
  }
  function Ml(l) {
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
  function gr(l, a, s) {
    if (l = l.onError, a = l(a, s), a == null || typeof a == "string") return a;
  }
  function zo(l, a) {
    var s = l.onShellError, v = l.onFatalError;
    s(a), v(a), l.destination !== null ? (l.status = 14, we(l.destination, a)) : (l.status = 13, l.fatalError = a);
  }
  function Ar(l, a) {
    _u(l, a.next, a.hoistables);
  }
  function _u(l, a, s) {
    for (; a !== null; ) {
      s !== null && (Ja(a.hoistables, s), a.inheritedHoistables = s);
      var v = a.boundaries;
      if (v !== null) {
        a.boundaries = null;
        for (var w = 0; w < v.length; w++) {
          var C = v[w];
          s !== null && Ja(C.contentState, s), Il(l, C, null, null);
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
        if (C.pendingTasks !== 1 || C.parentFlushed || _t(l, C)) {
          v = !1;
          break;
        }
      }
      v && _u(l, a, a.hoistables);
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
    var C = a.keyPath, S = a.treeContext, B = a.row;
    a.keyPath = s, s = v.length;
    var O = null;
    if (a.replay !== null) {
      var z = a.replay.slots;
      if (z !== null && typeof z == "object")
        for (var Z = 0; Z < s; Z++) {
          var K = w !== "backwards" && w !== "unstable_legacy-backwards" ? Z : s - 1 - Z, xe = v[K];
          a.row = O = mc(
            O
          ), a.treeContext = A(S, s, K);
          var pe = z[K];
          typeof pe == "number" ? (no(l, a, pe, xe, K), delete z[K]) : Bt(l, a, xe, K), --O.pendingTasks === 0 && Ar(l, O);
        }
      else
        for (z = 0; z < s; z++)
          Z = w !== "backwards" && w !== "unstable_legacy-backwards" ? z : s - 1 - z, K = v[Z], a.row = O = mc(O), a.treeContext = A(S, s, Z), Bt(l, a, K, Z), --O.pendingTasks === 0 && Ar(l, O);
    } else if (w !== "backwards" && w !== "unstable_legacy-backwards")
      for (w = 0; w < s; w++)
        z = v[w], a.row = O = mc(O), a.treeContext = A(
          S,
          s,
          w
        ), Bt(l, a, z, w), --O.pendingTasks === 0 && Ar(l, O);
    else {
      for (w = a.blockedSegment, z = w.children.length, Z = w.chunks.length, K = s - 1; 0 <= K; K--) {
        xe = v[K], a.row = O = mc(
          O
        ), a.treeContext = A(S, s, K), pe = Zr(
          l,
          Z,
          null,
          a.formatContext,
          K === 0 ? w.lastPushedText : !0,
          !0
        ), w.children.splice(z, 0, pe), a.blockedSegment = pe;
        try {
          Bt(l, a, xe, K), pe.lastPushedText && pe.textEmbedded && pe.chunks.push(We), pe.status = 1, Ca(l, a.blockedBoundary, pe), --O.pendingTasks === 0 && Ar(l, O);
        } catch (yn) {
          throw pe.status = l.status === 12 ? 3 : 4, yn;
        }
      }
      a.blockedSegment = w, w.lastPushedText = !1;
    }
    B !== null && O !== null && 0 < O.pendingTasks && (B.pendingTasks++, O.next = B), a.treeContext = S, a.row = B, a.keyPath = C;
  }
  function ru(l, a, s, v, w, C) {
    var S = a.thenableState;
    for (a.thenableState = null, Xe = {}, at = a, cn = l, wn = s, Dn = Cr = 0, xn = -1, kn = 0, qe = S, l = v(w, C); Sn; )
      Sn = !1, Dn = Cr = 0, xn = -1, kn = 0, $t += 1, en = null, l = v(w, C);
    return Pl(), l;
  }
  function Ri(l, a, s, v, w, C, S) {
    var B = !1;
    if (C !== 0 && l.formState !== null) {
      var O = a.blockedSegment;
      if (O !== null) {
        B = !0, O = O.chunks;
        for (var z = 0; z < C; z++)
          z === S ? O.push(Su) : O.push(Yc);
      }
    }
    C = a.keyPath, a.keyPath = s, w ? (s = a.treeContext, a.treeContext = A(s, 1, 0), Bt(l, a, v, -1), a.treeContext = s) : B ? Bt(l, a, v, -1) : Pr(l, a, v, -1), a.keyPath = C;
  }
  function eo(l, a, s, v, w, C) {
    if (typeof v == "function")
      if (v.prototype && v.prototype.isReactComponent) {
        var S = w;
        if ("ref" in w) {
          S = {};
          for (var B in w)
            B !== "ref" && (S[B] = w[B]);
        }
        var O = v.defaultProps;
        if (O) {
          S === w && (S = Te({}, S, w));
          for (var z in O)
            S[z] === void 0 && (S[z] = O[z]);
        }
        w = S, S = Cs, O = v.contextType, typeof O == "object" && O !== null && (S = O._currentValue), S = new v(w, S);
        var Z = S.state !== void 0 ? S.state : null;
        if (S.updater = p, S.props = w, S.state = Z, O = { queue: [], replace: !1 }, S._reactInternals = O, C = v.contextType, S.context = typeof C == "object" && C !== null ? C._currentValue : Cs, C = v.getDerivedStateFromProps, typeof C == "function" && (C = C(w, Z), Z = C == null ? Z : Te({}, Z, C), S.state = Z), typeof v.getDerivedStateFromProps != "function" && typeof S.getSnapshotBeforeUpdate != "function" && (typeof S.UNSAFE_componentWillMount == "function" || typeof S.componentWillMount == "function"))
          if (v = S.state, typeof S.componentWillMount == "function" && S.componentWillMount(), typeof S.UNSAFE_componentWillMount == "function" && S.UNSAFE_componentWillMount(), v !== S.state && p.enqueueReplaceState(
            S,
            S.state,
            null
          ), O.queue !== null && 0 < O.queue.length)
            if (v = O.queue, C = O.replace, O.queue = null, O.replace = !1, C && v.length === 1)
              S.state = v[0];
            else {
              for (O = C ? v[0] : S.state, Z = !0, C = C ? 1 : 0; C < v.length; C++)
                z = v[C], z = typeof z == "function" ? z.call(S, O, w, void 0) : z, z != null && (Z ? (Z = !1, O = Te({}, O, z)) : Te(O, z));
              S.state = O;
            }
          else O.queue = null;
        if (v = S.render(), l.status === 12) throw null;
        w = a.keyPath, a.keyPath = s, Pr(l, a, v, -1), a.keyPath = w;
      } else {
        if (v = ru(l, a, s, v, w, void 0), l.status === 12) throw null;
        Ri(
          l,
          a,
          s,
          v,
          Cr !== 0,
          Dn,
          xn
        );
      }
    else if (typeof v == "string")
      if (S = a.blockedSegment, S === null)
        S = w.children, O = a.formatContext, Z = a.keyPath, a.formatContext = Oe(O, v, w), a.keyPath = s, Bt(l, a, S, -1), a.formatContext = O, a.keyPath = Z;
      else {
        if (Z = sc(
          S.chunks,
          v,
          w,
          l.resumableState,
          l.renderState,
          a.blockedPreamble,
          a.hoistableState,
          a.formatContext,
          S.lastPushedText
        ), S.lastPushedText = !1, O = a.formatContext, C = a.keyPath, a.keyPath = s, (a.formatContext = Oe(O, v, w)).insertionMode === 3) {
          s = Zr(
            l,
            0,
            null,
            a.formatContext,
            !1,
            !1
          ), S.preambleChildren.push(s), a.blockedSegment = s;
          try {
            s.status = 6, Bt(l, a, Z, -1), s.lastPushedText && s.textEmbedded && s.chunks.push(We), s.status = 1, Ca(l, a.blockedBoundary, s);
          } finally {
            a.blockedSegment = S;
          }
        } else Bt(l, a, Z, -1);
        a.formatContext = O, a.keyPath = C;
        e: {
          switch (a = S.chunks, l = l.resumableState, v) {
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
        S.lastPushedText = !1;
      }
    else {
      switch (v) {
        case rr:
        case nn:
        case On:
        case Se:
          v = a.keyPath, a.keyPath = s, Pr(l, a, w.children, -1), a.keyPath = v;
          return;
        case ht:
          v = a.blockedSegment, v === null ? w.mode !== "hidden" && (v = a.keyPath, a.keyPath = s, Bt(l, a, w.children, -1), a.keyPath = v) : w.mode !== "hidden" && (v.chunks.push(Wr), v.lastPushedText = !1, S = a.keyPath, a.keyPath = s, Bt(l, a, w.children, -1), a.keyPath = S, v.chunks.push(dc), v.lastPushedText = !1);
          return;
        case N:
          e: {
            if (v = w.children, w = w.revealOrder, w === "forwards" || w === "backwards" || w === "unstable_legacy-backwards") {
              if (Ie(v)) {
                tu(l, a, s, v, w);
                break e;
              }
              if ((S = Vn(v)) && (S = S.call(v))) {
                if (O = S.next(), !O.done) {
                  do
                    O = S.next();
                  while (!O.done);
                  tu(l, a, s, v, w);
                }
                break e;
              }
            }
            w === "together" ? (w = a.keyPath, S = a.row, O = a.row = mc(null), O.boundaries = [], O.together = !0, a.keyPath = s, Pr(l, a, v, -1), --O.pendingTasks === 0 && Ar(l, O), a.keyPath = w, a.row = S, S !== null && 0 < O.pendingTasks && (S.pendingTasks++, O.next = S)) : (w = a.keyPath, a.keyPath = s, Pr(l, a, v, -1), a.keyPath = w);
          }
          return;
        case vl:
        case X:
          throw Error(W(343));
        case P:
          e: if (a.replay !== null) {
            v = a.keyPath, S = a.formatContext, O = a.row, a.keyPath = s, a.formatContext = an(
              l.resumableState,
              S
            ), a.row = null, s = w.children;
            try {
              Bt(l, a, s, -1);
            } finally {
              a.keyPath = v, a.formatContext = S, a.row = O;
            }
          } else {
            v = a.keyPath, C = a.formatContext;
            var K = a.row;
            z = a.blockedBoundary, B = a.blockedPreamble;
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
            var wt = Zr(
              l,
              pe.chunks.length,
              bn,
              a.formatContext,
              !1,
              !1
            );
            pe.children.push(wt), pe.lastPushedText = !1;
            var $n = Zr(
              l,
              0,
              null,
              a.formatContext,
              !1,
              !1
            );
            if ($n.parentFlushed = !0, l.trackedPostpones !== null) {
              S = a.componentStack, O = [s[0], "Suspense Fallback", s[2]], Z = [O[1], O[2], [], null], l.trackedPostpones.workingMap.set(O, Z), bn.trackedFallbackNode = Z, a.blockedSegment = wt, a.blockedPreamble = bn.fallbackPreamble, a.keyPath = O, a.formatContext = Ke(
                l.resumableState,
                C
              ), a.componentStack = qa(S), wt.status = 6;
              try {
                Bt(l, a, yn, -1), wt.lastPushedText && wt.textEmbedded && wt.chunks.push(We), wt.status = 1, Ca(l, z, wt);
              } catch (vr) {
                throw wt.status = l.status === 12 ? 3 : 4, vr;
              } finally {
                a.blockedSegment = pe, a.blockedPreamble = B, a.keyPath = v, a.formatContext = C;
              }
              a = Ea(
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
                S
              ), Ra(a), l.pingedTasks.push(a);
            } else {
              a.blockedBoundary = bn, a.blockedPreamble = bn.contentPreamble, a.hoistableState = bn.contentState, a.blockedSegment = $n, a.keyPath = s, a.formatContext = an(
                l.resumableState,
                C
              ), a.row = null, $n.status = 6;
              try {
                if (Bt(l, a, w, -1), $n.lastPushedText && $n.textEmbedded && $n.chunks.push(We), $n.status = 1, Ca(l, bn, $n), cu(bn, $n), bn.pendingTasks === 0 && bn.status === 0) {
                  if (bn.status = 1, !_t(l, bn)) {
                    K !== null && --K.pendingTasks === 0 && Ar(l, K), l.pendingRootTasks === 0 && a.blockedPreamble && ri(l);
                    break e;
                  }
                } else
                  K !== null && K.together && $a(l, K);
              } catch (vr) {
                bn.status = 4, l.status === 12 ? ($n.status = 3, S = l.fatalError) : ($n.status = 4, S = vr), O = Ml(a.componentStack), Z = gr(
                  l,
                  S,
                  O
                ), bn.errorDigest = Z, lu(l, bn);
              } finally {
                a.blockedBoundary = z, a.blockedPreamble = B, a.hoistableState = xe, a.blockedSegment = pe, a.keyPath = v, a.formatContext = C, a.row = K;
              }
              a = Ea(
                l,
                null,
                yn,
                -1,
                z,
                wt,
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
              ), Ra(a), l.pingedTasks.push(a);
            }
          }
          return;
      }
      if (typeof v == "object" && v !== null)
        switch (v.$$typeof) {
          case He:
            if ("ref" in w)
              for (pe in S = {}, w)
                pe !== "ref" && (S[pe] = w[pe]);
            else S = w;
            v = ru(
              l,
              a,
              s,
              v.render,
              S,
              C
            ), Ri(
              l,
              a,
              s,
              v,
              Cr !== 0,
              Dn,
              xn
            );
            return;
          case Fe:
            eo(l, a, s, v.type, w, C);
            return;
          case ie:
            if (O = w.children, S = a.keyPath, w = w.value, Z = v._currentValue, v._currentValue = w, C = vt, vt = v = {
              parent: C,
              depth: C === null ? 0 : C.depth + 1,
              context: v,
              parentValue: Z,
              value: w
            }, a.context = v, a.keyPath = s, Pr(l, a, O, -1), l = vt, l === null) throw Error(W(403));
            l.context._currentValue = l.parentValue, l = vt = l.parent, a.context = l, a.keyPath = S;
            return;
          case Re:
            w = w.children, v = w(v._context._currentValue), w = a.keyPath, a.keyPath = s, Pr(l, a, v, -1), a.keyPath = w;
            return;
          case ee:
            if (S = v._init, v = S(v._payload), l.status === 12) throw null;
            eo(l, a, s, v, w, C);
            return;
        }
      throw Error(
        W(130, v == null ? v : typeof v, "")
      );
    }
  }
  function no(l, a, s, v, w) {
    var C = a.replay, S = a.blockedBoundary, B = Zr(
      l,
      0,
      null,
      a.formatContext,
      !1,
      !1
    );
    B.id = s, B.parentFlushed = !0;
    try {
      a.replay = null, a.blockedSegment = B, Bt(l, a, v, w), B.status = 1, Ca(l, S, B), S === null ? l.completedRootSegment = B : (cu(S, B), S.parentFlushed && l.partialBoundaries.push(S));
    } finally {
      a.replay = C, a.blockedSegment = null;
    }
  }
  function Pr(l, a, s, v) {
    a.replay !== null && typeof a.replay.slots == "number" ? no(l, a, a.replay.slots, s, v) : (a.node = s, a.childIndex = v, s = a.componentStack, Ra(a), Sc(l, a), a.componentStack = s);
  }
  function Sc(l, a) {
    var s = a.node, v = a.childIndex;
    if (s !== null) {
      if (typeof s == "object") {
        switch (s.$$typeof) {
          case Ae:
            var w = s.type, C = s.key, S = s.props;
            s = S.ref;
            var B = s !== void 0 ? s : null, O = Lu(w), z = C ?? (v === -1 ? 0 : v);
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
                        if (eo(l, a, C, w, S, B), a.replay.pendingTasks === 1 && 0 < a.replay.nodes.length)
                          throw Error(W(488));
                        a.replay.pendingTasks--;
                      } catch (Je) {
                        if (typeof Je == "object" && Je !== null && (Je === ye || typeof Je.then == "function"))
                          throw a.node === z ? a.replay = Z : v.splice(s, 1), Je;
                        a.replay.pendingTasks--, S = Ml(a.componentStack), C = l, l = a.blockedBoundary, w = Je, S = gr(C, w, S), Ac(
                          C,
                          l,
                          xe,
                          O,
                          w,
                          S
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
                        Z = void 0, w = K[5], B = K[2], O = K[3], z = K[4] === null ? [] : K[4][2], K = K[4] === null ? null : K[4][3];
                        var pe = a.keyPath, yn = a.formatContext, Qe = a.row, bn = a.replay, wt = a.blockedBoundary, $n = a.hoistableState, vr = S.children, ll = S.fallback, Nl = /* @__PURE__ */ new Set();
                        S = 2 > a.formatContext.insertionMode ? Bo(
                          l,
                          a.row,
                          Nl,
                          L(),
                          L()
                        ) : Bo(
                          l,
                          a.row,
                          Nl,
                          null,
                          null
                        ), S.parentFlushed = !0, S.rootSegmentID = w, a.blockedBoundary = S, a.hoistableState = S.contentState, a.keyPath = C, a.formatContext = an(
                          l.resumableState,
                          yn
                        ), a.row = null, a.replay = {
                          nodes: B,
                          slots: O,
                          pendingTasks: 1
                        };
                        try {
                          if (Bt(l, a, vr, -1), a.replay.pendingTasks === 1 && 0 < a.replay.nodes.length)
                            throw Error(W(488));
                          if (a.replay.pendingTasks--, S.pendingTasks === 0 && S.status === 0) {
                            S.status = 1, l.completedBoundaries.push(S);
                            break n;
                          }
                        } catch (Je) {
                          S.status = 4, xe = Ml(a.componentStack), Z = gr(
                            l,
                            Je,
                            xe
                          ), S.errorDigest = Z, a.replay.pendingTasks--, l.clientRenderedBoundaries.push(S);
                        } finally {
                          a.blockedBoundary = wt, a.hoistableState = $n, a.replay = bn, a.keyPath = pe, a.formatContext = yn, a.row = Qe;
                        }
                        xe = bt(
                          l,
                          null,
                          {
                            nodes: z,
                            slots: K,
                            pendingTasks: 0
                          },
                          ll,
                          -1,
                          wt,
                          S.fallbackState,
                          Nl,
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
                        ), Ra(xe), l.pingedTasks.push(xe);
                      }
                    }
                    v.splice(s, 1);
                    break e;
                  }
                }
              }
            else eo(l, a, C, w, S, B);
            return;
          case ve:
            throw Error(W(257));
          case ee:
            if (xe = s._init, s = xe(s._payload), l.status === 12) throw null;
            Pr(l, a, s, v);
            return;
        }
        if (Ie(s)) {
          kc(l, a, s, v);
          return;
        }
        if ((xe = Vn(s)) && (xe = xe.call(s))) {
          if (s = xe.next(), !s.done) {
            S = [];
            do
              S.push(s.value), s = xe.next();
            while (!s.done);
            kc(l, a, S, v);
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
  function kc(l, a, s, v) {
    var w = a.keyPath;
    if (v !== -1 && (a.keyPath = [a.keyPath, "Fragment", v], a.replay !== null)) {
      for (var C = a.replay, S = C.nodes, B = 0; B < S.length; B++) {
        var O = S[B];
        if (O[1] === v) {
          v = O[2], O = O[3], a.replay = { nodes: v, slots: O, pendingTasks: 1 };
          try {
            if (kc(l, a, s, -1), a.replay.pendingTasks === 1 && 0 < a.replay.nodes.length)
              throw Error(W(488));
            a.replay.pendingTasks--;
          } catch (K) {
            if (typeof K == "object" && K !== null && (K === ye || typeof K.then == "function"))
              throw K;
            a.replay.pendingTasks--, s = Ml(a.componentStack);
            var z = a.blockedBoundary, Z = K;
            s = gr(l, Z, s), Ac(
              l,
              z,
              v,
              O,
              Z,
              s
            );
          }
          a.replay = C, S.splice(B, 1);
          break;
        }
      }
      a.keyPath = w;
      return;
    }
    if (C = a.treeContext, S = s.length, a.replay !== null && (B = a.replay.slots, B !== null && typeof B == "object")) {
      for (v = 0; v < S; v++)
        O = s[v], a.treeContext = A(C, S, v), z = B[v], typeof z == "number" ? (no(l, a, z, O, v), delete B[v]) : Bt(l, a, O, v);
      a.treeContext = C, a.keyPath = w;
      return;
    }
    for (B = 0; B < S; B++)
      v = s[B], a.treeContext = A(C, S, B), Bt(l, a, v, B);
    a.treeContext = C, a.keyPath = w;
  }
  function Bu(l, a, s) {
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
        var S = Bu(
          l,
          a,
          C
        );
        if (C.trackedContentKeyPath === w && s.childIndex === -1) {
          v.id === -1 && (v.id = v.parentFlushed ? C.rootSegmentID : l.nextSegmentId++), S[3] = v.id;
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
        } else if (C = a.workingMap, S = C.get(w), S === void 0)
          l = {}, S = [w[1], w[2], [], l], C.set(w, S), Yu(S, w[0], a);
        else if (l = S[3], l === null)
          l = S[3] = {};
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
    var v = a.blockedSegment, w = Zr(
      l,
      v.chunks.length,
      null,
      a.formatContext,
      v.lastPushedText,
      !0
    );
    return v.children.push(w), v.lastPushedText = !1, Ea(
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
    var w = a.formatContext, C = a.context, S = a.keyPath, B = a.treeContext, O = a.componentStack, z = a.blockedSegment;
    if (z === null) {
      z = a.replay;
      try {
        return Pr(l, a, s, v);
      } catch (xe) {
        if (Pl(), s = xe === ye ? Ze() : xe, l.status !== 12 && typeof s == "object" && s !== null) {
          if (typeof s.then == "function") {
            v = xe === ye ? mr() : null, l = Hu(l, a, v).ping, s.then(l, l), a.formatContext = w, a.context = C, a.keyPath = S, a.treeContext = B, a.componentStack = O, a.replay = z, g(C);
            return;
          }
          if (s.message === "Maximum call stack size exceeded") {
            s = xe === ye ? mr() : null, s = Hu(l, a, s), l.pingedTasks.push(s), a.formatContext = w, a.context = C, a.keyPath = S, a.treeContext = B, a.componentStack = O, a.replay = z, g(C);
            return;
          }
        }
      }
    } else {
      var Z = z.children.length, K = z.chunks.length;
      try {
        return Pr(l, a, s, v);
      } catch (xe) {
        if (Pl(), z.children.length = Z, z.chunks.length = K, s = xe === ye ? Ze() : xe, l.status !== 12 && typeof s == "object" && s !== null) {
          if (typeof s.then == "function") {
            z = s, s = xe === ye ? mr() : null, l = Uu(l, a, s).ping, z.then(l, l), a.formatContext = w, a.context = C, a.keyPath = S, a.treeContext = B, a.componentStack = O, g(C);
            return;
          }
          if (s.message === "Maximum call stack size exceeded") {
            z = xe === ye ? mr() : null, z = Uu(l, a, z), l.pingedTasks.push(z), a.formatContext = w, a.context = C, a.keyPath = S, a.treeContext = B, a.componentStack = O, g(C);
            return;
          }
        }
      }
    }
    throw a.formatContext = w, a.context = C, a.keyPath = S, a.treeContext = B, g(C), s;
  }
  function iu(l) {
    var a = l.blockedBoundary, s = l.blockedSegment;
    s !== null && (s.status = 3, Il(this, a, l.row, s));
  }
  function Ac(l, a, s, v, w, C) {
    for (var S = 0; S < s.length; S++) {
      var B = s[S];
      if (B.length === 4)
        Ac(
          l,
          a,
          B[2],
          B[3],
          w,
          C
        );
      else {
        B = B[5];
        var O = l, z = C, Z = Bo(
          O,
          null,
          /* @__PURE__ */ new Set(),
          null,
          null
        );
        Z.parentFlushed = !0, Z.rootSegmentID = B, Z.status = 4, Z.errorDigest = z, Z.parentFlushed && O.clientRenderedBoundaries.push(Z);
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
    var C = Ml(l.componentStack);
    if (v === null) {
      if (a.status !== 13 && a.status !== 14) {
        if (v = l.replay, v === null) {
          a.trackedPostpones !== null && w !== null ? (v = a.trackedPostpones, gr(a, s, C), zu(a, v, l, w), Il(a, null, l.row, w)) : (gr(a, s, C), zo(a, s));
          return;
        }
        v.pendingTasks--, v.pendingTasks === 0 && 0 < v.nodes.length && (w = gr(a, s, C), Ac(
          a,
          null,
          v.nodes,
          v.slots,
          s,
          w
        )), a.pendingRootTasks--, a.pendingRootTasks === 0 && Wu(a);
      }
    } else {
      var S = a.trackedPostpones;
      if (v.status !== 4) {
        if (S !== null && w !== null)
          return gr(a, s, C), zu(a, S, l, w), v.fallbackAbortableTasks.forEach(function(B) {
            return Pc(B, a, s);
          }), v.fallbackAbortableTasks.clear(), Il(a, v, l.row, w);
        v.status = 4, w = gr(a, s, C), v.status = 4, v.errorDigest = w, lu(a, v), v.parentFlushed && a.clientRenderedBoundaries.push(v);
      }
      v.pendingTasks--, w = v.row, w !== null && --w.pendingTasks === 0 && Ar(a, w), v.fallbackAbortableTasks.forEach(function(B) {
        return Pc(B, a, s);
      }), v.fallbackAbortableTasks.clear();
    }
    l = l.row, l !== null && --l.pendingTasks === 0 && Ar(a, l), a.allPendingTasks--, a.allPendingTasks === 0 && ou(a);
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
            var S = s.styles.values(), B = S.next();
            e: for (; 0 < w.remainingCapacity && !B.done; B = S.next())
              for (var O = B.value.sheets.values(), z = O.next(); 0 < w.remainingCapacity && !z.done; z = O.next()) {
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
      gr(l, Qe, {});
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
  function Ca(l, a, s) {
    if (Y !== null) {
      s = s.chunks;
      for (var v = 0, w = 0; w < s.length; w++)
        v += s[w].byteLength;
      a === null ? l.byteSize += v : a.byteSize += v;
    }
  }
  function Il(l, a, s, v) {
    if (s !== null && (--s.pendingTasks === 0 ? Ar(l, s) : s.together && $a(l, s)), l.allPendingTasks--, a === null) {
      if (v !== null && v.parentFlushed) {
        if (l.completedRootSegment !== null)
          throw Error(W(389));
        l.completedRootSegment = v;
      }
      l.pendingRootTasks--, l.pendingRootTasks === 0 && Wu(l);
    } else if (a.pendingTasks--, a.status !== 4)
      if (a.pendingTasks === 0) {
        if (a.status === 0 && (a.status = 1), v !== null && v.parentFlushed && (v.status === 1 || v.status === 3) && cu(a, v), a.parentFlushed && l.completedBoundaries.push(a), a.status === 1)
          s = a.row, s !== null && Ja(s.hoistables, a.contentState), _t(l, a) || (a.fallbackAbortableTasks.forEach(iu, l), a.fallbackAbortableTasks.clear(), s !== null && --s.pendingTasks === 0 && Ar(l, s)), l.pendingRootTasks === 0 && l.trackedPostpones === null && a.contentPreamble !== null && ri(l);
        else if (a.status === 5 && (a = a.row, a !== null)) {
          if (l.trackedPostpones !== null) {
            s = l.trackedPostpones;
            var w = a.next;
            if (w !== null && (v = w.boundaries, v !== null))
              for (w.boundaries = null, w = 0; w < v.length; w++) {
                var C = v[w];
                Bu(l, s, C), Il(l, C, null, null);
              }
          }
          --a.pendingTasks === 0 && Ar(l, a);
        }
      } else
        v === null || !v.parentFlushed || v.status !== 1 && v.status !== 3 || (cu(a, v), a.completedSegments.length === 1 && a.parentFlushed && l.partialBoundaries.push(a)), a = a.row, a !== null && a.together && $a(l, a);
    l.allPendingTasks === 0 && ou(l);
  }
  function us(l) {
    if (l.status !== 14 && l.status !== 13) {
      var a = vt, s = Xl.H;
      Xl.H = Ta;
      var v = Xl.A;
      Xl.A = Ec;
      var w = un;
      un = l;
      var C = Sr;
      Sr = l.resumableState;
      try {
        var S = l.pingedTasks, B;
        for (B = 0; B < S.length; B++) {
          var O = S[B], z = l, Z = O.blockedSegment;
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
                ) : Sc(K, O), O.replay.pendingTasks === 1 && 0 < O.replay.nodes.length)
                  throw Error(W(488));
                O.replay.pendingTasks--, O.abortSet.delete(O), Il(
                  K,
                  O.blockedBoundary,
                  O.row,
                  null
                );
              } catch (Or) {
                Pl();
                var xe = Or === ye ? Ze() : Or;
                if (typeof xe == "object" && xe !== null && typeof xe.then == "function") {
                  var pe = O.ping;
                  xe.then(pe, pe), O.thenableState = Or === ye ? mr() : null;
                } else {
                  O.replay.pendingTasks--, O.abortSet.delete(O);
                  var yn = Ml(O.componentStack);
                  z = void 0;
                  var Qe = K, bn = O.blockedBoundary, wt = K.status === 12 ? K.fatalError : xe, $n = O.replay.nodes, vr = O.replay.slots;
                  z = gr(
                    Qe,
                    wt,
                    yn
                  ), Ac(
                    Qe,
                    bn,
                    $n,
                    vr,
                    wt,
                    z
                  ), K.pendingRootTasks--, K.pendingRootTasks === 0 && Wu(K), K.allPendingTasks--, K.allPendingTasks === 0 && ou(K);
                }
              }
            }
          } else if (K = void 0, Qe = Z, Qe.status === 0) {
            Qe.status = 6, g(O.context);
            var ll = Qe.children.length, Nl = Qe.chunks.length;
            try {
              Sc(z, O), Qe.lastPushedText && Qe.textEmbedded && Qe.chunks.push(We), O.abortSet.delete(O), Qe.status = 1, Ca(z, O.blockedBoundary, Qe), Il(
                z,
                O.blockedBoundary,
                O.row,
                Qe
              );
            } catch (Or) {
              Pl(), Qe.children.length = ll, Qe.chunks.length = Nl;
              var Je = Or === ye ? Ze() : z.status === 12 ? z.fatalError : Or;
              if (z.status === 12 && z.trackedPostpones !== null) {
                var Fr = z.trackedPostpones, It = Ml(O.componentStack);
                O.abortSet.delete(O), gr(z, Je, It), zu(z, Fr, O, Qe), Il(
                  z,
                  O.blockedBoundary,
                  O.row,
                  Qe
                );
              } else if (typeof Je == "object" && Je !== null && typeof Je.then == "function") {
                Qe.status = 0, O.thenableState = Or === ye ? mr() : null;
                var Qr = O.ping;
                Je.then(Qr, Qr);
              } else {
                var ji = Ml(O.componentStack);
                O.abortSet.delete(O), Qe.status = 4;
                var pt = O.blockedBoundary, lo = O.row;
                if (lo !== null && --lo.pendingTasks === 0 && Ar(z, lo), z.allPendingTasks--, K = gr(
                  z,
                  Je,
                  ji
                ), pt === null) zo(z, Je);
                else if (pt.pendingTasks--, pt.status !== 4) {
                  pt.status = 4, pt.errorDigest = K, lu(z, pt);
                  var Ll = pt.row;
                  Ll !== null && --Ll.pendingTasks === 0 && Ar(z, Ll), pt.parentFlushed && z.clientRenderedBoundaries.push(pt), z.pendingRootTasks === 0 && z.trackedPostpones === null && pt.contentPreamble !== null && ri(z);
                }
                z.allPendingTasks === 0 && ou(z);
              }
            }
          }
        }
        S.splice(0, B), l.destination !== null && Uo(l, l.destination);
      } catch (Or) {
        gr(l, Or, {}), zo(l, Or);
      } finally {
        Sr = C, Xl.H = s, Xl.A = v, s === Ta && g(a), un = w;
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
  function Ho(l, a, s, v) {
    switch (s.parentFlushed = !0, s.status) {
      case 0:
        s.id = l.nextSegmentId++;
      case 5:
        return v = s.id, s.lastPushedText = !1, s.textEmbedded = !1, l = l.renderState, J(a, ku), J(a, l.placeholderPrefix), l = fe(v.toString(16)), J(a, l), he(a, hc);
      case 1:
        s.status = 2;
        var w = !0, C = s.chunks, S = 0;
        s = s.children;
        for (var B = 0; B < s.length; B++) {
          for (w = s[B]; S < w.index; S++)
            J(a, C[S]);
          w = Oc(l, a, w, v);
        }
        for (; S < C.length - 1; S++)
          J(a, C[S]);
        return S < C.length && (w = he(a, C[S])), w;
      case 3:
        return !0;
      default:
        throw Error(W(390));
    }
  }
  var ma = 0;
  function Oc(l, a, s, v) {
    var w = s.boundary;
    if (w === null)
      return Ho(l, a, s, v);
    if (w.parentFlushed = !0, w.status === 4) {
      var C = w.row;
      C !== null && --C.pendingTasks === 0 && Ar(l, C), w = w.errorDigest, he(a, jt), J(a, Au), w && (J(a, jl), J(a, fe(Ge(w))), J(
        a,
        Ni
      )), he(a, Pu), Ho(l, a, s, v);
    } else if (w.status !== 1)
      w.status === 0 && (w.rootSegmentID = l.nextSegmentId++), 0 < w.completedSegments.length && l.partialBoundaries.push(w), Li(
        a,
        l.renderState,
        w.rootSegmentID
      ), v && Ja(v, w.fallbackState), Ho(l, a, s, v);
    else if (!li && _t(l, w) && (ma + w.byteSize > l.progressiveChunkSize || Do(w.contentState)))
      w.rootSegmentID = l.nextSegmentId++, l.completedBoundaries.push(w), Li(
        a,
        l.renderState,
        w.rootSegmentID
      ), Ho(l, a, s, v);
    else {
      if (ma += w.byteSize, v && Ja(v, w.contentState), s = w.row, s !== null && _t(l, w) && --s.pendingTasks === 0 && Ar(l, s), he(a, ua), s = w.completedSegments, s.length !== 1) throw Error(W(391));
      Oc(l, a, s[0], v);
    }
    return he(a, jn);
  }
  function Sa(l, a, s, v) {
    return Wa(
      a,
      l.renderState,
      s.parentFormatContext,
      s.id
    ), Oc(l, a, s, v), $l(a, s.parentFormatContext);
  }
  function ss(l, a, s) {
    ma = s.byteSize;
    for (var v = s.completedSegments, w = 0; w < v.length; w++)
      fs(
        l,
        a,
        s,
        v[w]
      );
    v.length = 0, v = s.row, v !== null && _t(l, s) && --v.pendingTasks === 0 && Ar(l, v), Rl(
      a,
      s.contentState,
      l.renderState
    ), v = l.resumableState, l = l.renderState, w = s.rootSegmentID, s = s.contentState;
    var C = l.stylesToHoist;
    return l.stylesToHoist = !1, J(a, l.startInlineScript), J(a, Cn), C ? ((v.instructions & 4) === 0 && (v.instructions |= 4, J(a, da)), (v.instructions & 2) === 0 && (v.instructions |= 2, J(a, Oo)), (v.instructions & 8) === 0 ? (v.instructions |= 8, J(a, qt)) : J(a, is)) : ((v.instructions & 2) === 0 && (v.instructions |= 2, J(a, Oo)), J(a, Mo)), v = fe(w.toString(16)), J(a, l.boundaryPrefix), J(a, v), J(a, ha), J(a, l.segmentPrefix), J(a, v), C ? (J(a, gc), ir(a, s)) : J(a, Qc), s = he(a, Wi), Ur(a, l) && s;
  }
  function fs(l, a, s, v) {
    if (v.status === 2) return !0;
    var w = s.contentState, C = v.id;
    if (C === -1) {
      if ((v.id = s.rootSegmentID) === -1)
        throw Error(W(392));
      return Sa(l, a, v, w);
    }
    return C === s.rootSegmentID ? Sa(l, a, v, w) : (Sa(l, a, v, w), s = l.resumableState, l = l.renderState, J(a, l.startInlineScript), J(a, Cn), (s.instructions & 1) === 0 ? (s.instructions |= 1, J(a, Fu)) : J(a, Ou), J(a, l.segmentPrefix), C = fe(C.toString(16)), J(a, C), J(a, Mu), J(a, l.placeholderPrefix), J(a, C), a = he(a, Fo), a);
  }
  var li = !1;
  function Uo(l, a) {
    nt = new Uint8Array(2048), Pe = 0;
    try {
      if (!(0 < l.pendingRootTasks)) {
        var s, v = l.completedRootSegment;
        if (v !== null) {
          if (v.status === 5) return;
          var w = l.completedPreambleSegments;
          if (w === null) return;
          ma = l.byteSize;
          var C = l.resumableState, S = l.renderState, B = S.preamble, O = B.htmlChunks, z = B.headChunks, Z;
          if (O) {
            for (Z = 0; Z < O.length; Z++)
              J(a, O[Z]);
            if (z)
              for (Z = 0; Z < z.length; Z++)
                J(a, z[Z]);
            else
              J(a, Zt("head")), J(a, Cn);
          } else if (z)
            for (Z = 0; Z < z.length; Z++)
              J(a, z[Z]);
          var K = S.charsetChunks;
          for (Z = 0; Z < K.length; Z++)
            J(a, K[Z]);
          K.length = 0, S.preconnects.forEach(lt, a), S.preconnects.clear();
          var xe = S.viewportChunks;
          for (Z = 0; Z < xe.length; Z++)
            J(a, xe[Z]);
          xe.length = 0, S.fontPreloads.forEach(lt, a), S.fontPreloads.clear(), S.highImagePreloads.forEach(lt, a), S.highImagePreloads.clear(), $r = S, S.styles.forEach(pc, a), $r = null;
          var pe = S.importMapChunks;
          for (Z = 0; Z < pe.length; Z++)
            J(a, pe[Z]);
          pe.length = 0, S.bootstrapScripts.forEach(lt, a), S.scripts.forEach(lt, a), S.scripts.clear(), S.bulkPreloads.forEach(lt, a), S.bulkPreloads.clear(), O || z || (C.instructions |= 32);
          var yn = S.hoistableChunks;
          for (Z = 0; Z < yn.length; Z++)
            J(a, yn[Z]);
          for (C = yn.length = 0; C < w.length; C++) {
            var Qe = w[C];
            for (S = 0; S < Qe.length; S++)
              Oc(l, a, Qe[S], null);
          }
          var bn = l.renderState.preamble, wt = bn.headChunks;
          (bn.htmlChunks || wt) && J(a, yi("head"));
          var $n = bn.bodyChunks;
          if ($n)
            for (w = 0; w < $n.length; w++)
              J(a, $n[w]);
          Oc(l, a, v, null), l.completedRootSegment = null;
          var vr = l.renderState;
          if (l.allPendingTasks !== 0 || l.clientRenderedBoundaries.length !== 0 || l.completedBoundaries.length !== 0 || l.trackedPostpones !== null && (l.trackedPostpones.rootNodes.length !== 0 || l.trackedPostpones.rootSlots !== null)) {
            var ll = l.resumableState;
            if ((ll.instructions & 64) === 0) {
              if (ll.instructions |= 64, J(a, vr.startInlineScript), (ll.instructions & 32) === 0) {
                ll.instructions |= 32;
                var Nl = "_" + ll.idPrefix + "R_";
                J(a, mn), J(
                  a,
                  fe(Ge(Nl))
                ), J(a, Yn);
              }
              J(a, Cn), J(a, Kl), he(a, vn);
            }
          }
          Ur(a, vr);
        }
        var Je = l.renderState;
        v = 0;
        var Fr = Je.viewportChunks;
        for (v = 0; v < Fr.length; v++)
          J(a, Fr[v]);
        Fr.length = 0, Je.preconnects.forEach(lt, a), Je.preconnects.clear(), Je.fontPreloads.forEach(lt, a), Je.fontPreloads.clear(), Je.highImagePreloads.forEach(
          lt,
          a
        ), Je.highImagePreloads.clear(), Je.styles.forEach(it, a), Je.scripts.forEach(lt, a), Je.scripts.clear(), Je.bulkPreloads.forEach(lt, a), Je.bulkPreloads.clear();
        var It = Je.hoistableChunks;
        for (v = 0; v < It.length; v++)
          J(a, It[v]);
        It.length = 0;
        var Qr = l.clientRenderedBoundaries;
        for (s = 0; s < Qr.length; s++) {
          var ji = Qr[s];
          Je = a;
          var pt = l.resumableState, lo = l.renderState, Ll = ji.rootSegmentID, Or = ji.errorDigest;
          J(
            Je,
            lo.startInlineScript
          ), J(Je, Cn), (pt.instructions & 4) === 0 ? (pt.instructions |= 4, J(Je, Io)) : J(Je, ei), J(Je, lo.boundaryPrefix), J(Je, fe(Ll.toString(16))), J(Je, ga), Or && (J(
            Je,
            va
          ), J(
            Je,
            fe(
              Ya(Or || "")
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
        var Mr = l.completedBoundaries;
        for (s = 0; s < Mr.length; s++)
          if (!ss(l, a, Mr[s])) {
            l.destination = null, s++, Mr.splice(0, s);
            return;
          }
        Mr.splice(0, s), xr(a), nt = new Uint8Array(2048), Pe = 0, li = !0;
        var io = l.partialBoundaries;
        for (s = 0; s < io.length; s++) {
          var Yo = io[s];
          e: {
            Qr = l, ji = a, ma = Yo.byteSize;
            var Jr = Yo.completedSegments;
            for (ii = 0; ii < Jr.length; ii++)
              if (!fs(
                Qr,
                ji,
                Yo,
                Jr[ii]
              )) {
                ii++, Jr.splice(0, ii);
                var Go = !1;
                break e;
              }
            Jr.splice(0, ii);
            var Ir = Yo.row;
            Ir !== null && Ir.together && Yo.pendingTasks === 1 && (Ir.pendingTasks === 1 ? _u(
              Qr,
              Ir,
              Ir.hoistables
            ) : Ir.pendingTasks--), Go = Rl(
              ji,
              Yo.contentState,
              Qr.renderState
            );
          }
          if (!Go) {
            l.destination = null, s++, io.splice(0, s);
            return;
          }
        }
        io.splice(0, s), li = !1;
        var ao = l.completedBoundaries;
        for (s = 0; s < ao.length; s++)
          if (!ss(l, a, ao[s])) {
            l.destination = null, s++, ao.splice(0, s);
            return;
          }
        ao.splice(0, s);
      }
    } finally {
      li = !1, l.allPendingTasks === 0 && l.clientRenderedBoundaries.length === 0 && l.completedBoundaries.length === 0 ? (l.flushScheduled = !1, s = l.resumableState, s.hasBody && J(a, yi("body")), s.hasHtml && J(a, yi("html")), xr(a), l.status = 14, a.close(), l.destination = null) : xr(a);
    }
  }
  function Sl(l) {
    l.flushScheduled = l.destination !== null, qr(function() {
      return us(l);
    }), Kn(function() {
      l.status === 10 && (l.status = 11), l.trackedPostpones === null && au(l, l.pendingRootTasks === 0);
    });
  }
  function ka(l) {
    l.flushScheduled === !1 && l.pingedTasks.length === 0 && l.destination !== null && (l.flushScheduled = !0, Kn(function() {
      var a = l.destination;
      a ? Uo(l, a) : l.flushScheduled = !1;
    }));
  }
  function ro(l, a) {
    if (l.status === 13)
      l.status = 14, we(a, l.fatalError);
    else if (l.status !== 14 && l.destination === null) {
      l.destination = a;
      try {
        Uo(l, a);
      } catch (s) {
        gr(l, s, {}), zo(l, s);
      }
    }
  }
  function Dl(l, a) {
    (l.status === 11 || l.status === 10) && (l.status = 12);
    try {
      var s = l.abortableTasks;
      if (0 < s.size) {
        var v = a === void 0 ? Error(W(432)) : typeof a == "object" && a !== null && typeof a.then == "function" ? Error(W(530)) : a;
        l.fatalError = v, s.forEach(function(w) {
          return Pc(w, l, v);
        }), s.clear();
      }
      l.destination !== null && Uo(l, l.destination);
    } catch (w) {
      gr(l, w, {}), zo(l, w);
    }
  }
  function Yu(l, a, s) {
    if (a === null) s.rootNodes.push(l);
    else {
      var v = s.workingMap, w = v.get(a);
      w === void 0 && (w = [a[1], a[2], [], null], v.set(a, w), Yu(w, a[0], s)), w[2].push(l);
    }
  }
  function hs(l) {
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
  function Wo() {
    var l = ge.version;
    if (l !== "19.2.6")
      throw Error(
        W(
          527,
          l,
          "19.2.6"
        )
      );
  }
  return Wo(), Wo(), Ys.prerender = function(l, a) {
    return new Promise(function(s, v) {
      var w = a ? a.onHeaders : void 0, C;
      w && (C = function(Z) {
        w(new Headers(Z));
      });
      var S = R(
        a ? a.identifierPrefix : void 0,
        a ? a.unstable_externalRuntimeSrc : void 0,
        a ? a.bootstrapScriptContent : void 0,
        a ? a.bootstrapScripts : void 0,
        a ? a.bootstrapModules : void 0
      ), B = ja(
        l,
        S,
        bl(
          S,
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
                ro(B, K);
              },
              cancel: function(K) {
                B.destination = null, Dl(B, K);
              }
            },
            { highWaterMark: 0 }
          );
          Z = { postponed: hs(B), prelude: Z }, s(Z);
        },
        void 0,
        void 0,
        v,
        a ? a.onPostpone : void 0
      );
      if (a && a.signal) {
        var O = a.signal;
        if (O.aborted) Dl(B, O.reason);
        else {
          var z = function() {
            Dl(B, O.reason), O.removeEventListener("abort", z);
          };
          O.addEventListener("abort", z);
        }
      }
      Sl(B);
    });
  }, Ys.renderToReadableStream = function(l, a) {
    return new Promise(function(s, v) {
      var w, C, S = new Promise(function(pe, yn) {
        C = pe, w = yn;
      }), B = a ? a.onHeaders : void 0, O;
      B && (O = function(pe) {
        B(new Headers(pe));
      });
      var z = R(
        a ? a.identifierPrefix : void 0,
        a ? a.unstable_externalRuntimeSrc : void 0,
        a ? a.bootstrapScriptContent : void 0,
        a ? a.bootstrapScripts : void 0,
        a ? a.bootstrapModules : void 0
      ), Z = _o(
        l,
        z,
        bl(
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
                Z.destination = null, Dl(Z, yn);
              }
            },
            { highWaterMark: 0 }
          );
          pe.allReady = S, s(pe);
        },
        function(pe) {
          S.catch(function() {
          }), v(pe);
        },
        w,
        a ? a.onPostpone : void 0,
        a ? a.formState : void 0
      );
      if (a && a.signal) {
        var K = a.signal;
        if (K.aborted) Dl(Z, K.reason);
        else {
          var xe = function() {
            Dl(Z, K.reason), K.removeEventListener("abort", xe);
          };
          K.addEventListener("abort", xe);
        }
      }
      Sl(Z);
    });
  }, Ys.resume = function(l, a, s) {
    return new Promise(function(v, w) {
      var C, S, B = new Promise(function(K, xe) {
        S = K, C = xe;
      }), O = Mt(
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
        S,
        function() {
          var K = new ReadableStream(
            {
              type: "bytes",
              pull: function(xe) {
                ro(O, xe);
              },
              cancel: function(xe) {
                O.destination = null, Dl(O, xe);
              }
            },
            { highWaterMark: 0 }
          );
          K.allReady = B, v(K);
        },
        function(K) {
          B.catch(function() {
          }), w(K);
        },
        C,
        s ? s.onPostpone : void 0
      );
      if (s && s.signal) {
        var z = s.signal;
        if (z.aborted) Dl(O, z.reason);
        else {
          var Z = function() {
            Dl(O, z.reason), z.removeEventListener("abort", Z);
          };
          z.addEventListener("abort", Z);
        }
      }
      Sl(O);
    });
  }, Ys.resumeAndPrerender = function(l, a, s) {
    return new Promise(function(v, w) {
      var C = ml(
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
              pull: function(z) {
                ro(C, z);
              },
              cancel: function(z) {
                C.destination = null, Dl(C, z);
              }
            },
            { highWaterMark: 0 }
          );
          O = { postponed: hs(C), prelude: O }, v(O);
        },
        void 0,
        void 0,
        w,
        s ? s.onPostpone : void 0
      );
      if (s && s.signal) {
        var S = s.signal;
        if (S.aborted) Dl(C, S.reason);
        else {
          var B = function() {
            Dl(C, S.reason), S.removeEventListener("abort", B);
          };
          S.addEventListener("abort", B);
        }
      }
      Sl(C);
    });
  }, Ys.version = "19.2.6", Ys;
}
var lf = {};
var Xf;
function oh() {
  return Xf || (Xf = 1, process.env.NODE_ENV !== "production" && (function() {
    function ge(n, r, u, d) {
      return "" + r + (u === "s" ? "\\73 " : "\\53 ") + d;
    }
    function ue(n, r, u, d) {
      return "" + r + (u === "s" ? "\\u0073" : "\\u0053") + d;
    }
    function W(n) {
      return n === null || typeof n != "object" ? null : (n = bc && n[bc] || n["@@iterator"], typeof n == "function" ? n : null);
    }
    function Ae(n) {
      return n = Object.prototype.toString.call(n), n.slice(8, n.length - 1);
    }
    function ve(n) {
      var r = JSON.stringify(n);
      return '"' + n + '"' === r ? n : r;
    }
    function Se(n) {
      switch (typeof n) {
        case "string":
          return JSON.stringify(
            10 >= n.length ? n : n.slice(0, 10) + "..."
          );
        case "object":
          return Yi(n) ? "[...]" : n !== null && n.$$typeof === Xr ? "client" : (n = Ae(n), n === "Object" ? "{...}" : n);
        case "function":
          return n.$$typeof === Xr ? "client" : (n = n.displayName || n.name) ? "function " + n : "function";
        default:
          return String(n);
      }
    }
    function nn(n) {
      if (typeof n == "string") return n;
      switch (n) {
        case rl:
          return "Suspense";
        case El:
          return "SuspenseList";
      }
      if (typeof n == "object")
        switch (n.$$typeof) {
          case xl:
            return nn(n.render);
          case Gn:
            return nn(n.type);
          case Rl:
            var r = n._payload;
            n = n._init;
            try {
              return nn(n(r));
            } catch {
            }
        }
      return "";
    }
    function On(n, r) {
      var u = Ae(n);
      if (u !== "Object" && u !== "Array") return u;
      var d = -1, b = 0;
      if (Yi(n))
        if (pc.has(n)) {
          var E = pc.get(n);
          u = "<" + nn(E) + ">";
          for (var F = 0; F < n.length; F++) {
            var D = n[F];
            D = typeof D == "string" ? D : typeof D == "object" && D !== null ? "{" + On(D) + "}" : "{" + Se(D) + "}", "" + F === r ? (d = u.length, b = D.length, u += D) : u = 15 > D.length && 40 > u.length + D.length ? u + D : u + "{...}";
          }
          u += "</" + nn(E) + ">";
        } else {
          for (u = "[", E = 0; E < n.length; E++)
            0 < E && (u += ", "), F = n[E], F = typeof F == "object" && F !== null ? On(F) : Se(F), "" + E === r ? (d = u.length, b = F.length, u += F) : u = 10 > F.length && 40 > u.length + F.length ? u + F : u + "...";
          u += "]";
        }
      else if (n.$$typeof === Ya)
        u = "<" + nn(n.type) + "/>";
      else {
        if (n.$$typeof === Xr) return "client";
        if (wc.has(n)) {
          for (u = wc.get(n), u = "<" + (nn(u) || "..."), E = Object.keys(n), F = 0; F < E.length; F++) {
            u += " ", D = E[F], u += ve(D) + "=";
            var te = n[D], H = D === r && typeof te == "object" && te !== null ? On(te) : Se(te);
            typeof te != "string" && (H = "{" + H + "}"), D === r ? (d = u.length, b = H.length, u += H) : u = 10 > H.length && 40 > u.length + H.length ? u + H : u + "...";
          }
          u += ">";
        } else {
          for (u = "{", E = Object.keys(n), F = 0; F < E.length; F++)
            0 < F && (u += ", "), D = E[F], u += ve(D) + ": ", te = n[D], te = typeof te == "object" && te !== null ? On(te) : Se(te), D === r ? (d = u.length, b = te.length, u += te) : u = 10 > te.length && 40 > u.length + te.length ? u + te : u + "...";
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
    function Fe(n, r) {
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
      return mn.call(Xa, n) ? !0 : mn.call(Ga, n) ? !1 : ya.test(n) ? Xa[n] = !0 : (Ga[n] = !0, console.error("Invalid attribute name: `%s`", n), !1);
    }
    function ht(n, r) {
      ir[r.type] || r.onChange || r.onInput || r.readOnly || r.disabled || r.value == null || console.error(
        n === "select" ? "You provided a `value` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultValue`. Otherwise, set `onChange`." : "You provided a `value` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultValue`. Otherwise, set either `onChange` or `readOnly`."
      ), r.onChange || r.readOnly || r.disabled || r.checked == null || console.error(
        "You provided a `checked` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultChecked`. Otherwise, set either `onChange` or `readOnly`."
      );
    }
    function rr(n, r) {
      if (mn.call(ti, r) && ti[r])
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
      if (as.test(r)) {
        if (n = r.toLowerCase(), n = Rs.hasOwnProperty(n) ? n : null, n == null) return ti[r] = !0, !1;
        r !== n && (console.error(
          "Unknown ARIA attribute `%s`. Did you mean `%s`?",
          r,
          n
        ), ti[r] = !0);
      }
      return !0;
    }
    function Ot(n, r) {
      var u = [], d;
      for (d in r)
        rr(n, d) || u.push(d);
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
    function vl(n, r, u, d) {
      if (mn.call(hr, r) && hr[r])
        return !0;
      var b = r.toLowerCase();
      if (b === "onfocusin" || b === "onfocusout")
        return console.error(
          "React uses onFocus and onBlur instead of onFocusIn and onFocusOut. All React events are normalized to bubble, so onFocusIn and onFocusOut are not needed/supported by React."
        ), hr[r] = !0;
      if (typeof u == "function" && (n === "form" && r === "action" || n === "input" && r === "formAction" || n === "button" && r === "formAction"))
        return !0;
      if (Gi.test(r))
        return os.test(r) && console.error(
          "Invalid event handler property `%s`. React events use the camelCase naming convention, for example `onClick`.",
          r
        ), hr[r] = !0;
      if (Za.test(r) || qc.test(r)) return !0;
      if (b === "innerhtml")
        return console.error(
          "Directly setting property `innerHTML` is not permitted. For more information, lookup documentation on `dangerouslySetInnerHTML`."
        ), hr[r] = !0;
      if (b === "aria")
        return console.error(
          "The `aria` attribute is reserved for future use in React. Pass individual `aria-` attributes instead."
        ), hr[r] = !0;
      if (b === "is" && u !== null && u !== void 0 && typeof u != "string")
        return console.error(
          "Received a `%s` for a string attribute `is`. If this is expected, cast the value to a string.",
          typeof u
        ), hr[r] = !0;
      if (typeof u == "number" && isNaN(u))
        return console.error(
          "Received NaN for the `%s` attribute. If this is expected, cast the value to a string.",
          r
        ), hr[r] = !0;
      if (Tc.hasOwnProperty(b)) {
        if (b = Tc[b], b !== r)
          return console.error(
            "Invalid DOM property `%s`. Did you mean `%s`?",
            r,
            b
          ), hr[r] = !0;
      } else if (r !== b)
        return console.error(
          "React does not recognize the `%s` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `%s` instead. If you accidentally passed it from a parent component, remove it from the DOM element.",
          r,
          b
        ), hr[r] = !0;
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
              ), hr[r] = !0);
          }
        case "function":
        case "symbol":
          return hr[r] = !0, !1;
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
            ), hr[r] = !0;
          }
      }
      return !0;
    }
    function Kt(n, r, u) {
      var d = [], b;
      for (b in r)
        vl(n, b, r[b]) || d.push(b);
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
      return n.replace(ar, function(r, u) {
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
    function Rt(n) {
      return ee(n), ("" + n).replace(ye, ue);
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
    function Pe(n, r) {
      if (typeof r != "object")
        throw Error(
          "The `style` prop expects a mapping from style properties to values, not a string. For example, style={{marginRight: spacing + 'em'}} when using JSX."
        );
      var u = !0, d;
      for (d in r)
        if (mn.call(r, d)) {
          var b = r[d];
          if (b != null && typeof b != "boolean" && b !== "") {
            if (d.indexOf("--") === 0) {
              var E = Ie(d);
              Fe(b, d), b = Ie(("" + b).trim());
            } else {
              E = d;
              var F = b;
              if (-1 < E.indexOf("-")) {
                var D = E;
                qn.hasOwnProperty(D) && qn[D] || (qn[D] = !0, console.error(
                  "Unsupported style property %s. Did you mean %s?",
                  D,
                  Vn(D.replace(dr, "ms-"))
                ));
              } else if (Qa.test(E))
                D = E, qn.hasOwnProperty(D) && qn[D] || (qn[D] = !0, console.error(
                  "Unsupported vendor-prefixed style property %s. Did you mean %s?",
                  D,
                  D.charAt(0).toUpperCase() + D.slice(1)
                ));
              else if (wa.test(F)) {
                D = E;
                var te = F;
                zn.hasOwnProperty(te) && zn[te] || (zn[te] = !0, console.error(
                  `Style property values shouldn't contain a semicolon. Try "%s: %s" instead.`,
                  D,
                  te.replace(
                    wa,
                    ""
                  )
                ));
              }
              typeof F == "number" && (isNaN(F) ? Ja || (Ja = !0, console.error(
                "`NaN` is an invalid value for the `%s` css style property.",
                E
              )) : isFinite(F) || Do || (Do = !0, console.error(
                "`Infinity` is an invalid value for the `%s` css style property.",
                E
              ))), E = d, F = yt.get(E), F !== void 0 || (F = Ie(
                E.replace(No, "-$1").toLowerCase().replace(Lu, "-ms-")
              ), yt.set(E, F)), E = F, typeof b == "number" ? b = b === 0 || ba.has(d) ? "" + b : b + "px" : (Fe(b, d), b = Ie(
                ("" + b).trim()
              ));
            }
            u ? (u = !1, n.push(
              Sn,
              E,
              Cr,
              b
            )) : n.push(Dn, E, Cr, b);
          }
        }
      u || n.push(qe);
    }
    function J(n, r, u) {
      u && typeof u != "function" && typeof u != "symbol" && n.push(xn, r, An);
    }
    function he(n, r, u) {
      typeof u != "function" && typeof u != "symbol" && typeof u != "boolean" && n.push(
        xn,
        r,
        kn,
        Ie(u),
        qe
      );
    }
    function xr(n, r) {
      this.push('<input type="hidden"'), yl(n), he(this, "name", r), he(this, "value", n), this.push(pa);
    }
    function yl(n) {
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
            b?.forEach(yl);
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
          xn,
          "formAction",
          kn,
          $t,
          qe
        ), F = E = b = d = D = null, _e(r, u));
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
          N(u, r), u = Ve("" + u), n.push(
            xn,
            r,
            kn,
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
            xn,
            "xlink:href",
            kn,
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
            xn,
            r,
            kn,
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
          u && typeof u != "function" && typeof u != "symbol" && n.push(xn, r, An);
          break;
        case "capture":
        case "download":
          u === !0 ? n.push(xn, r, An) : u !== !1 && typeof u != "function" && typeof u != "symbol" && n.push(
            xn,
            r,
            kn,
            Ie(u),
            qe
          );
          break;
        case "cols":
        case "rows":
        case "size":
        case "span":
          typeof u != "function" && typeof u != "symbol" && !isNaN(u) && 1 <= u && n.push(
            xn,
            r,
            kn,
            Ie(u),
            qe
          );
          break;
        case "rowSpan":
        case "start":
          typeof u == "function" || typeof u == "symbol" || isNaN(u) || n.push(
            xn,
            r,
            kn,
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
              xn,
              r,
              kn,
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
        u != null && (r += u, Ol || typeof u == "string" || typeof u == "number" || typeof u == "bigint" || (Ol = !0, console.error(
          "Cannot infer the option value of complex children. Pass a `value` prop or use a plain string as children to <option>."
        )));
      }), r;
    }
    function _e(n, r) {
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
    function ke(n, r) {
      n.push(St("link"));
      for (var u in r)
        if (mn.call(r, u)) {
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
    function Ct(n) {
      return ee(n), ("" + n).replace(Lo, ge);
    }
    function En(n, r, u) {
      n.push(St(u));
      for (var d in r)
        if (mn.call(r, d)) {
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
      return n.push(pa), null;
    }
    function tt(n, r) {
      n.push(St("title"));
      var u = null, d = null, b;
      for (b in r)
        if (mn.call(r, b)) {
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
      return n.push(sn), r = Array.isArray(u) ? 2 > u.length ? u[0] : null : u, typeof r != "function" && typeof r != "symbol" && r !== null && r !== void 0 && n.push(Ie("" + r)), we(n, d, u), n.push(kt("title")), null;
    }
    function mt(n, r) {
      n.push(St("script"));
      var u = null, d = null, b;
      for (b in r)
        if (mn.call(r, b)) {
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
      )), we(n, d, u), typeof u == "string" && n.push(Rt(u)), n.push(kt("script")), null;
    }
    function Da(n, r, u) {
      n.push(St(u));
      var d = u = null, b;
      for (b in r)
        if (mn.call(r, b)) {
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
      n.push(St(u));
      var d = u = null, b;
      for (b in r)
        if (mn.call(r, b)) {
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
    function St(n) {
      var r = Ec.get(n);
      if (r === void 0) {
        if (!Sr.test(n)) throw Error("Invalid tag: " + n);
        r = "<" + n, Ec.set(n, r);
      }
      return r;
    }
    function Tn(n, r, u, d, b, E, F, D, te) {
      Ot(r, u), r !== "input" && r !== "textarea" && r !== "select" || u == null || u.value !== null || xi || (xi = !0, r === "select" && u.multiple ? console.error(
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
      switch (H || typeof u.is == "string" || Kt(r, u), !u.suppressContentEditableWarning && u.contentEditable && u.children != null && console.error(
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
          n.push(St("a"));
          var j = null, de = null, Ce;
          for (Ce in u)
            if (mn.call(u, Ce)) {
              var be = u[Ce];
              if (be != null)
                switch (Ce) {
                  case "children":
                    j = be;
                    break;
                  case "dangerouslySetInnerHTML":
                    de = be;
                    break;
                  case "href":
                    be === "" ? he(n, "href", "") : Y(n, Ce, be);
                    break;
                  default:
                    Y(n, Ce, be);
                }
            }
          if (n.push(sn), we(n, de, j), typeof j == "string") {
            n.push(Ie(j));
            var ae = null;
          } else ae = j;
          return ae;
        case "g":
        case "p":
        case "li":
          break;
        case "select":
          ht("select", u), Te(u, "value"), Te(u, "defaultValue"), u.value === void 0 || u.defaultValue === void 0 || Pl || (console.error(
            "Select elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled select element and remove one of these props. More info: https://react.dev/link/controlled-components"
          ), Pl = !0), n.push(St("select"));
          var fn = null, Jn = null, Ye;
          for (Ye in u)
            if (mn.call(u, Ye)) {
              var Pn = u[Ye];
              if (Pn != null)
                switch (Ye) {
                  case "children":
                    fn = Pn;
                    break;
                  case "dangerouslySetInnerHTML":
                    Jn = Pn;
                    break;
                  case "defaultValue":
                  case "value":
                    break;
                  default:
                    Y(
                      n,
                      Ye,
                      Pn
                    );
                }
            }
          return n.push(sn), we(n, Jn, fn), fn;
        case "option":
          var yr = D.selectedValue;
          n.push(St("option"));
          var br = null, In = null, er = null, Si = null, Vr;
          for (Vr in u)
            if (mn.call(u, Vr)) {
              var Me = u[Vr];
              if (Me != null)
                switch (Vr) {
                  case "children":
                    br = Me;
                    break;
                  case "selected":
                    er = Me, Qi || (console.error(
                      "Use the `defaultValue` or `value` props on <select> instead of setting `selected` on <option>."
                    ), Qi = !0);
                    break;
                  case "dangerouslySetInnerHTML":
                    Si = Me;
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
          if (yr != null) {
            if (In !== null) {
              N(In, "value");
              var Hn = "" + In;
            } else
              Si === null || Ei || (Ei = !0, console.error(
                "Pass a `value` prop if you set dangerouslyInnerHTML so React knows which value should be selected."
              )), Hn = me(br);
            if (Yi(yr)) {
              for (var Un = 0; Un < yr.length; Un++)
                if (N(yr[Un], "value"), "" + yr[Un] === Hn) {
                  n.push(' selected=""');
                  break;
                }
            } else
              N(yr, "select.value"), "" + yr === Hn && n.push(' selected=""');
          } else er && n.push(' selected=""');
          return n.push(sn), we(n, Si, br), br;
        case "textarea":
          ht("textarea", u), u.value === void 0 || u.defaultValue === void 0 || Fl || (console.error(
            "Textarea elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled textarea and remove one of these props. More info: https://react.dev/link/controlled-components"
          ), Fl = !0), n.push(St("textarea"));
          var Xn = null, Tt = null, pn = null, tn;
          for (tn in u)
            if (mn.call(u, tn)) {
              var Nr = u[tn];
              if (Nr != null)
                switch (tn) {
                  case "children":
                    pn = Nr;
                    break;
                  case "value":
                    Xn = Nr;
                    break;
                  case "defaultValue":
                    Tt = Nr;
                    break;
                  case "dangerouslySetInnerHTML":
                    throw Error(
                      "`dangerouslySetInnerHTML` does not make sense on <textarea>."
                    );
                  default:
                    Y(
                      n,
                      tn,
                      Nr
                    );
                }
            }
          if (Xn === null && Tt !== null && (Xn = Tt), n.push(sn), pn != null) {
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
` && n.push(Ta), Xn !== null && (N(Xn, "value"), n.push(Ie("" + Xn))), null;
        case "input":
          ht("input", u), n.push(St("input"));
          var Wn = null, wr = null, ct = null, al = null, Ko = null, ol = null, ki = null, Ai = null, Pi = null, cr;
          for (cr in u)
            if (mn.call(u, cr)) {
              var e = u[cr];
              if (e != null)
                switch (cr) {
                  case "children":
                  case "dangerouslySetInnerHTML":
                    throw Error(
                      "input is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
                    );
                  case "name":
                    Wn = e;
                    break;
                  case "formAction":
                    wr = e;
                    break;
                  case "formEncType":
                    ct = e;
                    break;
                  case "formMethod":
                    al = e;
                    break;
                  case "formTarget":
                    Ko = e;
                    break;
                  case "defaultChecked":
                    Pi = e;
                    break;
                  case "defaultValue":
                    ki = e;
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
                      cr,
                      e
                    );
                }
            }
          wr === null || u.type === "image" || u.type === "submit" || Jt || (Jt = !0, console.error(
            'An input can only specify a formAction along with type="submit" or type="image".'
          ));
          var t = T(
            n,
            d,
            b,
            wr,
            ct,
            al,
            Ko,
            Wn
          );
          return Ai === null || Pi === null || mr || (console.error(
            "%s contains an input of type %s with both checked and defaultChecked props. Input elements must be either controlled or uncontrolled (specify either the checked prop, or the defaultChecked prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://react.dev/link/controlled-components",
            "A component",
            u.type
          ), mr = !0), ol === null || ki === null || Zi || (console.error(
            "%s contains an input of type %s with both value and defaultValue props. Input elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://react.dev/link/controlled-components",
            "A component",
            u.type
          ), Zi = !0), Ai !== null ? J(n, "checked", Ai) : Pi !== null && J(n, "checked", Pi), ol !== null ? Y(n, "value", ol) : ki !== null && Y(n, "value", ki), n.push(pa), t?.forEach(xr, n), null;
        case "button":
          n.push(St("button"));
          var c = null, h = null, y = null, x = null, k = null, M = null, V = null, _;
          for (_ in u)
            if (mn.call(u, _)) {
              var U = u[_];
              if (U != null)
                switch (_) {
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
                    k = U;
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
                      _,
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
            k,
            M,
            V,
            y
          );
          if (n.push(sn), oe?.forEach(xr, n), we(n, h, c), typeof c == "string") {
            n.push(Ie(c));
            var se = null;
          } else se = c;
          return se;
        case "form":
          n.push(St("form"));
          var ce = null, le = null, Ue = null, Zn = null, Be = null, hn = null, Pt;
          for (Pt in u)
            if (mn.call(u, Pt)) {
              var Ht = u[Pt];
              if (Ht != null)
                switch (Pt) {
                  case "children":
                    ce = Ht;
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
                    Be = Ht;
                    break;
                  case "target":
                    hn = Ht;
                    break;
                  default:
                    Y(
                      n,
                      Pt,
                      Ht
                    );
                }
            }
          var Fn = null, Le = null;
          if (typeof Ue == "function") {
            Zn === null && Be === null || xc || (xc = !0, console.error(
              "Cannot specify a encType or method for a form that specifies a function as the action. React provides those automatically. They will get overridden."
            )), hn === null || Ka || (Ka = !0, console.error(
              "Cannot specify a target for a form that specifies a function as the action. The function will always be executed in the same window."
            ));
            var Ut = fe(
              d,
              Ue
            );
            Ut !== null ? (Ue = Ut.action || "", Zn = Ut.encType, Be = Ut.method, hn = Ut.target, Fn = Ut.data, Le = Ut.name) : (n.push(
              xn,
              "action",
              kn,
              $t,
              qe
            ), hn = Be = Zn = Ue = null, _e(d, b));
          }
          if (Ue != null && Y(n, "action", Ue), Zn != null && Y(n, "encType", Zn), Be != null && Y(n, "method", Be), hn != null && Y(n, "target", hn), n.push(sn), Le !== null && (n.push('<input type="hidden"'), he(n, "name", Le), n.push(pa), Fn?.forEach(
            xr,
            n
          )), we(n, le, ce), typeof ce == "string") {
            n.push(Ie(ce));
            var Lr = null;
          } else Lr = ce;
          return Lr;
        case "menuitem":
          n.push(St("menuitem"));
          for (var Qn in u)
            if (mn.call(u, Qn)) {
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
          n.push(St("object"));
          var cl = null, pr = null, nr;
          for (nr in u)
            if (mn.call(u, nr)) {
              var st = u[nr];
              if (st != null)
                switch (nr) {
                  case "children":
                    cl = st;
                    break;
                  case "dangerouslySetInnerHTML":
                    pr = st;
                    break;
                  case "data":
                    N(st, "data");
                    var Vt = Ve("" + st);
                    if (Vt === "") {
                      console.error(
                        'An empty string ("") was passed to the %s attribute. To fix this, either do not render the element at all or pass null to %s instead of an empty string.',
                        nr,
                        nr
                      );
                      break;
                    }
                    n.push(
                      xn,
                      "data",
                      kn,
                      Ie(Vt),
                      qe
                    );
                    break;
                  default:
                    Y(
                      n,
                      nr,
                      st
                    );
                }
            }
          if (n.push(sn), we(n, pr, cl), typeof cl == "string") {
            n.push(Ie(cl));
            var ul = null;
          } else ul = cl;
          return ul;
        case "title":
          var Al = D.tagScope & 1, tr = D.tagScope & 4;
          if (mn.call(u, "children")) {
            var xt = u.children, _r = Array.isArray(xt) ? 2 > xt.length ? xt[0] : null : xt;
            Array.isArray(xt) && 1 < xt.length ? console.error(
              "React expects the `children` prop of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found an Array with length %s instead. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert `children` of <title> tags to a single string value which is why Arrays of length greater than 1 are not supported. When using JSX it can be common to combine text nodes and value nodes. For example: <title>hello {nameOfUser}</title>. While not immediately apparent, `children` in this case is an Array with length 2. If your `children` prop is using this form try rewriting it using a template string: <title>{`hello ${nameOfUser}`}</title>.",
              xt.length
            ) : typeof _r == "function" || typeof _r == "symbol" ? console.error(
              "React expect children of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found %s instead. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert children of <title> tags to a single string value.",
              typeof _r == "function" ? "a Function" : "a Sybmol"
            ) : _r && _r.toString === {}.toString && (_r.$$typeof != null ? console.error(
              "React expects the `children` prop of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found an object that appears to be a React element which never implements a suitable `toString` method. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert children of <title> tags to a single string value which is why rendering React elements is not supported. If the `children` of <title> is a React Component try moving the <title> tag into that component. If the `children` of <title> is some HTML markup change it to be Text only to be valid HTML."
            ) : console.error(
              "React expects the `children` prop of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found an object that does not implement a suitable `toString` method. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert children of <title> tags to a single string value. Using the default `toString` method available on every object is almost certainly an error. Consider whether the `children` of this <title> is an object in error and change it to a string or number value if so. Otherwise implement a `toString` method that React can use to produce a valid <title>."
            ));
          }
          if (D.insertionMode === Xe || Al || u.itemProp != null)
            var sl = tt(
              n,
              u
            );
          else
            tr ? sl = null : (tt(b.hoistableChunks, u), sl = void 0);
          return sl;
        case "link":
          var Br = D.tagScope & 1, na = D.tagScope & 4, fl = u.rel, Wt = u.href, zl = u.precedence;
          if (D.insertionMode === Xe || Br || u.itemProp != null || typeof fl != "string" || typeof Wt != "string" || Wt === "") {
            fl === "stylesheet" && typeof u.precedence == "string" && (typeof Wt == "string" && Wt || console.error(
              'React encountered a `<link rel="stylesheet" .../>` with a `precedence` prop and expected the `href` prop to be a non-empty string but ecountered %s instead. If your intent was to have React hoist and deduplciate this stylesheet using the `precedence` prop ensure there is a non-empty string `href` prop as well, otherwise remove the `precedence` prop.',
              Wt === null ? "`null`" : Wt === void 0 ? "`undefined`" : Wt === "" ? "an empty string" : 'something with type "' + typeof Wt + '"'
            )), ke(n, u);
            var ur = null;
          } else if (u.rel === "stylesheet")
            if (typeof zl != "string" || u.disabled != null || u.onLoad || u.onError) {
              if (typeof zl == "string") {
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
              ur = ke(
                n,
                u
              );
            } else {
              var Fi = b.styles.get(zl), Ft = d.styleResources.hasOwnProperty(
                Wt
              ) ? d.styleResources[Wt] : void 0;
              if (Ft !== I) {
                d.styleResources[Wt] = I, Fi || (Fi = {
                  precedence: Ie(zl),
                  rules: [],
                  hrefs: [],
                  sheets: /* @__PURE__ */ new Map()
                }, b.styles.set(zl, Fi));
                var Hl = {
                  state: w,
                  props: it({}, u, {
                    "data-precedence": u.precedence,
                    precedence: null
                  })
                };
                if (Ft) {
                  Ft.length === 2 && bl(Hl.props, Ft);
                  var zr = b.preloads.stylesheets.get(Wt);
                  zr && 0 < zr.length ? zr.length = 0 : Hl.state = C;
                }
                Fi.sheets.set(Wt, Hl), F && F.stylesheets.add(Hl);
              } else if (Fi) {
                var Nc = Fi.sheets.get(Wt);
                Nc && F && F.stylesheets.add(Nc);
              }
              te && n.push("<!-- -->"), ur = null;
            }
          else
            u.onLoad || u.onError ? ur = ke(
              n,
              u
            ) : (te && n.push("<!-- -->"), ur = na ? null : ke(b.hoistableChunks, u));
          return ur;
        case "script":
          var jo = D.tagScope & 1, ci = u.async;
          if (typeof u.src != "string" || !u.src || !ci || typeof ci == "function" || typeof ci == "symbol" || u.onLoad || u.onError || D.insertionMode === Xe || jo || u.itemProp != null)
            var qo = mt(
              n,
              u
            );
          else {
            var hl = u.src;
            if (u.type === "module")
              var Lc = d.moduleScriptResources, Ju = b.preloads.moduleScripts;
            else
              Lc = d.scriptResources, Ju = b.preloads.scripts;
            var Ul = Lc.hasOwnProperty(hl) ? Lc[hl] : void 0;
            if (Ul !== I) {
              Lc[hl] = I;
              var _c = u;
              if (Ul) {
                Ul.length === 2 && (_c = it({}, u), bl(_c, Ul));
                var Hr = Ju.get(hl);
                Hr && (Hr.length = 0);
              }
              var $o = [];
              b.scripts.add($o), mt($o, _c);
            }
            te && n.push("<!-- -->"), qo = null;
          }
          return qo;
        case "style":
          var go = D.tagScope & 1;
          if (mn.call(u, "children")) {
            var Oa = u.children, Wl = Array.isArray(Oa) ? 2 > Oa.length ? Oa[0] : null : Oa;
            (typeof Wl == "function" || typeof Wl == "symbol" || Array.isArray(Wl)) && console.error(
              "React expect children of <style> tags to be a string, number, or object with a `toString` method but found %s instead. In browsers style Elements can only have `Text` Nodes as children.",
              typeof Wl == "function" ? "a Function" : typeof Wl == "symbol" ? "a Sybmol" : "an Array"
            );
          }
          var Yl = u.precedence, Oi = u.href, dl = u.nonce;
          if (D.insertionMode === Xe || go || u.itemProp != null || typeof Yl != "string" || typeof Oi != "string" || Oi === "") {
            n.push(St("style"));
            var Tr = null, Ma = null, Mi;
            for (Mi in u)
              if (mn.call(u, Mi)) {
                var vo = u[Mi];
                if (vo != null)
                  switch (Mi) {
                    case "children":
                      Tr = vo;
                      break;
                    case "dangerouslySetInnerHTML":
                      Ma = vo;
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
            var ta = Array.isArray(Tr) ? 2 > Tr.length ? Tr[0] : null : Tr;
            typeof ta != "function" && typeof ta != "symbol" && ta !== null && ta !== void 0 && n.push(Ct(ta)), we(
              n,
              Ma,
              Tr
            ), n.push(kt("style"));
            var ps = null;
          } else {
            Oi.includes(" ") && console.error(
              'React expected the `href` prop for a <style> tag opting into hoisting semantics using the `precedence` prop to not have any spaces but ecountered spaces instead. using spaces in this prop will cause hydration of this style to fail on the client. The href for the <style> where this ocurred is "%s".',
              Oi
            );
            var Kr = b.styles.get(Yl), ui = d.styleResources.hasOwnProperty(Oi) ? d.styleResources[Oi] : void 0;
            if (ui !== I) {
              d.styleResources[Oi] = I, ui && console.error(
                'React encountered a hoistable style tag for the same href as a preload: "%s". When using a style tag to inline styles you should not also preload it as a stylsheet.',
                Oi
              ), Kr || (Kr = {
                precedence: Ie(Yl),
                rules: [],
                hrefs: [],
                sheets: /* @__PURE__ */ new Map()
              }, b.styles.set(
                Yl,
                Kr
              ));
              var Bc = b.nonce.style;
              if (Bc && Bc !== dl)
                console.error(
                  'React encountered a style tag with `precedence` "%s" and `nonce` "%s". When React manages style rules using `precedence` it will only include rules if the nonce matches the style nonce "%s" that was included with this render.',
                  Yl,
                  dl,
                  Bc
                );
              else {
                !Bc && dl && console.error(
                  'React encountered a style tag with `precedence` "%s" and `nonce` "%s". When React manages style rules using `precedence` it will only include a nonce attributes if you also provide the same style nonce value as a render option.',
                  Yl,
                  dl
                ), Kr.hrefs.push(
                  Ie(Oi)
                );
                var pu = Kr.rules, Tu = null, Xs = null, yo;
                for (yo in u)
                  if (mn.call(u, yo)) {
                    var ec = u[yo];
                    if (ec != null)
                      switch (yo) {
                        case "children":
                          Tu = ec;
                          break;
                        case "dangerouslySetInnerHTML":
                          Xs = ec;
                      }
                  }
                var bo = Array.isArray(Tu) ? 2 > Tu.length ? Tu[0] : null : Tu;
                typeof bo != "function" && typeof bo != "symbol" && bo !== null && bo !== void 0 && pu.push(Ct(bo)), we(pu, Xs, Tu);
              }
            }
            Kr && F && F.styles.add(Kr), te && n.push("<!-- -->"), ps = void 0;
          }
          return ps;
        case "meta":
          var xu = D.tagScope & 1, Ls = D.tagScope & 4;
          if (D.insertionMode === Xe || xu || u.itemProp != null)
            var ks = En(
              n,
              u,
              "meta"
            );
          else
            te && n.push("<!-- -->"), ks = Ls ? null : typeof u.charSet == "string" ? En(b.charsetChunks, u, "meta") : u.name === "viewport" ? En(b.viewportChunks, u, "meta") : En(
              b.hoistableChunks,
              u,
              "meta"
            );
          return ks;
        case "listing":
        case "pre":
          n.push(St(r));
          var jr = null, Ii = null, wo;
          for (wo in u)
            if (mn.call(u, wo)) {
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
            var Gl = Ii.__html;
            Gl != null && (typeof Gl == "string" && 0 < Gl.length && Gl[0] === `
` ? n.push(Ta, Gl) : (ee(Gl), n.push("" + Gl)));
          }
          return typeof jr == "string" && jr[0] === `
` && n.push(Ta), jr;
        case "img":
          var Yt = D.tagScope & 3, Et = u.src, et = u.srcSet;
          if (!(u.loading === "lazy" || !Et && !et || typeof Et != "string" && Et != null || typeof et != "string" && et != null || u.fetchPriority === "low" || Yt) && (typeof Et != "string" || Et[4] !== ":" || Et[0] !== "d" && Et[0] !== "D" || Et[1] !== "a" && Et[1] !== "A" || Et[2] !== "t" && Et[2] !== "T" || Et[3] !== "a" && Et[3] !== "A") && (typeof et != "string" || et[4] !== ":" || et[0] !== "d" && et[0] !== "D" || et[1] !== "a" && et[1] !== "A" || et[2] !== "t" && et[2] !== "T" || et[3] !== "a" && et[3] !== "A")) {
            F !== null && D.tagScope & 64 && (F.suspenseyImages = !0);
            var As = typeof u.sizes == "string" ? u.sizes : void 0, nc = et ? et + `
` + (As || "") : Et, Ku = b.preloads.images, tc = Ku.get(nc);
            if (tc)
              (u.fetchPriority === "high" || 10 > b.highImagePreloads.size) && (Ku.delete(nc), b.highImagePreloads.add(tc));
            else if (!d.imageResources.hasOwnProperty(nc)) {
              d.imageResources[nc] = G;
              var zc = u.crossOrigin, ju = typeof zc == "string" ? zc === "use-credentials" ? zc : "" : void 0, Hc = b.headers, Eu;
              Hc && 0 < Hc.remainingCapacity && typeof u.srcSet != "string" && (u.fetchPriority === "high" || 500 > Hc.highImagePreloads.length) && (Eu = R(Et, "image", {
                imageSrcSet: u.srcSet,
                imageSizes: u.sizes,
                crossOrigin: ju,
                integrity: u.integrity,
                nonce: u.nonce,
                type: u.type,
                fetchPriority: u.fetchPriority,
                referrerPolicy: u.refererPolicy
              }), 0 <= (Hc.remainingCapacity -= Eu.length + 2)) ? (b.resets.image[nc] = G, Hc.highImagePreloads && (Hc.highImagePreloads += ", "), Hc.highImagePreloads += Eu) : (tc = [], ke(tc, {
                rel: "preload",
                as: "image",
                href: et ? void 0 : Et,
                imageSrcSet: et,
                imageSizes: As,
                crossOrigin: ju,
                integrity: u.integrity,
                type: u.type,
                fetchPriority: u.fetchPriority,
                referrerPolicy: u.referrerPolicy
              }), u.fetchPriority === "high" || 10 > b.highImagePreloads.size ? b.highImagePreloads.add(tc) : (b.bulkPreloads.add(tc), Ku.set(nc, tc)));
            }
          }
          return En(n, u, "img");
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
          return En(n, u, r);
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
            var Ts = Da(
              Ru.headChunks,
              u,
              "head"
            );
          } else
            Ts = Ge(
              n,
              u,
              "head"
            );
          return Ts;
        case "body":
          if (D.insertionMode < ze) {
            var Ps = E || b.preamble;
            if (Ps.bodyChunks)
              throw Error("The `<body>` tag may only be rendered once.");
            E !== null && n.push("<!--body-->"), Ps.bodyChunks = [];
            var _s = Da(
              Ps.bodyChunks,
              u,
              "body"
            );
          } else
            _s = Ge(
              n,
              u,
              "body"
            );
          return _s;
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
            n.push(St(r));
            var Uc = null, po = null, Ia;
            for (Ia in u)
              if (mn.call(u, Ia)) {
                var gl = u[Ia];
                if (gl != null) {
                  var Cu = Ia;
                  switch (Ia) {
                    case "children":
                      Uc = gl;
                      break;
                    case "dangerouslySetInnerHTML":
                      po = gl;
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
                      if (X(Ia) && typeof gl != "function" && typeof gl != "symbol" && gl !== !1) {
                        if (gl === !0)
                          gl = "";
                        else if (typeof gl == "object")
                          continue;
                        n.push(
                          xn,
                          Cu,
                          kn,
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
    function kt(n) {
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
      return n.push(r.boundaryPrefix), r = u.toString(16), n.push(r), n.push(_t);
    }
    function De(n, r, u, d) {
      switch (u.insertionMode) {
        case on:
        case Ze:
        case je:
        case ze:
          return n.push(Ea), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(bt);
        case Xe:
          return n.push(Ra), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(qa);
        case at:
          return n.push(gr), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(zo);
        case cn:
          return n.push(_u), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push($a);
        case wn:
          return n.push(tu), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(ru);
        case Mn:
          return n.push(eo), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(no);
        case en:
          return n.push(Sc), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(kc);
        default:
          throw Error("Unknown insertion mode. This is a bug in React.");
      }
    }
    function Er(n, r) {
      switch (r.insertionMode) {
        case on:
        case Ze:
        case je:
        case ze:
          return n.push(Zr);
        case Xe:
          return n.push(Ml);
        case at:
          return n.push(Ar);
        case cn:
          return n.push(mc);
        case wn:
          return n.push(Ri);
        case Mn:
          return n.push(Pr);
        case en:
          return n.push(Bu);
        default:
          throw Error("Unknown insertion mode. This is a bug in React.");
      }
    }
    function At(n) {
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
        ma,
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
        for (this.push(re.startInlineStyle), this.push(Oc), this.push(n.precedence), this.push(Sa); d < u.length - 1; d++)
          this.push(u[d]), this.push(Dl);
        for (this.push(u[d]), this.push(ss), d = 0; d < r.length; d++) this.push(r[d]);
        Uo = this.push(fs), li = !0, r.length = 0, u.length = 0;
      }
    }
    function vn(n) {
      return n.state !== S ? li = !0 : !1;
    }
    function lr(n, r, u) {
      return li = !1, Uo = !0, re = u, r.styles.forEach(Na, n), re = null, r.stylesheets.forEach(vn), li && (u.stylesToHoist = !0), Uo;
    }
    function _n(n) {
      for (var r = 0; r < n.length; r++) this.push(n[r]);
      n.length = 0;
    }
    function rc(n) {
      ke(Sl, n.props);
      for (var r = 0; r < Sl.length; r++)
        this.push(Sl[r]);
      Sl.length = 0, n.state = S;
    }
    function dt(n) {
      var r = 0 < n.sheets.size;
      n.sheets.forEach(rc, this), n.sheets.clear();
      var u = n.rules, d = n.hrefs;
      if (!r || d.length) {
        if (this.push(re.startInlineStyle), this.push(ka), this.push(n.precedence), n = 0, d.length) {
          for (this.push(ro); n < d.length - 1; n++)
            this.push(d[n]), this.push(Dl);
          this.push(d[n]);
        }
        for (this.push(Yu), n = 0; n < u.length; n++)
          this.push(u[n]);
        this.push(hs), u.length = 0, d.length = 0;
      }
    }
    function xo(n) {
      if (n.state === w) {
        n.state = C;
        var r = n.props;
        for (ke(Sl, {
          rel: "preload",
          as: "style",
          href: n.props.href,
          crossOrigin: r.crossOrigin,
          fetchPriority: r.fetchPriority,
          integrity: r.integrity,
          media: r.media,
          hrefLang: r.hrefLang,
          referrerPolicy: r.referrerPolicy
        }), n = 0; n < Sl.length; n++)
          this.push(Sl[n]);
        Sl.length = 0;
      }
    }
    function Eo(n) {
      n.sheets.forEach(xo, this), n.sheets.clear();
    }
    function el(n, r) {
      (r.instructions & A) === o && (r.instructions |= A, n.push(
        Wo,
        Ie("_" + r.idPrefix + "R_"),
        qe
      ));
    }
    function oa(n, r) {
      n.push(l);
      var u = l;
      r.stylesheets.forEach(function(d) {
        if (d.state !== S)
          if (d.state === B)
            n.push(u), d = d.props.href, N(d, "href"), d = $r("" + d), n.push(d), n.push(v), u = a;
          else {
            n.push(u);
            var b = d.props["data-precedence"], E = d.props, F = Ve("" + d.props.href);
            F = $r(F), n.push(F), N(b, "precedence"), b = "" + b, n.push(s), b = $r(b), n.push(b);
            for (var D in E)
              if (mn.call(E, D) && (b = E[D], b != null))
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
            n.push(v), u = a, d.state = B;
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
      ), n.scriptResources[u] = I, n.moduleScriptResources[u] = I, n = [], ke(n, d), r.bootstrapScripts.add(n);
    }
    function bl(n, r) {
      n.crossOrigin == null && (n.crossOrigin = r[0]), n.integrity == null && (n.integrity = r[1]);
    }
    function R(n, r, u) {
      n = L(n), r = Ee(r, "as"), r = "<" + n + '>; rel=preload; as="' + r + '"';
      for (var d in u)
        mn.call(u, d) && (n = u[d], typeof n == "string" && (r += "; " + d.toLowerCase() + '="' + Ee(
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
        Oe
      );
    }
    function Oe(n) {
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
        Rt(b),
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
          var D = E[b], te, H = void 0, j = void 0, de = {
            rel: "preload",
            as: "script",
            fetchPriority: "low",
            nonce: void 0
          };
          typeof D == "string" ? de.href = te = D : (de.href = te = D.src, de.integrity = j = typeof D.integrity == "string" ? D.integrity : void 0, de.crossOrigin = H = typeof D == "string" || D.crossOrigin == null ? void 0 : D.crossOrigin === "use-credentials" ? "use-credentials" : ""), Ql(n, u, te, de), d.push(
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
    function gt(n) {
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
        case El:
          return "SuspenseList";
        case ni:
          return "Activity";
      }
      if (typeof n == "object")
        switch (typeof n.tag == "number" && console.error(
          "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
        ), n.$$typeof) {
          case Lt:
            return "Portal";
          case Tl:
            return n.displayName || "Context";
          case Jc:
            return (n._context.displayName || "Context") + ".Consumer";
          case xl:
            var r = n.render;
            return n = n.displayName, n || (n = r.displayName || r.name || "", n = n !== "" ? "ForwardRef(" + n + ")" : "ForwardRef"), n;
          case Gn:
            return r = n.displayName || null, r !== null ? r : gt(n.type) || "Memo";
          case Rl:
            r = n._payload, n = n._init;
            try {
              return gt(n(r));
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
    function ca(n) {
      n.context._currentValue2 = n.parentValue, n = n.parent, n !== null && ca(n);
    }
    function La(n) {
      var r = n.parent;
      r !== null && La(r), n.context._currentValue2 = n.value;
    }
    function sr(n, r) {
      if (n.context._currentValue2 = n.parentValue, n = n.parent, n === null)
        throw Error(
          "The depth must equal at least at zero before reaching the root. This is a bug in React."
        );
      n.depth === r.depth ? hi(n, r) : sr(n, r);
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
      r !== n && (r === null ? La(n) : n === null ? ca(r) : r.depth === n.depth ? hi(r, n) : r.depth > n.depth ? sr(r, n) : tl(r, n), Qe = n);
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
    function wl(n, r) {
      n = (n = n.constructor) && gt(n) || "ReactClass";
      var u = n + "." + r;
      bn[u] || (console.error(
        `Can only update a mounting component. This usually means you called %s() outside componentWillMount() on the server. This is a no-op.

Please check the code for the %s component.`,
        r,
        n
      ), bn[u] = !0);
    }
    function Rn(n, r, u) {
      var d = n.id;
      n = n.overflow;
      var b = 32 - Ll(d) - 1;
      d &= ~(1 << b), u += 1;
      var E = 32 - Ll(r) + b;
      if (30 < E) {
        var F = b - b % 5;
        return E = (d & (1 << F) - 1).toString(32), d >>= F, b -= F, {
          id: 1 << 32 - Ll(r) + b | u << b | d,
          overflow: E + n
        };
      }
      return {
        id: 1 << E | u << b | d,
        overflow: n
      };
    }
    function ns(n) {
      return n >>>= 0, n === 0 ? 32 : 31 - (Or(n) / ii | 0) | 0;
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
          throw io = r, Mr;
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
    function Bn() {
      if (0 < hu)
        throw Error("Rendered more hooks than during the previous render");
      return { memoizedState: null, queue: null, next: null };
    }
    function Cn() {
      return ot === null ? Gu === null ? (Xo = !1, Gu = ot = Bn()) : (Xo = !0, ot = Gu) : ot.next === null ? (Xo = !1, ot = ot.next = Bn()) : (Xo = !0, ot = ot.next), ot;
    }
    function Vl() {
      var n = Zo;
      return Zo = null, n;
    }
    function fr() {
      Ci = !1, ao = Ir = Go = Jr = null, ai = !1, Gu = null, hu = 0, ot = Aa = null;
    }
    function _a(n) {
      return Ci && console.error(
        "Context can only be read while React is rendering. In classes, you can read it in the render method or getDerivedStateFromProps. In function components, you can read it directly in the function body, but not inside Hooks like useReducer() or useMemo()."
      ), n._currentValue2;
    }
    function Wc(n, r) {
      return typeof r == "function" ? r(n) : r;
    }
    function Rr(n, r, u) {
      if (n !== Wc && (co = "useReducer"), Jr = di(), ot = Cn(), Xo) {
        if (u = ot.queue, r = u.dispatch, Aa !== null) {
          var d = Aa.get(u);
          if (d !== void 0) {
            Aa.delete(u), u = ot.memoizedState;
            do {
              var b = d.action;
              Ci = !0, u = n(u, b), Ci = !1, d = d.next;
            } while (d !== null);
            return ot.memoizedState = u, [u, r];
          }
        }
        return [ot.memoizedState, r];
      }
      return Ci = !0, n = n === Wc ? typeof r == "function" ? r() : r : u !== void 0 ? u(r) : r, Ci = !1, ot.memoizedState = n, n = ot.queue = { last: null, dispatch: null }, n = n.dispatch = Su.bind(
        null,
        Jr,
        n
      ), [ot.memoizedState, n];
    }
    function ts(n, r) {
      if (Jr = di(), ot = Cn(), r = r === void 0 ? null : r, ot !== null) {
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
                if (!Yo(r[b], d[b])) {
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
    function Su(n, r, u) {
      if (25 <= hu)
        throw Error(
          "Too many re-renders. React limits the number of renders to prevent an infinite loop."
        );
      if (n === Jr)
        if (ai = !0, n = { action: u, next: null }, Aa === null && (Aa = /* @__PURE__ */ new Map()), u = Aa.get(r), u === void 0)
          Aa.set(r, n);
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
    function Ro(n, r, u) {
      di();
      var d = oo++, b = Ir;
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
        return n = function(de) {
          H(de);
        }, typeof H.$$FORM_ACTION == "function" && (n.$$FORM_ACTION = function(de) {
          de = H.$$FORM_ACTION(de), u !== void 0 && (N(u, "target"), u += "", de.action = u);
          var Ce = de.data;
          return Ce && (E === null && (E = u !== void 0 ? "p" + u : "k" + Re(
            JSON.stringify([
              F,
              null,
              d
            ]),
            0
          )), Ce.append("$ACTION_KEY", E)), de;
        }), [r, n, !1];
      }
      var j = n.bind(null, r);
      return [
        r,
        function(de) {
          j(de);
        },
        !1
      ];
    }
    function pl(n) {
      var r = fu;
      return fu += 1, Zo === null && (Zo = []), ic(Zo, n, r);
    }
    function Ba() {
      throw Error("Cache cannot be refreshed during server rendering.");
    }
    function rs() {
    }
    function ls() {
      if (kl === 0) {
        Pa = console.log, qi = console.info, du = console.warn, gu = console.error, vu = console.group, so = console.groupCollapsed, vs = console.groupEnd;
        var n = {
          configurable: !0,
          enumerable: !0,
          value: rs,
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
    function Co() {
      if (kl--, kl === 0) {
        var n = { configurable: !0, enumerable: !0, writable: !0 };
        Object.defineProperties(console, {
          log: it({}, n, { value: Pa }),
          info: it({}, n, { value: qi }),
          warn: it({}, n, { value: du }),
          error: it({}, n, { value: gu }),
          group: it({}, n, { value: vu }),
          groupCollapsed: it({}, n, { value: so }),
          groupEnd: it({}, n, { value: vs })
        });
      }
      0 > kl && console.error(
        "disabledDepth fell below zero. This is a bug in React. Please file an issue."
      );
    }
    function mo(n) {
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
          Xu = r && r[1] || "", Qo = -1 < u.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < u.stack.indexOf("@") ? "@unknown:0:0" : "";
        }
      return `
` + Xu + n + Qo;
    }
    function vi(n, r) {
      if (!n || ys) return "";
      var u = yu.get(n);
      if (u !== void 0) return u;
      ys = !0, u = Error.prepareStackTrace, Error.prepareStackTrace = void 0;
      var d = null;
      d = vt.H, vt.H = null, ls();
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
                    var de = `
` + H[E].replace(
                      " at new ",
                      " at "
                    );
                    return n.displayName && de.includes("<anonymous>") && (de = de.replace("<anonymous>", n.displayName)), typeof n == "function" && yu.set(n, de), de;
                  }
                while (1 <= E && 0 <= F);
              break;
            }
        }
      } finally {
        ys = !1, vt.H = d, Co(), Error.prepareStackTrace = u;
      }
      return H = (H = n ? n.displayName || n.name : "") ? gi(H) : "", typeof n == "function" && yu.set(n, H), H;
    }
    function Xc(n) {
      if (typeof n == "string") return gi(n);
      if (typeof n == "function")
        return n.prototype && n.prototype.isReactComponent ? vi(n, !0) : vi(n, !1);
      if (typeof n == "object" && n !== null) {
        switch (n.$$typeof) {
          case xl:
            return vi(n.render, !1);
          case Gn:
            return vi(n.type, !1);
          case Rl:
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
              n = mo(n);
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
        case El:
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
      var de = /* @__PURE__ */ new Set();
      this.destination = null, this.flushScheduled = !1, this.resumableState = n, this.renderState = r, this.rootFormatContext = u, this.progressiveChunkSize = d === void 0 ? 12800 : d, this.status = 10, this.fatalError = null, this.pendingRootTasks = this.allPendingTasks = this.nextSegmentId = 0, this.completedPreambleSegments = this.completedRootSegment = null, this.byteSize = 0, this.abortableTasks = de, this.pingedTasks = [], this.clientRenderedBoundaries = [], this.completedBoundaries = [], this.partialBoundaries = [], this.trackedPostpones = null, this.onError = b === void 0 ? uc : b, this.onPostpone = H === void 0 ? dn : H, this.onAllReady = E === void 0 ? dn : E, this.onShellReady = F === void 0 ? dn : F, this.onShellError = D === void 0 ? dn : D, this.onFatalError = te === void 0 ? dn : te, this.formState = j === void 0 ? null : j, this.didWarnForKey = null;
    }
    function So(n, r, u, d, b, E, F, D, te, H, j, de) {
      var Ce = bs();
      return 1e3 < Ce - Ds && (vt.recentlyCreatedOwnerStacks = 0, Ds = Ce), r = new Zt(
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
        de
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
    function yi(n, r, u, d, b, E, F, D, te, H, j, de, Ce, be, ae, fn, Jn) {
      n.allPendingTasks++, b === null ? n.pendingRootTasks++ : b.pendingTasks++, be !== null && be.pendingTasks++;
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
        context: de,
        treeContext: Ce,
        row: be,
        componentStack: ae,
        thenableState: r
      };
      return Ye.debugTask = Jn, te.add(Ye), Ye;
    }
    function fc(n, r, u, d, b, E, F, D, te, H, j, de, Ce, be, ae, fn) {
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
        treeContext: de,
        row: Ce,
        componentStack: be,
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
      if (_l === null || _l.componentStack === null)
        return "";
      var n = _l.componentStack;
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
          u = null, n.debugStack != null ? u = mo(
            n.debugStack
          ) : (E = n, E.stack != null && (u = typeof E.stack != "string" ? E.stack = mo(
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
    function ku(n, r) {
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
          case Rl:
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
    function ua(n) {
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
      n.errorDigest = r, u instanceof Error ? (r = String(u.message), u = String(u.stack)) : (r = typeof u == "object" && u !== null ? On(u) : String(u), u = null), b = b ? `Switched to client rendering because the server rendering aborted due to:

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
    function jt(n, r, u, d) {
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
        var de = r.replay.slots;
        if (de !== null && typeof de == "object")
          for (var Ce = 0; Ce < u; Ce++) {
            var be = b !== "backwards" && b !== "unstable_legacy-backwards" ? Ce : u - 1 - Ce, ae = d[be];
            r.row = j = jl(
              j
            ), r.treeContext = Rn(F, u, be);
            var fn = de[be];
            typeof fn == "number" ? (_i(n, r, fn, ae, be), delete de[be]) : Nt(n, r, ae, be), --j.pendingTasks === 0 && jn(n, j);
          }
        else
          for (de = 0; de < u; de++)
            Ce = b !== "backwards" && b !== "unstable_legacy-backwards" ? de : u - 1 - de, be = d[Ce], Dt(n, r, be), r.row = j = jl(j), r.treeContext = Rn(F, u, Ce), Nt(n, r, be, Ce), --j.pendingTasks === 0 && jn(n, j);
      } else if (b !== "backwards" && b !== "unstable_legacy-backwards")
        for (b = 0; b < u; b++)
          de = d[b], Dt(n, r, de), r.row = j = jl(j), r.treeContext = Rn(
            F,
            u,
            b
          ), Nt(n, r, de, b), --j.pendingTasks === 0 && jn(n, j);
      else {
        for (b = r.blockedSegment, de = b.children.length, Ce = b.chunks.length, be = u - 1; 0 <= be; be--) {
          ae = d[be], r.row = j = jl(
            j
          ), r.treeContext = Rn(F, u, be), fn = Ur(
            n,
            Ce,
            null,
            r.formatContext,
            be === 0 ? b.lastPushedText : !0,
            !0
          ), b.children.splice(de, 0, fn), r.blockedSegment = fn, Dt(n, r, ae);
          try {
            Nt(n, r, ae, be), nl(
              fn.chunks,
              n.renderState,
              fn.lastPushedText,
              fn.textEmbedded
            ), fn.status = Dr, --j.pendingTasks === 0 && jn(n, j);
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
      for (r.thenableState = null, Jr = {}, Go = r, Ir = n, ao = u, Ci = !1, oo = uu = 0, su = -1, fu = 0, Zo = F, n = Zu(d, b, E); ai; )
        ai = !1, oo = uu = 0, su = -1, fu = 0, hu += 1, ot = null, n = d(b, E);
      return fr(), n;
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
      E = r.keyPath, r.keyPath = u, b ? (u = r.treeContext, r.treeContext = Rn(u, 1, 0), Nt(n, r, d, -1), r.treeContext = u) : D ? Nt(n, r, d, -1) : $e(n, r, d, -1), r.keyPath = E;
    }
    function Ao(n, r, u, d, b, E) {
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
          var j = F, de = pe, Ce = d.contextType;
          if ("contextType" in d && Ce !== null && (Ce === void 0 || Ce.$$typeof !== Tl) && !Qr.has(d)) {
            Qr.add(d);
            var be = Ce === void 0 ? " However, it is set to undefined. This can be caused by a typo or by mixing up named and default imports. This can also happen due to a circular dependency, so try moving the createContext() call to a separate file." : typeof Ce != "object" ? " However, it is set to a " + typeof Ce + "." : Ce.$$typeof === Jc ? " Did you accidentally pass the Context.Consumer instead?" : " However, it is set to an object with keys {" + Object.keys(Ce).join(", ") + "}.";
            console.error(
              "%s defines an invalid contextType. contextType should point to the Context object returned by React.createContext().%s",
              gt(d) || "Component",
              be
            );
          }
          typeof Ce == "object" && Ce !== null && (de = Ce._currentValue2);
          var ae = new d(j, de);
          if (typeof d.getDerivedStateFromProps == "function" && (ae.state === null || ae.state === void 0)) {
            var fn = gt(d) || "Component";
            $n.has(fn) || ($n.add(fn), console.error(
              "`%s` uses `getDerivedStateFromProps` but its initial state is %s. This is not recommended. Instead, define the initial state by assigning an object to `this.state` in the constructor of `%s`. This ensures that `getDerivedStateFromProps` arguments have a consistent shape.",
              fn,
              ae.state === null ? "null" : "undefined",
              fn
            ));
          }
          if (typeof d.getDerivedStateFromProps == "function" || typeof ae.getSnapshotBeforeUpdate == "function") {
            var Jn = null, Ye = null, Pn = null;
            if (typeof ae.componentWillMount == "function" && ae.componentWillMount.__suppressDeprecationWarning !== !0 ? Jn = "componentWillMount" : typeof ae.UNSAFE_componentWillMount == "function" && (Jn = "UNSAFE_componentWillMount"), typeof ae.componentWillReceiveProps == "function" && ae.componentWillReceiveProps.__suppressDeprecationWarning !== !0 ? Ye = "componentWillReceiveProps" : typeof ae.UNSAFE_componentWillReceiveProps == "function" && (Ye = "UNSAFE_componentWillReceiveProps"), typeof ae.componentWillUpdate == "function" && ae.componentWillUpdate.__suppressDeprecationWarning !== !0 ? Pn = "componentWillUpdate" : typeof ae.UNSAFE_componentWillUpdate == "function" && (Pn = "UNSAFE_componentWillUpdate"), Jn !== null || Ye !== null || Pn !== null) {
              var yr = gt(d) || "Component", br = typeof d.getDerivedStateFromProps == "function" ? "getDerivedStateFromProps()" : "getSnapshotBeforeUpdate()";
              ll.has(yr) || (ll.add(
                yr
              ), console.error(
                `Unsafe legacy lifecycles will not be called for components using new component APIs.

%s uses %s but also contains the following legacy lifecycles:%s%s%s

The above lifecycles should be removed. Learn more about this warning here:
https://react.dev/link/unsafe-component-lifecycles`,
                yr,
                br,
                Jn !== null ? `
  ` + Jn : "",
                Ye !== null ? `
  ` + Ye : "",
                Pn !== null ? `
  ` + Pn : ""
              ));
            }
          }
          var In = gt(d) || "Component";
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
          ), d.childContextTypes && !It.has(d) && (It.add(d), console.error(
            "%s uses the legacy childContextTypes API which was removed in React 19. Use React.createContext() instead. (https://react.dev/link/legacy-context)",
            In
          )), d.contextTypes && !Fr.has(d) && (Fr.add(d), console.error(
            "%s uses the legacy contextTypes API which was removed in React 19. Use React.createContext() with static contextType instead. (https://react.dev/link/legacy-context)",
            In
          )), typeof ae.componentShouldUpdate == "function" && console.error(
            "%s has a method called componentShouldUpdate(). Did you mean shouldComponentUpdate()? The name is phrased as a question because the function is expected to return a value.",
            In
          ), d.prototype && d.prototype.isPureReactComponent && typeof ae.shouldComponentUpdate < "u" && console.error(
            "%s has a method called shouldComponentUpdate(). shouldComponentUpdate should not be used when extending React.PureComponent. Please extend React.Component if shouldComponentUpdate is used.",
            gt(d) || "A pure component"
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
          var er = ae.props !== j;
          ae.props !== void 0 && er && console.error(
            "When calling super() in `%s`, make sure to pass up the same props that your component's constructor was passed.",
            In
          ), ae.defaultProps && console.error(
            "Setting defaultProps as an instance property on %s is not supported and will be ignored. Instead, define defaultProps as a static property on %s.",
            In,
            In
          ), typeof ae.getSnapshotBeforeUpdate != "function" || typeof ae.componentDidUpdate == "function" || vr.has(d) || (vr.add(d), console.error(
            "%s: getSnapshotBeforeUpdate() should be used with componentDidUpdate(). This component defines getSnapshotBeforeUpdate() only.",
            gt(d)
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
          var Si = ae.state;
          Si && (typeof Si != "object" || Yi(Si)) && console.error("%s.state: must be set to an object or null", In), typeof ae.getChildContext == "function" && typeof d.childContextTypes != "object" && console.error(
            "%s.getChildContext(): childContextTypes must be defined in order to use getChildContext().",
            In
          );
          var Vr = ae.state !== void 0 ? ae.state : null;
          ae.updater = pt, ae.props = j, ae.state = Vr;
          var Me = { queue: [], replace: !1 };
          ae._reactInternals = Me;
          var Hn = d.contextType;
          if (ae.context = typeof Hn == "object" && Hn !== null ? Hn._currentValue2 : pe, ae.state === j) {
            var Un = gt(d) || "Component";
            Nl.has(
              Un
            ) || (Nl.add(
              Un
            ), console.error(
              "%s: It is not recommended to assign props directly to state because updates to props won't be reflected in state. In most cases, it is better to use props directly.",
              Un
            ));
          }
          var Xn = d.getDerivedStateFromProps;
          if (typeof Xn == "function") {
            var Tt = Xn(
              j,
              Vr
            );
            if (Tt === void 0) {
              var pn = gt(d) || "Component";
              Je.has(pn) || (Je.add(pn), console.error(
                "%s.getDerivedStateFromProps(): A valid state object (or null) must be returned. You have returned undefined.",
                pn
              ));
            }
            var tn = Tt == null ? Vr : it({}, Vr, Tt);
            ae.state = tn;
          }
          if (typeof d.getDerivedStateFromProps != "function" && typeof ae.getSnapshotBeforeUpdate != "function" && (typeof ae.UNSAFE_componentWillMount == "function" || typeof ae.componentWillMount == "function")) {
            var Nr = ae.state;
            if (typeof ae.componentWillMount == "function") {
              if (ae.componentWillMount.__suppressDeprecationWarning !== !0) {
                var Wn = gt(d) || "Unknown";
                wt[Wn] || (console.warn(
                  `componentWillMount has been renamed, and is not recommended for use. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move code from componentWillMount to componentDidMount (preferred in most cases) or the constructor.

Please update the following components: %s`,
                  Wn
                ), wt[Wn] = !0);
              }
              ae.componentWillMount();
            }
            if (typeof ae.UNSAFE_componentWillMount == "function" && ae.UNSAFE_componentWillMount(), Nr !== ae.state && (console.error(
              "%s.componentWillMount(): Assigning directly to this.state is deprecated (except inside a component's constructor). Use setState instead.",
              gt(d) || "Component"
            ), pt.enqueueReplaceState(
              ae,
              ae.state,
              null
            )), Me.queue !== null && 0 < Me.queue.length) {
              var wr = Me.queue, ct = Me.replace;
              if (Me.queue = null, Me.replace = !1, ct && wr.length === 1)
                ae.state = wr[0];
              else {
                for (var al = ct ? wr[0] : ae.state, Ko = !0, ol = ct ? 1 : 0; ol < wr.length; ol++) {
                  var ki = wr[ol], Ai = typeof ki == "function" ? ki.call(
                    ae,
                    al,
                    j,
                    void 0
                  ) : ki;
                  Ai != null && (Ko ? (Ko = !1, al = it(
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
            gt(d) || "a component"
          ), fo = !0);
          var cr = r.keyPath;
          r.keyPath = u, $e(n, r, Pi, -1), r.keyPath = cr;
        } else {
          if (d.prototype && typeof d.prototype.render == "function") {
            var e = gt(d) || "Unknown";
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
            var x = gt(d) || "Unknown";
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
            var k = gt(d) || "Unknown";
            Vo[k] || (console.error(
              "%s: Function components do not support getDerivedStateFromProps.",
              k
            ), Vo[k] = !0);
          }
          if (typeof d.contextType == "object" && d.contextType !== null) {
            var M = gt(d) || "Unknown";
            ws[M] || (console.error(
              "%s: Function components do not support contextType.",
              M
            ), ws[M] = !0);
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
          var _ = b.children, U = r.formatContext, oe = r.keyPath;
          r.formatContext = si(U, d, b), r.keyPath = u, Nt(n, r, _, -1), r.formatContext = U, r.keyPath = oe;
        } else {
          var se = Tn(
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
              Ue.status = 6, Nt(n, r, se, -1), nl(
                Ue.chunks,
                n.renderState,
                Ue.lastPushedText,
                Ue.textEmbedded
              ), Ue.status = Dr;
            } finally {
              r.blockedSegment = V;
            }
          } else Nt(n, r, se, -1);
          r.formatContext = ce, r.keyPath = le;
          e: {
            var Zn = V.chunks, Be = n.resumableState;
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
                  Be.hasBody = !0;
                  break e;
                }
                break;
              case "html":
                if (ce.insertionMode === on) {
                  Be.hasHtml = !0;
                  break e;
                }
                break;
              case "head":
                if (ce.insertionMode <= Ze) break e;
            }
            Zn.push(kt(d));
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
                var Ht = r.keyPath;
                r.keyPath = u, Nt(n, r, b.children, -1), r.keyPath = Ht;
              }
            } else if (b.mode !== "hidden") {
              n.renderState.generateStaticMarkup || Pt.chunks.push("<!--&-->"), Pt.lastPushedText = !1;
              var Fn = r.keyPath;
              r.keyPath = u, Nt(n, r, b.children, -1), r.keyPath = Fn, n.renderState.generateStaticMarkup || Pt.chunks.push("<!--/&-->"), Pt.lastPushedText = !1;
            }
            return;
          case El:
            e: {
              var Le = b.children, Ut = b.revealOrder;
              if (Ut === "forwards" || Ut === "backwards" || Ut === "unstable_legacy-backwards") {
                if (Yi(Le)) {
                  Pu(
                    n,
                    r,
                    u,
                    Le,
                    Ut
                  );
                  break e;
                }
                var Lr = W(Le);
                if (Lr) {
                  var Qn = Lr.call(Le);
                  if (Qn) {
                    Po(
                      r,
                      Le,
                      -1,
                      Qn,
                      Lr
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
                        Ut
                      );
                    }
                    break e;
                  }
                }
              }
              if (Ut === "together") {
                var pr = r.keyPath, nr = r.row, st = r.row = jl(null);
                st.boundaries = [], st.together = !0, r.keyPath = u, $e(n, r, Le, -1), --st.pendingTasks === 0 && jn(n, st), r.keyPath = pr, r.row = nr, nr !== null && 0 < st.pendingTasks && (nr.pendingTasks++, st.next = nr);
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
              var ul = r.keyPath, Al = r.formatContext, tr = r.row;
              r.keyPath = u, r.formatContext = nt(
                n.resumableState,
                Al
              ), r.row = null;
              var xt = b.children;
              try {
                Nt(n, r, xt, -1);
              } finally {
                r.keyPath = ul, r.formatContext = Al, r.row = tr;
              }
            } else {
              var _r = r.keyPath, sl = r.formatContext, Br = r.row, na = r.blockedBoundary, fl = r.blockedPreamble, Wt = r.hoistableState, zl = r.blockedSegment, ur = b.fallback, Qu = b.children, Fi = /* @__PURE__ */ new Set(), Ft = Zc(
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
                var Nc = r.componentStack, jo = [
                  u[0],
                  "Suspense Fallback",
                  u[2]
                ], ci = [
                  jo[1],
                  jo[2],
                  [],
                  null
                ];
                n.trackedPostpones.workingMap.set(
                  jo,
                  ci
                ), Ft.trackedFallbackNode = ci, r.blockedSegment = Hl, r.blockedPreamble = Ft.fallbackPreamble, r.keyPath = jo, r.formatContext = qr(
                  n.resumableState,
                  sl
                ), r.componentStack = dc(
                  Nc
                ), Hl.status = 6;
                try {
                  Nt(n, r, ur, -1), nl(
                    Hl.chunks,
                    n.renderState,
                    Hl.lastPushedText,
                    Hl.textEmbedded
                  ), Hl.status = Dr;
                } catch (pu) {
                  throw Hl.status = n.status === 12 ? Bl : Nn, pu;
                } finally {
                  r.blockedSegment = zl, r.blockedPreamble = fl, r.keyPath = _r, r.formatContext = sl;
                }
                var qo = yi(
                  n,
                  null,
                  Qu,
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
                  Nc,
                  pe,
                  r.debugTask
                );
                Wr(qo), n.pingedTasks.push(qo);
              } else {
                r.blockedBoundary = Ft, r.blockedPreamble = Ft.contentPreamble, r.hoistableState = Ft.contentState, r.blockedSegment = zr, r.keyPath = u, r.formatContext = nt(
                  n.resumableState,
                  sl
                ), r.row = null, zr.status = 6;
                try {
                  if (Nt(n, r, Qu, -1), nl(
                    zr.chunks,
                    n.renderState,
                    zr.lastPushedText,
                    zr.textEmbedded
                  ), zr.status = Dr, Wa(Ft, zr), Ft.pendingTasks === 0 && Ft.status === $i) {
                    if (Ft.status = Dr, !cc(n, Ft)) {
                      Br !== null && --Br.pendingTasks === 0 && jn(n, Br), n.pendingRootTasks === 0 && r.blockedPreamble && Fo(n);
                      break e;
                    }
                  } else
                    Br !== null && Br.together && Ni(n, Br);
                } catch (pu) {
                  if (Ft.status = or, n.status === 12) {
                    zr.status = Bl;
                    var hl = n.fatalError;
                  } else
                    zr.status = Nn, hl = pu;
                  var Lc = ua(r.componentStack), Ju = Yr(
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
                  r.blockedBoundary = na, r.blockedPreamble = fl, r.hoistableState = Wt, r.blockedSegment = zl, r.keyPath = _r, r.formatContext = sl, r.row = Br;
                }
                var Ul = yi(
                  n,
                  null,
                  ur,
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
                  pe,
                  r.debugTask
                );
                Wr(Ul), n.pingedTasks.push(Ul);
              }
            }
            return;
        }
        if (typeof d == "object" && d !== null)
          switch (d.$$typeof) {
            case xl:
              if ("ref" in b) {
                var _c = {};
                for (var Hr in b)
                  Hr !== "ref" && (_c[Hr] = b[Hr]);
              } else _c = b;
              var $o = Li(
                n,
                r,
                u,
                d.render,
                _c,
                E
              );
              bi(
                n,
                r,
                u,
                $o,
                uu !== 0,
                oo,
                su
              );
              return;
            case Gn:
              Ao(n, r, u, d.type, b, E);
              return;
            case Tl:
              var go = b.value, Oa = b.children, Wl = r.context, Yl = r.keyPath, Oi = d._currentValue2;
              d._currentValue2 = go, d._currentRenderer2 !== void 0 && d._currentRenderer2 !== null && d._currentRenderer2 !== yn && console.error(
                "Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported."
              ), d._currentRenderer2 = yn;
              var dl = Qe, Tr = {
                parent: dl,
                depth: dl === null ? 0 : dl.depth + 1,
                context: d,
                parentValue: Oi,
                value: go
              };
              Qe = Tr, r.context = Tr, r.keyPath = u, $e(n, r, Oa, -1);
              var Ma = Qe;
              if (Ma === null)
                throw Error(
                  "Tried to pop a Context at the root of the app. This is a bug in React."
                );
              Ma.context !== d && console.error(
                "The parent context is not the expected context. This is probably a bug in React."
              ), Ma.context._currentValue2 = Ma.parentValue, d._currentRenderer2 !== void 0 && d._currentRenderer2 !== null && d._currentRenderer2 !== yn && console.error(
                "Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported."
              ), d._currentRenderer2 = yn;
              var Mi = Qe = Ma.parent;
              r.context = Mi, r.keyPath = Yl, Wl !== r.context && console.error(
                "Popping the context provider did not return back to the original snapshot. This is a bug in React."
              );
              return;
            case Jc:
              var vo = d._context, ta = b.children;
              typeof ta != "function" && console.error(
                "A context consumer was rendered with multiple children, or a child that isn't a function. A context consumer expects a single child that is a function. If you did pass a function, make sure there is no trailing or leading whitespace around it."
              );
              var ps = ta(vo._currentValue2), Kr = r.keyPath;
              r.keyPath = u, $e(n, r, ps, -1), r.keyPath = Kr;
              return;
            case Rl:
              var ui = Is(d);
              if (n.status === 12) throw null;
              Ao(n, r, u, ui, b, E);
              return;
          }
        var Bc = "";
        throw (d === void 0 || typeof d == "object" && d !== null && Object.keys(d).length === 0) && (Bc += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports."), Error(
          "Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: " + ((d == null ? d : typeof d) + "." + Bc)
        );
      }
    }
    function _i(n, r, u, d, b) {
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
        r.replay = null, r.blockedSegment = D, Nt(n, r, d, b), D.status = Dr, F === null ? n.completedRootSegment = D : (Wa(F, D), F.parentFlushed && n.partialBoundaries.push(F));
      } finally {
        r.replay = E, r.blockedSegment = null;
      }
    }
    function Bi(n, r, u, d, b, E, F, D, te, H) {
      E = H.nodes;
      for (var j = 0; j < E.length; j++) {
        var de = E[j];
        if (b === de[1]) {
          if (de.length === 4) {
            if (d !== null && d !== de[0])
              throw Error(
                "Expected the resume to render <" + de[0] + "> in this slot but instead it rendered <" + d + ">. The tree doesn't match so React will fallback to client rendering."
              );
            var Ce = de[2];
            d = de[3], b = r.node, r.replay = { nodes: Ce, slots: d, pendingTasks: 1 };
            try {
              if (Ao(n, r, u, F, D, te), r.replay.pendingTasks === 1 && 0 < r.replay.nodes.length)
                throw Error(
                  "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                );
              r.replay.pendingTasks--;
            } catch (er) {
              if (typeof er == "object" && er !== null && (er === Mr || typeof er.then == "function"))
                throw r.node === b ? r.replay = H : E.splice(j, 1), er;
              r.replay.pendingTasks--, F = ua(r.componentStack), D = n, n = r.blockedBoundary, u = er, te = d, d = Yr(D, u, F, r.debugTask), Ui(
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
                "Expected the resume to render <Suspense> in this slot but instead it rendered <" + (gt(F) || "Unknown") + ">. The tree doesn't match so React will fallback to client rendering."
              );
            e: {
              H = void 0, d = de[5], F = de[2], te = de[3], b = de[4] === null ? [] : de[4][2], de = de[4] === null ? null : de[4][3];
              var be = r.keyPath, ae = r.formatContext, fn = r.row, Jn = r.replay, Ye = r.blockedBoundary, Pn = r.hoistableState, yr = D.children, br = D.fallback, In = /* @__PURE__ */ new Set();
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
                if (Nt(n, r, yr, -1), r.replay.pendingTasks === 1 && 0 < r.replay.nodes.length)
                  throw Error(
                    "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                  );
                if (r.replay.pendingTasks--, D.pendingTasks === 0 && D.status === $i) {
                  D.status = Dr, n.completedBoundaries.push(D);
                  break e;
                }
              } catch (er) {
                D.status = or, Ce = ua(r.componentStack), H = Yr(
                  n,
                  er,
                  Ce,
                  r.debugTask
                ), ko(D, H, er, Ce, !1), r.replay.pendingTasks--, n.clientRenderedBoundaries.push(D);
              } finally {
                r.blockedBoundary = Ye, r.hoistableState = Pn, r.replay = Jn, r.keyPath = be, r.formatContext = ae, r.row = fn;
              }
              D = fc(
                n,
                null,
                { nodes: b, slots: de, pendingTasks: 0 },
                br,
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
    function Po(n, r, u, d, b) {
      d === r ? (u !== -1 || n.componentStack === null || typeof n.componentStack.type != "function" || Object.prototype.toString.call(n.componentStack.type) !== "[object GeneratorFunction]" || Object.prototype.toString.call(d) !== "[object Generator]") && (Ic || console.error(
        "Using Iterators as children is unsupported and will likely yield unexpected results because enumerating a generator mutates it. You may convert it to an array with `Array.from()` or the `[...spread]` operator before rendering. You can also use an Iterable that can iterate multiple times over the same items."
      ), Ic = !0) : r.entries !== b || oi || (console.error(
        "Using Maps as children is not supported. Use an array of keyed ReactElements instead."
      ), oi = !0);
    }
    function $e(n, r, u, d) {
      r.replay !== null && typeof r.replay.slots == "number" ? _i(n, r, r.replay.slots, u, d) : (r.node = u, r.childIndex = d, u = r.componentStack, d = r.debugTask, Wr(r), ql(n, r), r.componentStack = u, r.debugTask = d);
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
              var D = r.debugTask, te = gt(b);
              E = E ?? (d === -1 ? 0 : d);
              var H = [r.keyPath, te, E];
              r.replay !== null ? D ? D.run(
                Bi.bind(
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
              ) : Bi(
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
                Ao.bind(
                  null,
                  n,
                  r,
                  H,
                  b,
                  u,
                  F
                )
              ) : Ao(n, r, H, b, u, F);
              return;
            case Lt:
              throw Error(
                "Portals are not currently supported by the server renderer. Render them conditionally so that they only appear on the client render."
              );
            case Rl:
              if (b = Is(u), n.status === 12) throw null;
              $e(n, r, b, d);
              return;
          }
          if (Yi(u)) {
            wi(n, r, u, d);
            return;
          }
          if ((E = W(u)) && (b = E.call(u))) {
            if (Po(r, u, d, b, E), u = b.next(), !u.done) {
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
              pl(u),
              d
            );
          if (u.$$typeof === Tl)
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
    function Dt(n, r, u) {
      if (u !== null && typeof u == "object" && (u.$$typeof === Ya || u.$$typeof === Lt) && u._store && (!u._store.validated && u.key == null || u._store.validated === 2)) {
        if (typeof u._store != "object")
          throw Error(
            "React Component in warnForMissingKey should have a _store. This error is likely caused by a bug in React. Please file an issue."
          );
        u._store.validated = 1;
        var d = n.didWarnForKey;
        if (d == null && (d = n.didWarnForKey = /* @__PURE__ */ new WeakSet()), n = r.componentStack, n !== null && !d.has(n)) {
          d.add(n);
          var b = gt(u.type);
          d = u._owner;
          var E = n.owner;
          if (n = "", E && typeof E.type < "u") {
            var F = gt(E.type);
            F && (n = `

Check the render method of \`` + F + "`.");
          }
          n || b && (n = `

Check the top-level render call using <` + b + ">."), b = "", d != null && E !== d && (E = null, typeof d.type < "u" ? E = gt(d.type) : typeof d.name == "string" && (E = d.name), E && (b = " It was passed a child from " + E + ".")), d = r.componentStack, r.componentStack = {
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
              if (typeof ae == "object" && ae !== null && (ae === Mr || typeof ae.then == "function"))
                throw ae;
              r.replay.pendingTasks--;
              var de = ua(r.componentStack);
              u = r.blockedBoundary;
              var Ce = ae, be = j;
              j = Yr(
                n,
                Ce,
                de,
                r.debugTask
              ), Ui(
                n,
                u,
                d,
                be,
                Ce,
                j,
                de,
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
          j = u[d], r.treeContext = Rn(
            D,
            te,
            d
          ), Ce = H[d], typeof Ce == "number" ? (_i(n, r, Ce, j, d), delete H[d]) : Nt(n, r, j, d);
        r.treeContext = D, r.keyPath = b, r.componentStack = E, r.debugTask = F;
        return;
      }
      for (H = 0; H < te; H++)
        d = u[H], Dt(n, r, d), r.treeContext = Rn(D, te, H), Nt(n, r, d, H);
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
    function sa(n, r, u, d) {
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
    function Nt(n, r, u, d) {
      var b = r.formatContext, E = r.context, F = r.keyPath, D = r.treeContext, te = r.componentStack, H = r.debugTask, j = r.blockedSegment;
      if (j === null) {
        j = r.replay;
        try {
          return $e(n, r, u, d);
        } catch (be) {
          if (fr(), u = be === Mr ? ac() : be, n.status !== 12 && typeof u == "object" && u !== null) {
            if (typeof u.then == "function") {
              d = be === Mr ? Vl() : null, n = pi(
                n,
                r,
                d
              ).ping, u.then(n, n), r.formatContext = b, r.context = E, r.keyPath = F, r.treeContext = D, r.componentStack = te, r.replay = j, r.debugTask = H, Yn(E);
              return;
            }
            if (u.message === "Maximum call stack size exceeded") {
              u = be === Mr ? Vl() : null, u = pi(n, r, u), n.pingedTasks.push(u), r.formatContext = b, r.context = E, r.keyPath = F, r.treeContext = D, r.componentStack = te, r.replay = j, r.debugTask = H, Yn(E);
              return;
            }
          }
        }
      } else {
        var de = j.children.length, Ce = j.chunks.length;
        try {
          return $e(n, r, u, d);
        } catch (be) {
          if (fr(), j.children.length = de, j.chunks.length = Ce, u = be === Mr ? ac() : be, n.status !== 12 && typeof u == "object" && u !== null) {
            if (typeof u.then == "function") {
              j = u, u = be === Mr ? Vl() : null, n = zi(n, r, u).ping, j.then(n, n), r.formatContext = b, r.context = E, r.keyPath = F, r.treeContext = D, r.componentStack = te, r.debugTask = H, Yn(E);
              return;
            }
            if (u.message === "Maximum call stack size exceeded") {
              j = be === Mr ? Vl() : null, j = zi(n, r, j), n.pingedTasks.push(j), r.formatContext = b, r.context = E, r.keyPath = F, r.treeContext = D, r.componentStack = te, r.debugTask = H, Yn(E);
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
          var de = b, Ce = E, be = F, ae = D, fn = Zc(
            j,
            null,
            /* @__PURE__ */ new Set(),
            null,
            null
          );
          fn.parentFlushed = !0, fn.rootSegmentID = H, fn.status = or, ko(
            fn,
            Ce,
            de,
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
        if (r.status !== or && (r.status = or, ko(
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
      var E = ua(n.componentStack), F = n.node;
      if (F !== null && typeof F == "object" && ku(n, F._debugInfo), d === null) {
        if (r.status !== 13 && r.status !== ea) {
          if (d = n.replay, d === null) {
            r.trackedPostpones !== null && b !== null ? (d = r.trackedPostpones, Yr(r, u, E, n.debugTask), sa(r, d, n, b), $l(r, null, n.row, b)) : (Yr(r, u, E, n.debugTask), jt(r, u, E, n.debugTask));
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
        if (F = r.trackedPostpones, d.status !== or) {
          if (F !== null && b !== null)
            return Yr(r, u, E, n.debugTask), sa(r, F, n, b), d.fallbackAbortableTasks.forEach(function(D) {
              return Ha(D, r, u);
            }), d.fallbackAbortableTasks.clear(), $l(r, d, n.row, b);
          d.status = or, b = Yr(
            r,
            u,
            E,
            n.debugTask
          ), d.status = or, ko(d, b, u, E, !0), za(r, d), d.parentFlushed && r.clientRenderedBoundaries.push(d);
        }
        d.pendingTasks--, E = d.row, E !== null && --E.pendingTasks === 0 && jn(r, E), d.fallbackAbortableTasks.forEach(function(D) {
          return Ha(D, r, u);
        }), d.fallbackAbortableTasks.clear();
      }
      n = n.row, n !== null && --n.pendingTasks === 0 && jn(r, n), r.allPendingTasks--, r.allPendingTasks === 0 && Gr(r);
    }
    function fa(n, r) {
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
                  var j = H.value, de = j.props, Ce = de.href, be = j.props, ae = R(
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
                  if (0 <= (b.remainingCapacity -= ae.length + 2))
                    u.resets.style[Ce] = G, E && (E += ", "), E += ae, u.resets.style[Ce] = typeof de.crossOrigin == "string" || typeof de.integrity == "string" ? [de.crossOrigin, de.integrity] : G;
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
      n.trackedPostpones === null && fa(n, !0), n.trackedPostpones === null && Fo(n), n.onShellError = dn, n = n.onShellReady, n();
    }
    function Gr(n) {
      fa(
        n,
        n.trackedPostpones === null ? !0 : n.completedRootSegment === null || n.completedRootSegment.status !== il
      ), Fo(n), n = n.onAllReady, n();
    }
    function Wa(n, r) {
      if (r.chunks.length === 0 && r.children.length === 1 && r.children[0].boundary === null && r.children[0].id === -1) {
        var u = r.children[0];
        u.id = r.id, u.parentFlushed = !0, u.status !== Dr && u.status !== Bl && u.status !== Nn || Wa(n, u);
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
      } else if (r.pendingTasks--, r.status !== or)
        if (r.pendingTasks === 0) {
          if (r.status === $i && (r.status = Dr), d !== null && d.parentFlushed && (d.status === Dr || d.status === Bl) && Wa(r, d), r.parentFlushed && n.completedBoundaries.push(r), r.status === Dr)
            u = r.row, u !== null && an(u.hoistables, r.contentState), cc(n, r) || (r.fallbackAbortableTasks.forEach(
              Hi,
              n
            ), r.fallbackAbortableTasks.clear(), u !== null && --u.pendingTasks === 0 && jn(n, u)), n.pendingRootTasks === 0 && n.trackedPostpones === null && r.contentPreamble !== null && Fo(n);
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
          d === null || !d.parentFlushed || d.status !== Dr && d.status !== Bl || (Wa(r, d), r.completedSegments.length === 1 && r.parentFlushed && n.partialBoundaries.push(r)), r = r.row, r !== null && r.together && Ni(n, r);
      n.allPendingTasks === 0 && Gr(n);
    }
    function Fu(n) {
      if (n.status !== ea && n.status !== 13) {
        var r = Qe, u = vt.H;
        vt.H = uo;
        var d = vt.A;
        vt.A = gs;
        var b = zt;
        zt = n;
        var E = vt.getCurrentStack;
        vt.getCurrentStack = Kl;
        var F = ds;
        ds = n.resumableState;
        try {
          var D = n.pingedTasks, te;
          for (te = 0; te < D.length; te++) {
            var H = n, j = D[te], de = j.blockedSegment;
            if (de === null) {
              var Ce = void 0, be = H;
              if (H = j, H.replay.pendingTasks !== 0) {
                Yn(H.context), Ce = _l, _l = H;
                try {
                  if (typeof H.replay.slots == "number" ? _i(
                    be,
                    H,
                    H.replay.slots,
                    H.node,
                    H.childIndex
                  ) : ql(be, H), H.replay.pendingTasks === 1 && 0 < H.replay.nodes.length)
                    throw Error(
                      "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                    );
                  H.replay.pendingTasks--, H.abortSet.delete(H), $l(
                    be,
                    H.blockedBoundary,
                    H.row,
                    null
                  );
                } catch (ct) {
                  fr();
                  var ae = ct === Mr ? ac() : ct;
                  if (typeof ae == "object" && ae !== null && typeof ae.then == "function") {
                    var fn = H.ping;
                    ae.then(fn, fn), H.thenableState = ct === Mr ? Vl() : null;
                  } else {
                    H.replay.pendingTasks--, H.abortSet.delete(H);
                    var Jn = ua(H.componentStack), Ye = void 0, Pn = be, yr = H.blockedBoundary, br = be.status === 12 ? be.fatalError : ae, In = Jn, er = H.replay.nodes, Si = H.replay.slots;
                    Ye = Yr(
                      Pn,
                      br,
                      In,
                      H.debugTask
                    ), Ui(
                      Pn,
                      yr,
                      er,
                      Si,
                      br,
                      Ye,
                      In,
                      !1
                    ), be.pendingRootTasks--, be.pendingRootTasks === 0 && Ua(be), be.allPendingTasks--, be.allPendingTasks === 0 && Gr(be);
                  }
                } finally {
                  _l = Ce;
                }
              }
            } else if (be = Ce = void 0, Ye = j, Pn = de, Pn.status === $i) {
              Pn.status = 6, Yn(Ye.context), be = _l, _l = Ye;
              var Vr = Pn.children.length, Me = Pn.chunks.length;
              try {
                ql(H, Ye), nl(
                  Pn.chunks,
                  H.renderState,
                  Pn.lastPushedText,
                  Pn.textEmbedded
                ), Ye.abortSet.delete(Ye), Pn.status = Dr, $l(
                  H,
                  Ye.blockedBoundary,
                  Ye.row,
                  Pn
                );
              } catch (ct) {
                fr(), Pn.children.length = Vr, Pn.chunks.length = Me;
                var Hn = ct === Mr ? ac() : H.status === 12 ? H.fatalError : ct;
                if (H.status === 12 && H.trackedPostpones !== null) {
                  var Un = H.trackedPostpones, Xn = ua(Ye.componentStack);
                  Ye.abortSet.delete(Ye), Yr(
                    H,
                    Hn,
                    Xn,
                    Ye.debugTask
                  ), sa(
                    H,
                    Un,
                    Ye,
                    Pn
                  ), $l(
                    H,
                    Ye.blockedBoundary,
                    Ye.row,
                    Pn
                  );
                } else if (typeof Hn == "object" && Hn !== null && typeof Hn.then == "function") {
                  Pn.status = $i, Ye.thenableState = ct === Mr ? Vl() : null;
                  var Tt = Ye.ping;
                  Hn.then(Tt, Tt);
                } else {
                  var pn = ua(
                    Ye.componentStack
                  );
                  Ye.abortSet.delete(Ye), Pn.status = Nn;
                  var tn = Ye.blockedBoundary, Nr = Ye.row, Wn = Ye.debugTask;
                  if (Nr !== null && --Nr.pendingTasks === 0 && jn(H, Nr), H.allPendingTasks--, Ce = Yr(
                    H,
                    Hn,
                    pn,
                    Wn
                  ), tn === null)
                    jt(
                      H,
                      Hn,
                      pn,
                      Wn
                    );
                  else if (tn.pendingTasks--, tn.status !== or) {
                    tn.status = or, ko(
                      tn,
                      Ce,
                      Hn,
                      pn,
                      !1
                    ), za(H, tn);
                    var wr = tn.row;
                    wr !== null && --wr.pendingTasks === 0 && jn(H, wr), tn.parentFlushed && H.clientRenderedBoundaries.push(tn), H.pendingRootTasks === 0 && H.trackedPostpones === null && tn.contentPreamble !== null && Fo(H);
                  }
                  H.allPendingTasks === 0 && Gr(H);
                }
              } finally {
                _l = be;
              }
            }
          }
          D.splice(0, te), n.destination !== null && gc(
            n,
            n.destination
          );
        } catch (ct) {
          D = {}, Yr(n, ct, D, null), jt(n, ct, D, null);
        } finally {
          ds = F, vt.H = u, vt.A = d, vt.getCurrentStack = E, u === uo && Yn(r), zt = b;
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
        case Dr:
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
        case or:
          if (r.status === Dr)
            return Gt(n.renderState, E), Ou(
              n,
              r,
              u
            );
        default:
          return !0;
      }
    }
    function Fo(n) {
      if (n.completedRootSegment && n.completedPreambleSegments === null) {
        var r = [], u = n.byteSize, d = Mu(
          n,
          n.completedRootSegment,
          r
        ), b = n.renderState.preamble;
        d === !1 || b.headChunks && b.bodyChunks ? n.completedPreambleSegments = r : n.byteSize = u;
      }
    }
    function Oo(n, r, u, d) {
      switch (u.parentFlushed = !0, u.status) {
        case $i:
          u.id = n.nextSegmentId++;
        case il:
          return d = u.id, u.lastPushedText = !1, u.textEmbedded = !1, n = n.renderState, r.push(Ji), r.push(n.placeholderPrefix), n = d.toString(16), r.push(n), r.push(Rc);
        case Dr:
          u.status = Fa;
          var b = !0, E = u.chunks, F = 0;
          u = u.children;
          for (var D = 0; D < u.length; D++) {
            for (b = u[D]; F < b.index; F++)
              r.push(E[F]);
            b = Mo(n, r, b, d);
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
    function Mo(n, r, u, d) {
      var b = u.boundary;
      if (b === null)
        return Oo(n, r, u, d);
      if (b.parentFlushed = !0, b.status === or) {
        var E = b.row;
        if (E !== null && --E.pendingTasks === 0 && jn(n, E), !n.renderState.generateStaticMarkup) {
          var F = b.errorDigest, D = b.errorMessage;
          E = b.errorStack, b = b.errorComponentStack, r.push(Cc), r.push(_o), F && (r.push(Mt), F = Ie(F), r.push(F), r.push(
            ja
          )), D && (r.push(ml), D = Ie(D), r.push(D), r.push(
            ja
          )), E && (r.push(un), E = Ie(E), r.push(E), r.push(
            ja
          )), b && (r.push(Ki), E = Ie(b), r.push(E), r.push(
            ja
          )), r.push(Bo);
        }
        return Oo(n, r, u, d), n = n.renderState.generateStaticMarkup ? !0 : r.push(xa), n;
      }
      if (b.status !== Dr)
        return b.status === $i && (b.rootSegmentID = n.nextSegmentId++), 0 < b.completedSegments.length && n.partialBoundaries.push(b), Xt(
          r,
          n.renderState,
          b.rootSegmentID
        ), d && an(d, b.fallbackState), Oo(n, r, u, d), r.push(xa);
      if (!Dc && cc(n, b) && ho + b.byteSize > n.progressiveChunkSize)
        return b.rootSegmentID = n.nextSegmentId++, n.completedBoundaries.push(b), Xt(
          r,
          n.renderState,
          b.rootSegmentID
        ), Oo(n, r, u, d), r.push(xa);
      if (ho += b.byteSize, d && an(d, b.contentState), u = b.row, u !== null && cc(n, b) && --u.pendingTasks === 0 && jn(n, u), n.renderState.generateStaticMarkup || r.push(Vi), u = b.completedSegments, u.length !== 1)
        throw Error(
          "A previously unvisited boundary must have exactly one root segment. This is a bug in React."
        );
      return Mo(n, r, u[0], d), n = n.renderState.generateStaticMarkup ? !0 : r.push(xa), n;
    }
    function qt(n, r, u, d) {
      return De(
        r,
        n.renderState,
        u.parentFormatContext,
        u.id
      ), Mo(n, r, u, d), Er(r, u.parentFormatContext);
    }
    function is(n, r, u) {
      ho = u.byteSize;
      for (var d = u.completedSegments, b = 0; b < d.length; b++)
        ha(
          n,
          r,
          u,
          d[b]
        );
      d.length = 0, d = u.row, d !== null && cc(n, u) && --d.pendingTasks === 0 && jn(n, d), lr(
        r,
        u.contentState,
        n.renderState
      ), d = n.resumableState, n = n.renderState, b = u.rootSegmentID, u = u.contentState;
      var E = n.stylesToHoist;
      return n.stylesToHoist = !1, r.push(n.startInlineScript), r.push(sn), E ? ((d.instructions & p) === o && (d.instructions |= p, r.push(Ca)), (d.instructions & g) === o && (d.instructions |= g, r.push(Bt)), (d.instructions & m) === o ? (d.instructions |= m, r.push(Ac)) : r.push(Pc)) : ((d.instructions & g) === o && (d.instructions |= g, r.push(Bt)), r.push(iu)), d = b.toString(16), r.push(n.boundaryPrefix), r.push(d), r.push(au), r.push(n.segmentPrefix), r.push(d), E ? (r.push(Wu), oa(r, u)) : r.push(ou), u = r.push(cu), Xl(r, n) && u;
    }
    function ha(n, r, u, d) {
      if (d.status === Fa) return !0;
      var b = u.contentState, E = d.id;
      if (E === -1) {
        if ((d.id = u.rootSegmentID) === -1)
          throw Error(
            "A root segment ID must have been assigned by now. This is a bug in React."
          );
        return qt(
          n,
          r,
          d,
          b
        );
      }
      return E === u.rootSegmentID ? qt(
        n,
        r,
        d,
        b
      ) : (qt(n, r, d, b), u = n.resumableState, n = n.renderState, r.push(n.startInlineScript), r.push(sn), (u.instructions & f) === o ? (u.instructions |= f, r.push(zu)) : r.push(lu), r.push(n.segmentPrefix), E = E.toString(16), r.push(E), r.push(Hu), r.push(n.placeholderPrefix), r.push(E), r = r.push(Uu), r);
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
                var de = St("head");
                r.push(de), r.push(sn);
              }
            } else if (H)
              for (j = 0; j < H.length; j++)
                r.push(H[j]);
            var Ce = F.charsetChunks;
            for (j = 0; j < Ce.length; j++)
              r.push(Ce[j]);
            Ce.length = 0, F.preconnects.forEach(_n, r), F.preconnects.clear();
            var be = F.viewportChunks;
            for (j = 0; j < be.length; j++)
              r.push(be[j]);
            be.length = 0, F.fontPreloads.forEach(_n, r), F.fontPreloads.clear(), F.highImagePreloads.forEach(_n, r), F.highImagePreloads.clear(), re = F, F.styles.forEach(dt, r), re = null;
            var ae = F.importMapChunks;
            for (j = 0; j < ae.length; j++)
              r.push(ae[j]);
            ae.length = 0, F.bootstrapScripts.forEach(_n, r), F.scripts.forEach(_n, r), F.scripts.clear(), F.bulkPreloads.forEach(_n, r), F.bulkPreloads.clear(), E.instructions |= A;
            var fn = F.hoistableChunks;
            for (j = 0; j < fn.length; j++)
              r.push(fn[j]);
            for (E = fn.length = 0; E < b.length; E++) {
              var Jn = b[E];
              for (F = 0; F < Jn.length; F++)
                Mo(n, r, Jn[F], null);
            }
            var Ye = n.renderState.preamble, Pn = Ye.headChunks;
            if (Ye.htmlChunks || Pn) {
              var yr = kt("head");
              r.push(yr);
            }
            var br = Ye.bodyChunks;
            if (br)
              for (b = 0; b < br.length; b++)
                r.push(br[b]);
            Mo(n, r, d, null), n.completedRootSegment = null;
            var In = n.renderState;
            if (n.allPendingTasks !== 0 || n.clientRenderedBoundaries.length !== 0 || n.completedBoundaries.length !== 0 || n.trackedPostpones !== null && (n.trackedPostpones.rootNodes.length !== 0 || n.trackedPostpones.rootSlots !== null)) {
              var er = n.resumableState;
              if ((er.instructions & Q) === o) {
                if (er.instructions |= Q, r.push(In.startInlineScript), (er.instructions & A) === o) {
                  er.instructions |= A;
                  var Si = "_" + er.idPrefix + "R_";
                  r.push(Wo);
                  var Vr = Ie(Si);
                  r.push(Vr), r.push(qe);
                }
                r.push(sn), r.push(Cl), r.push($);
              }
            }
            Xl(r, In);
          }
          var Me = n.renderState;
          d = 0;
          var Hn = Me.viewportChunks;
          for (d = 0; d < Hn.length; d++)
            r.push(Hn[d]);
          Hn.length = 0, Me.preconnects.forEach(_n, r), Me.preconnects.clear(), Me.fontPreloads.forEach(_n, r), Me.fontPreloads.clear(), Me.highImagePreloads.forEach(
            _n,
            r
          ), Me.highImagePreloads.clear(), Me.styles.forEach(Eo, r), Me.scripts.forEach(_n, r), Me.scripts.clear(), Me.bulkPreloads.forEach(_n, r), Me.bulkPreloads.clear();
          var Un = Me.hoistableChunks;
          for (d = 0; d < Un.length; d++)
            r.push(Un[d]);
          Un.length = 0;
          var Xn = n.clientRenderedBoundaries;
          for (u = 0; u < Xn.length; u++) {
            var Tt = Xn[u];
            Me = r;
            var pn = n.resumableState, tn = n.renderState, Nr = Tt.rootSegmentID, Wn = Tt.errorDigest, wr = Tt.errorMessage, ct = Tt.errorStack, al = Tt.errorComponentStack;
            Me.push(tn.startInlineScript), Me.push(sn), (pn.instructions & p) === o ? (pn.instructions |= p, Me.push(Il)) : Me.push(us), Me.push(tn.boundaryPrefix);
            var Ko = Nr.toString(16);
            if (Me.push(Ko), Me.push(to), Wn || wr || ct || al) {
              Me.push(Fc);
              var ol = At(
                Wn || ""
              );
              Me.push(ol);
            }
            if (wr || ct || al) {
              Me.push(Fc);
              var ki = At(
                wr || ""
              );
              Me.push(ki);
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
            var cr = Me.push(
              ri
            );
            if (!cr) {
              n.destination = null, u++, Xn.splice(0, u);
              return;
            }
          }
          Xn.splice(0, u);
          var e = n.completedBoundaries;
          for (u = 0; u < e.length; u++)
            if (!is(
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
              Xn = n, Tt = r;
              var c = t[u];
              ho = c.byteSize;
              var h = c.completedSegments;
              for (cr = 0; cr < h.length; cr++)
                if (!ha(
                  Xn,
                  Tt,
                  c,
                  h[cr]
                )) {
                  cr++, h.splice(0, cr);
                  var y = !1;
                  break e;
                }
              h.splice(0, cr);
              var x = c.row;
              x !== null && x.together && c.pendingTasks === 1 && (x.pendingTasks === 1 ? Au(
                Xn,
                x,
                x.hoistables
              ) : x.pendingTasks--), y = lr(
                Tt,
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
          var k = n.completedBoundaries;
          for (u = 0; u < k.length; u++)
            if (!is(n, r, k[u])) {
              n.destination = null, u++, k.splice(0, u);
              return;
            }
          k.splice(0, u);
        }
      } finally {
        Dc = !1, n.allPendingTasks === 0 && n.clientRenderedBoundaries.length === 0 && n.completedBoundaries.length === 0 && (n.flushScheduled = !1, u = n.resumableState, u.hasBody && (t = kt("body"), r.push(t)), u.hasHtml && (u = kt("html"), r.push(u)), n.abortableTasks.size !== 0 && console.error(
          "There was still abortable task at the root when we closed. This is a bug in React."
        ), n.status = ea, r.push(null), n.destination = null);
      }
    }
    function Qc(n) {
      n.flushScheduled = n.destination !== null, Fu(n), n.status === 10 && (n.status = 11), n.trackedPostpones === null && fa(n, n.pendingRootTasks === 0);
    }
    function Wi(n) {
      if (n.flushScheduled === !1 && n.pingedTasks.length === 0 && n.destination !== null) {
        n.flushScheduled = !0;
        var r = n.destination;
        r ? gc(n, r) : n.flushScheduled = !1;
      }
    }
    function da(n, r) {
      if (n.status === 13)
        n.status = ea, r.destroy(n.fatalError);
      else if (n.status !== ea && n.destination === null) {
        n.destination = r;
        try {
          gc(n, r);
        } catch (u) {
          r = {}, Yr(n, u, r, null), jt(n, u, r, null);
        }
      }
    }
    function Io(n, r) {
      (n.status === 11 || n.status === 10) && (n.status = 12);
      try {
        var u = n.abortableTasks;
        if (0 < u.size) {
          var d = r === void 0 ? Error("The render was aborted by the server without a reason.") : typeof r == "object" && r !== null && typeof r.then == "function" ? Error("The render was aborted by the server with a promise.") : r;
          n.fatalError = d, u.forEach(function(b) {
            var E = _l, F = vt.getCurrentStack;
            _l = b, vt.getCurrentStack = Kl;
            try {
              Ha(b, n, d);
            } finally {
              _l = E, vt.getCurrentStack = F;
            }
          }), u.clear();
        }
        n.destination !== null && gc(n, n.destination);
      } catch (b) {
        r = {}, Yr(n, b, r, null), jt(n, b, r, null);
      }
    }
    function ei(n, r, u) {
      if (r === null) u.rootNodes.push(n);
      else {
        var d = u.workingMap, b = d.get(r);
        b === void 0 && (b = [r[1], r[2], [], null], d.set(r, b), ei(b, r[0], u)), b[2].push(n);
      }
    }
    function ga() {
    }
    function va(n, r, u, d) {
      var b = !1, E = null, F = "", D = !1;
      if (r = rn(
        r ? r.identifierPrefix : void 0
      ), n = So(
        n,
        r,
        We(r, u),
        Kn(on, null, 0, null),
        1 / 0,
        ga,
        void 0,
        function() {
          D = !0;
        },
        void 0,
        void 0,
        void 0
      ), Qc(n), Io(n, d), da(n, {
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
    var Iu = Ms(), Es = yf(), Ya = /* @__PURE__ */ Symbol.for("react.transitional.element"), Lt = /* @__PURE__ */ Symbol.for("react.portal"), Ti = /* @__PURE__ */ Symbol.for("react.fragment"), vc = /* @__PURE__ */ Symbol.for("react.strict_mode"), yc = /* @__PURE__ */ Symbol.for("react.profiler"), Jc = /* @__PURE__ */ Symbol.for("react.consumer"), Tl = /* @__PURE__ */ Symbol.for("react.context"), xl = /* @__PURE__ */ Symbol.for("react.forward_ref"), rl = /* @__PURE__ */ Symbol.for("react.suspense"), El = /* @__PURE__ */ Symbol.for("react.suspense_list"), Gn = /* @__PURE__ */ Symbol.for("react.memo"), Rl = /* @__PURE__ */ Symbol.for("react.lazy"), lt = /* @__PURE__ */ Symbol.for("react.scope"), ni = /* @__PURE__ */ Symbol.for("react.activity"), Vc = /* @__PURE__ */ Symbol.for("react.legacy_hidden"), Kc = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), jc = /* @__PURE__ */ Symbol.for("react.view_transition"), bc = Symbol.iterator, Yi = Array.isArray, wc = /* @__PURE__ */ new WeakMap(), pc = /* @__PURE__ */ new WeakMap(), Xr = /* @__PURE__ */ Symbol.for("react.client.reference"), it = Object.assign, mn = Object.prototype.hasOwnProperty, ya = RegExp(
      "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    ), Ga = {}, Xa = {}, ba = new Set(
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
    ]), ir = {
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
    }, ti = {}, as = RegExp(
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
    }, hr = {}, Gi = /^on./, os = /^on[^A-Z]/, Za = RegExp(
      "^(aria)-[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    ), qc = RegExp(
      "^(aria)[A-Z][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    ), Qa = /^(?:webkit|moz|o)[A-Z]/, dr = /^-ms-/, ar = /-(.)/g, wa = /;\s*$/, qn = {}, zn = {}, Ja = !1, Do = !1, $c = /["'&<>]/, No = /([A-Z])/g, Lu = /^ms-/, Cs = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i, vt = Iu.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Xi = Es.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, cs = Object.freeze({
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
              u.dnsResources[n] = I, u = d.headers;
              var b, E;
              (E = u && 0 < u.remainingCapacity) && (E = (b = "<" + L(n) + ">; rel=dns-prefetch", 0 <= (u.remainingCapacity -= b.length + 2))), E ? (d.resets.dns[n] = I, u.preconnects && (u.preconnects += ", "), u.preconnects += b) : (b = [], ke(b, { href: n, rel: "dns-prefetch" }), d.preconnects.add(b));
            }
            Wi(r);
          }
        } else i.D(n);
      },
      C: function(n, r) {
        var u = zt || null;
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
              D ? (b.resets.connect[E][n] = I, d.preconnects && (d.preconnects += ", "), d.preconnects += F) : (E = [], ke(E, {
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
        var d = zt || null;
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
                b && 0 < b.remainingCapacity && typeof F != "string" && te === "high" && (j = R(n, r, u), 0 <= (b.remainingCapacity -= j.length + 2)) ? (E.resets.image[H] = G, b.highImagePreloads && (b.highImagePreloads += ", "), b.highImagePreloads += j) : (b = [], ke(
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
                F = [], ke(
                  F,
                  it({ rel: "preload", href: n, as: r }, u)
                ), b.styleResources[n] = !u || typeof u.crossOrigin != "string" && typeof u.integrity != "string" ? G : [u.crossOrigin, u.integrity], E.preloads.stylesheets.set(n, F), E.bulkPreloads.add(F);
                break;
              case "script":
                if (b.scriptResources.hasOwnProperty(n)) return;
                F = [], E.preloads.scripts.set(n, F), E.bulkPreloads.add(F), ke(
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
                ), ke(b, n), r) === "font" ? E.fontPreloads.add(b) : E.bulkPreloads.add(b);
            }
            Wi(d);
          }
        } else i.L(n, r, u);
      },
      m: function(n, r) {
        var u = zt || null;
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
            ke(
              E,
              it({ rel: "modulepreload", href: n }, r)
            ), b.bulkPreloads.add(E), Wi(u);
          }
        } else i.m(n, r);
      },
      X: function(n, r) {
        var u = zt || null;
        if (u) {
          var d = u.resumableState, b = u.renderState;
          if (n) {
            var E = d.scriptResources.hasOwnProperty(
              n
            ) ? d.scriptResources[n] : void 0;
            E !== I && (d.scriptResources[n] = I, r = it({ src: n, async: !0 }, r), E && (E.length === 2 && bl(r, E), n = b.preloads.scripts.get(n)) && (n.length = 0), n = [], b.scripts.add(n), mt(n, r), Wi(u));
          }
        } else i.X(n, r);
      },
      S: function(n, r, u) {
        var d = zt || null;
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
            }, D && (D.length === 2 && bl(r.props, D), (E = E.preloads.stylesheets.get(n)) && 0 < E.length ? E.length = 0 : r.state = C), F.sheets.set(n, r), Wi(d));
          }
        } else i.S(n, r, u);
      },
      M: function(n, r) {
        var u = zt || null;
        if (u) {
          var d = u.resumableState, b = u.renderState;
          if (n) {
            var E = d.moduleScriptResources.hasOwnProperty(n) ? d.moduleScriptResources[n] : void 0;
            E !== I && (d.moduleScriptResources[n] = I, r = it(
              { src: n, type: "module", async: !0 },
              r
            ), E && (E.length === 2 && bl(r, E), n = b.preloads.moduleScripts.get(n)) && (n.length = 0), n = [], b.scripts.add(n), mt(n, r), Wi(u));
          }
        } else i.M(n, r);
      }
    };
    var o = 0, f = 1, g = 2, p = 4, m = 8, A = 32, Q = 64, I = null, G = [];
    Object.freeze(G);
    var re = null, $ = "<\/script>", ye = /(<\/|<)(s)(cript)/gi, Ne = {}, on = 0, Ze = 1, ze = 2, je = 3, Xe = 4, at = 5, cn = 6, wn = 7, Mn = 8, en = 9, yt = /* @__PURE__ */ new Map(), Sn = ' style="', Cr = ":", Dn = ";", xn = " ", kn = '="', qe = '"', An = '=""', $t = Ie(
      "javascript:throw new Error('React form unexpectedly submitted.')"
    ), sn = ">", pa = "/>", Zi = !1, mr = !1, Pl = !1, Fl = !1, Ol = !1, Ei = !1, Qi = !1, Jt = !1, Va = !1, Ka = !1, xc = !1, eu = `addEventListener("submit",function(a){if(!a.defaultPrevented){var c=a.target,d=a.submitter,e=c.action,b=d;if(d){var f=d.getAttribute("formAction");null!=f&&(e=f,b=null)}"javascript:throw new Error('React form unexpectedly submitted.')"===e&&(a.preventDefault(),b?(a=document.createElement("input"),a.name=b.name,a.value=b.value,b.parentNode.insertBefore(a,b),b=new FormData(c),a.parentNode.removeChild(a)):b=new FormData(c),a=c.ownerDocument||c,(a.$$reactFormReplay=a.$$reactFormReplay||[]).push(c,d,b))}});`, Lo = /(<\/|<)(s)(tyle)/gi, Ta = `
`, Sr = /^[a-zA-Z][a-zA-Z:_\.\-\d]*$/, Ec = /* @__PURE__ */ new Map(), kr = /* @__PURE__ */ new Map(), Cl = "requestAnimationFrame(function(){$RT=performance.now()});", Ji = '<template id="', Rc = '"></template>', Vi = "<!--$-->", nu = '<!--$?--><template id="', _t = '"></template>', Cc = "<!--$!-->", xa = "<!--/$-->", _o = "<template", ja = '"', Mt = ' data-dgst="', ml = ' data-msg="', un = ' data-stck="', Ki = ' data-cstck="', Bo = "></template>", Ea = '<div hidden id="', bt = '">', Zr = "</div>", Ra = '<svg aria-hidden="true" style="display:none" id="', qa = '">', Ml = "</svg>", gr = '<math aria-hidden="true" style="display:none" id="', zo = '">', Ar = "</math>", _u = '<table hidden id="', $a = '">', mc = "</table>", tu = '<table hidden><tbody id="', ru = '">', Ri = "</tbody></table>", eo = '<table hidden><tr id="', no = '">', Pr = "</tr></table>", Sc = '<table hidden><colgroup id="', kc = '">', Bu = "</colgroup></table>", zu = '$RS=function(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};$RS("', lu = '$RS("', Hu = '","', Uu = '")<\/script>', Bt = `$RB=[];$RV=function(a){$RT=performance.now();for(var b=0;b<a.length;b+=2){var c=a[b],e=a[b+1];null!==e.parentNode&&e.parentNode.removeChild(e);var f=c.parentNode;if(f){var g=c.previousSibling,h=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d||"/&"===d)if(0===h)break;else h--;else"$"!==d&&"$?"!==d&&"$~"!==d&&"$!"!==d&&"&"!==d||h++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;e.firstChild;)f.insertBefore(e.firstChild,c);g.data="$";g._reactRetry&&requestAnimationFrame(g._reactRetry)}}a.length=0};
$RC=function(a,b){if(b=document.getElementById(b))(a=document.getElementById(a))?(a.previousSibling.data="$~",$RB.push(a,b),2===$RB.length&&("number"!==typeof $RT?requestAnimationFrame($RV.bind(null,$RB)):(a=performance.now(),setTimeout($RV.bind(null,$RB),2300>a&&2E3<a?2300-a:$RT+300-a)))):b.parentNode.removeChild(b)};`, iu = '$RC("', Ac = `$RM=new Map;$RR=function(n,w,p){function u(q){this._p=null;q()}for(var r=new Map,t=document,h,b,e=t.querySelectorAll("link[data-precedence],style[data-precedence]"),v=[],k=0;b=e[k++];)"not all"===b.getAttribute("media")?v.push(b):("LINK"===b.tagName&&$RM.set(b.getAttribute("href"),b),r.set(b.dataset.precedence,h=b));e=0;b=[];var l,a;for(k=!0;;){if(k){var f=p[e++];if(!f){k=!1;e=0;continue}var c=!1,m=0;var d=f[m++];if(a=$RM.get(d)){var g=a._p;c=!0}else{a=t.createElement("link");a.href=d;a.rel=
"stylesheet";for(a.dataset.precedence=l=f[m++];g=f[m++];)a.setAttribute(g,f[m++]);g=a._p=new Promise(function(q,x){a.onload=u.bind(a,q);a.onerror=u.bind(a,x)});$RM.set(d,a)}d=a.getAttribute("media");!g||d&&!matchMedia(d).matches||b.push(g);if(c)continue}else{a=v[e++];if(!a)break;l=a.getAttribute("data-precedence");a.removeAttribute("media")}c=r.get(l)||h;c===h&&(h=a);r.set(l,a);c?c.parentNode.insertBefore(a,c.nextSibling):(c=t.head,c.insertBefore(a,c.firstChild))}if(p=document.getElementById(n))p.previousSibling.data=
"$~";Promise.all(b).then($RC.bind(null,n,w),$RX.bind(null,n,"CSS failed to load"))};$RR("`, Pc = '$RR("', au = '","', Wu = '",', ou = '"', cu = ")<\/script>", Ca = '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};', Il = '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};;$RX("', us = '$RX("', to = '"', Fc = ",", ri = ")<\/script>", Ho = /[<\u2028\u2029]/g, ma = /[&><\u2028\u2029]/g, Oc = ' media="not all" data-precedence="', Sa = '" data-href="', ss = '">', fs = "</style>", li = !1, Uo = !0, Sl = [], ka = ' data-precedence="', ro = '" data-href="', Dl = " ", Yu = '">', hs = "</style>", Wo = ' id="', l = "[", a = ",[", s = ",", v = "]", w = 0, C = 1, S = 2, B = 3, O = /[<>\r\n]/g, z = /["';,\r\n]/g, Z = "", K = Function.prototype.bind, xe = /* @__PURE__ */ Symbol.for("react.client.reference"), pe = {};
    Object.freeze(pe);
    var yn = {}, Qe = null, bn = {}, wt = {}, $n = /* @__PURE__ */ new Set(), vr = /* @__PURE__ */ new Set(), ll = /* @__PURE__ */ new Set(), Nl = /* @__PURE__ */ new Set(), Je = /* @__PURE__ */ new Set(), Fr = /* @__PURE__ */ new Set(), It = /* @__PURE__ */ new Set(), Qr = /* @__PURE__ */ new Set(), ji = /* @__PURE__ */ new Set(), pt = {
      enqueueSetState: function(n, r, u) {
        var d = n._reactInternals;
        d.queue === null ? wl(n, "setState") : (d.queue.push(r), u != null && lc(u));
      },
      enqueueReplaceState: function(n, r, u) {
        n = n._reactInternals, n.replace = !0, n.queue = [r], u != null && lc(u);
      },
      enqueueForceUpdate: function(n, r) {
        n._reactInternals.queue === null ? wl(n, "forceUpdate") : r != null && lc(r);
      }
    }, lo = { id: 1, overflow: "" }, Ll = Math.clz32 ? Math.clz32 : ns, Or = Math.log, ii = Math.LN2, Mr = Error(
      "Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`."
    ), io = null, Yo = typeof Object.is == "function" ? Object.is : oc, Jr = null, Go = null, Ir = null, ao = null, Gu = null, ot = null, Xo = !1, ai = !1, uu = 0, oo = 0, su = -1, fu = 0, Zo = null, Aa = null, hu = 0, Ci = !1, co, uo = {
      readContext: _a,
      use: function(n) {
        if (n !== null && typeof n == "object") {
          if (typeof n.then == "function")
            return pl(n);
          if (n.$$typeof === Tl)
            return _a(n);
        }
        throw Error(
          "An unsupported type was passed to use(): " + String(n)
        );
      },
      useContext: function(n) {
        return co = "useContext", di(), n._currentValue2;
      },
      useMemo: ts,
      useReducer: Rr,
      useRef: function(n) {
        Jr = di(), ot = Cn();
        var r = ot.memoizedState;
        return r === null ? (n = { current: n }, Object.seal(n), ot.memoizedState = n) : r;
      },
      useState: function(n) {
        return co = "useState", Rr(Wc, n);
      },
      useInsertionEffect: dn,
      useLayoutEffect: dn,
      useCallback: function(n, r) {
        return ts(function() {
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
        var n = Go.treeContext, r = n.overflow;
        n = n.id, n = (n & ~(1 << 32 - Ll(n) - 1)).toString(32) + r;
        var u = ds;
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
      useActionState: Ro,
      useFormState: Ro,
      useHostTransitionStatus: function() {
        return di(), cs;
      },
      useMemoCache: function(n) {
        for (var r = Array(n), u = 0; u < n; u++)
          r[u] = Kc;
        return r;
      },
      useCacheRefresh: function() {
        return Ba;
      },
      useEffectEvent: function() {
        return Yc;
      }
    }, ds = null, _l = null, gs = {
      getCacheForType: function() {
        throw Error("Not implemented.");
      },
      cacheSignal: function() {
        throw Error("Not implemented.");
      },
      getOwner: function() {
        return _l === null ? null : _l.componentStack;
      }
    }, kl = 0, Pa, qi, du, gu, vu, so, vs;
    rs.__reactDisabledLog = !0;
    var Xu, Qo, ys = !1, yu = new (typeof WeakMap == "function" ? WeakMap : Map)(), ms = {
      react_stack_bottom_frame: function(n, r, u) {
        return n(r, u);
      }
    }, Zu = ms.react_stack_bottom_frame.bind(ms), Ss = {
      react_stack_bottom_frame: function(n) {
        return n.render();
      }
    }, bu = Ss.react_stack_bottom_frame.bind(Ss), Jo = {
      react_stack_bottom_frame: function(n) {
        var r = n._init;
        return r(n._payload);
      }
    }, Is = Jo.react_stack_bottom_frame.bind(Jo), Ds = 0;
    if (typeof performance == "object" && typeof performance.now == "function")
      var mi = performance, bs = function() {
        return mi.now();
      };
    else {
      var Ns = Date;
      bs = function() {
        return Ns.now();
      };
    }
    var or = 4, $i = 0, Dr = 1, Fa = 2, Bl = 3, Nn = 4, il = 5, ea = 14, zt = null, Mc = {}, wu = {}, ws = {}, Vo = {}, fo = !1, Ic = !1, oi = !1, ho = 0, Dc = !1;
    lf.renderToStaticMarkup = function(n, r) {
      return va(
        n,
        r,
        !0,
        'The server used "renderToStaticMarkup" which does not support Suspense. If you intended to have the server wait for the suspended component please switch to "renderToReadableStream" which supports Suspense on the server'
      );
    }, lf.renderToString = function(n, r) {
      return va(
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
    function ge(e, t, c, h) {
      return "" + t + (c === "s" ? "\\73 " : "\\53 ") + h;
    }
    function ue(e, t, c, h) {
      return "" + t + (c === "s" ? "\\u0073" : "\\u0053") + h;
    }
    function W(e) {
      return e === null || typeof e != "object" ? null : (e = Nu && e[Nu] || e["@@iterator"], typeof e == "function" ? e : null);
    }
    function Ae(e) {
      return e = Object.prototype.toString.call(e), e.slice(8, e.length - 1);
    }
    function ve(e) {
      var t = JSON.stringify(e);
      return '"' + e + '"' === t ? e : t;
    }
    function Se(e) {
      switch (typeof e) {
        case "string":
          return JSON.stringify(
            10 >= e.length ? e : e.slice(0, 10) + "..."
          );
        case "object":
          return xi(e) ? "[...]" : e !== null && e.$$typeof === Gi ? "client" : (e = Ae(e), e === "Object" ? "{...}" : e);
        case "function":
          return e.$$typeof === Gi ? "client" : (e = e.displayName || e.name) ? "function " + e : "function";
        default:
          return String(e);
      }
    }
    function nn(e) {
      if (typeof e == "string") return e;
      switch (e) {
        case ya:
          return "Suspense";
        case Ga:
          return "SuspenseList";
      }
      if (typeof e == "object")
        switch (e.$$typeof) {
          case mn:
            return nn(e.render);
          case Xa:
            return nn(e.type);
          case ba:
            var t = e._payload;
            e = e._init;
            try {
              return nn(e(t));
            } catch {
            }
        }
      return "";
    }
    function On(e, t) {
      var c = Ae(e);
      if (c !== "Object" && c !== "Array") return c;
      var h = -1, y = 0;
      if (xi(e))
        if (hr.has(e)) {
          var x = hr.get(e);
          c = "<" + nn(x) + ">";
          for (var k = 0; k < e.length; k++) {
            var M = e[k];
            M = typeof M == "string" ? M : typeof M == "object" && M !== null ? "{" + On(M) + "}" : "{" + Se(M) + "}", "" + k === t ? (h = c.length, y = M.length, c += M) : c = 15 > M.length && 40 > c.length + M.length ? c + M : c + "{...}";
          }
          c += "</" + nn(x) + ">";
        } else {
          for (c = "[", x = 0; x < e.length; x++)
            0 < x && (c += ", "), k = e[x], k = typeof k == "object" && k !== null ? On(k) : Se(k), "" + x === t ? (h = c.length, y = k.length, c += k) : c = 10 > k.length && 40 > c.length + k.length ? c + k : c + "...";
          c += "]";
        }
      else if (e.$$typeof === jc)
        c = "<" + nn(e.type) + "/>";
      else {
        if (e.$$typeof === Gi) return "client";
        if (Tc.has(e)) {
          for (c = Tc.get(e), c = "<" + (nn(c) || "..."), x = Object.keys(e), k = 0; k < x.length; k++) {
            c += " ", M = x[k], c += ve(M) + "=";
            var V = e[M], _ = M === t && typeof V == "object" && V !== null ? On(V) : Se(V);
            typeof V != "string" && (_ = "{" + _ + "}"), M === t ? (h = c.length, y = _.length, c += _) : c = 10 > _.length && 40 > c.length + _.length ? c + _ : c + "...";
          }
          c += ">";
        } else {
          for (c = "{", x = Object.keys(e), k = 0; k < x.length; k++)
            0 < k && (c += ", "), M = x[k], c += ve(M) + ": ", V = e[M], V = typeof V == "object" && V !== null ? On(V) : Se(V), M === t ? (h = c.length, y = V.length, c += V) : c = 10 > V.length && 40 > c.length + V.length ? c + V : c + "...";
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
      Za.push(e), os.port2.postMessage(null);
    }
    function He(e) {
      setTimeout(function() {
        throw e;
      });
    }
    function P(e, t) {
      if (t.byteLength !== 0)
        if (2048 < t.byteLength)
          0 < ar && (e.enqueue(
            new Uint8Array(dr.buffer, 0, ar)
          ), dr = new Uint8Array(2048), ar = 0), e.enqueue(t);
        else {
          var c = dr.length - ar;
          c < t.byteLength && (c === 0 ? e.enqueue(dr) : (dr.set(
            t.subarray(0, c),
            ar
          ), e.enqueue(dr), t = t.subarray(c)), dr = new Uint8Array(2048), ar = 0), dr.set(t, ar), ar += t.byteLength;
        }
    }
    function N(e, t) {
      return P(e, t), !0;
    }
    function Fe(e) {
      dr && 0 < ar && (e.enqueue(
        new Uint8Array(dr.buffer, 0, ar)
      ), dr = null, ar = 0);
    }
    function ee(e) {
      return wa.encode(e);
    }
    function X(e) {
      return e = wa.encode(e), 2048 < e.byteLength && console.error(
        "precomputed chunks must be smaller than the view size configured for this host. This is a bug in React."
      ), e;
    }
    function ht(e) {
      return e.byteLength;
    }
    function rr(e, t) {
      typeof e.error == "function" ? e.error(t) : e.close();
    }
    function Ot(e) {
      return typeof Symbol == "function" && Symbol.toStringTag && e[Symbol.toStringTag] || e.constructor.name || "Object";
    }
    function vl(e) {
      try {
        return Kt(e), !1;
      } catch {
        return !0;
      }
    }
    function Kt(e) {
      return "" + e;
    }
    function Vn(e, t) {
      if (vl(e))
        return console.error(
          "The provided `%s` attribute is an unsupported type %s. This value must be coerced to a string before using it here.",
          t,
          Ot(e)
        ), Kt(e);
    }
    function Ie(e, t) {
      if (vl(e))
        return console.error(
          "The provided `%s` CSS property is an unsupported type %s. This value must be coerced to a string before using it here.",
          t,
          Ot(e)
        ), Kt(e);
    }
    function Ve(e) {
      if (vl(e))
        return console.error(
          "The provided HTML markup uses a value of unsupported type %s. This value must be coerced to a string before using it here.",
          Ot(e)
        ), Kt(e);
    }
    function Rt(e) {
      return zn.call($c, e) ? !0 : zn.call(Do, e) ? !1 : Ja.test(e) ? $c[e] = !0 : (Do[e] = !0, console.error("Invalid attribute name: `%s`", e), !1);
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
        if (e = "aria-" + t.slice(4).toLowerCase(), e = vt.hasOwnProperty(e) ? e : null, e == null)
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
      if (cs.test(t)) {
        if (e = t.toLowerCase(), e = vt.hasOwnProperty(e) ? e : null, e == null) return Xi[t] = !0, !1;
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
    function Pe(e) {
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
    function xr(e, t, c, h, y, x) {
      c = typeof t == "string" ? t : t && t.script;
      var k = c === void 0 ? pa : X(
        '<script nonce="' + Pe(c) + '"'
      ), M = typeof t == "string" ? void 0 : t && t.style, V = M === void 0 ? Jt : X(
        '<style nonce="' + Pe(M) + '"'
      ), _ = e.idPrefix, U = [], oe = e.bootstrapScriptContent, se = e.bootstrapScripts, ce = e.bootstrapModules;
      if (oe !== void 0 && (U.push(k), an(U, e), U.push(
        bt,
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
        placeholderPrefix: X(_ + "P:"),
        segmentPrefix: X(_ + "S:"),
        boundaryPrefix: X(_ + "B:"),
        startInlineScript: k,
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
          x = se[h], V = M = void 0, _ = {
            rel: "preload",
            as: "script",
            fetchPriority: "low",
            nonce: t
          }, typeof x == "string" ? _.href = k = x : (_.href = k = x.src, _.integrity = V = typeof x.integrity == "string" ? x.integrity : void 0, _.crossOrigin = M = typeof x == "string" || x.crossOrigin == null ? void 0 : x.crossOrigin === "use-credentials" ? "use-credentials" : ""), gt(
            e,
            y,
            k,
            _
          ), U.push(
            mr,
            ee(Pe(k)),
            un
          ), c && U.push(
            Fl,
            ee(Pe(c)),
            un
          ), typeof V == "string" && U.push(
            Ol,
            ee(Pe(V)),
            un
          ), typeof M == "string" && U.push(
            Ei,
            ee(Pe(M)),
            un
          ), an(U, e), U.push(Qi);
      if (ce !== void 0)
        for (t = 0; t < ce.length; t++)
          se = ce[t], k = x = void 0, M = {
            rel: "modulepreload",
            fetchPriority: "low",
            nonce: c
          }, typeof se == "string" ? M.href = h = se : (M.href = h = se.src, M.integrity = k = typeof se.integrity == "string" ? se.integrity : void 0, M.crossOrigin = x = typeof se == "string" || se.crossOrigin == null ? void 0 : se.crossOrigin === "use-credentials" ? "use-credentials" : ""), gt(
            e,
            y,
            h,
            M
          ), U.push(
            Pl,
            ee(Pe(h)),
            un
          ), c && U.push(
            Fl,
            ee(Pe(c)),
            un
          ), typeof k == "string" && U.push(
            Ol,
            ee(Pe(k)),
            un
          ), typeof x == "string" && U.push(
            Ei,
            ee(Pe(x)),
            un
          ), an(U, e), U.push(Qi);
      return y;
    }
    function yl(e, t, c, h, y) {
      return {
        idPrefix: e === void 0 ? "" : e,
        nextFormID: 0,
        streamingFormat: 0,
        bootstrapScriptContent: c,
        bootstrapScripts: h,
        bootstrapModules: y,
        instructions: yt,
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
        e === "http://www.w3.org/2000/svg" ? kr : e === "http://www.w3.org/1998/Math/MathML" ? Cl : Lo,
        null,
        0,
        null
      );
    }
    function we(e, t, c) {
      var h = e.tagScope & -25;
      switch (t) {
        case "noscript":
          return T(Sr, null, h | 1, null);
        case "select":
          return T(
            Sr,
            c.value != null ? c.value : c.defaultValue,
            h,
            null
          );
        case "svg":
          return T(kr, null, h, null);
        case "picture":
          return T(Sr, null, h | 2, null);
        case "math":
          return T(Cl, null, h, null);
        case "foreignObject":
          return T(Sr, null, h, null);
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
          if (e.insertionMode < Sr)
            return T(
              Ec,
              null,
              h,
              null
            );
          break;
        case "html":
          if (e.insertionMode === Lo)
            return T(
              Ta,
              null,
              h,
              null
            );
      }
      return e.insertionMode >= Ji || e.insertionMode < Sr ? T(Sr, null, h, null) : e.tagScope !== h ? T(
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
    function _e(e, t) {
      e = Te(t.viewTransition);
      var c = t.tagScope | 16;
      return e !== null && e.share !== "none" && (c |= 64), T(
        t.insertionMode,
        t.selectedValue,
        c,
        e
      );
    }
    function ke(e, t, c, h) {
      return t === "" ? h : (h && e.push(_t), e.push(ee(Pe(t))), !0);
    }
    function Ct(e, t) {
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
              var x = ee(Pe(h));
              Ie(y, h), y = ee(
                Pe(("" + y).trim())
              );
            } else {
              x = h;
              var k = y;
              if (-1 < x.indexOf("-")) {
                var M = x;
                ye.hasOwnProperty(M) && ye[M] || (ye[M] = !0, console.error(
                  "Unsupported style property %s. Did you mean %s?",
                  M,
                  nt(M.replace(G, "ms-"))
                ));
              } else if (I.test(x))
                M = x, ye.hasOwnProperty(M) && ye[M] || (ye[M] = !0, console.error(
                  "Unsupported vendor-prefixed style property %s. Did you mean %s?",
                  M,
                  M.charAt(0).toUpperCase() + M.slice(1)
                ));
              else if ($.test(k)) {
                M = x;
                var V = k;
                Ne.hasOwnProperty(V) && Ne[V] || (Ne[V] = !0, console.error(
                  `Style property values shouldn't contain a semicolon. Try "%s: %s" instead.`,
                  M,
                  V.replace(
                    $,
                    ""
                  )
                ));
              }
              typeof k == "number" && (isNaN(k) ? on || (on = !0, console.error(
                "`NaN` is an invalid value for the `%s` css style property.",
                x
              )) : isFinite(k) || Ze || (Ze = !0, console.error(
                "`Infinity` is an invalid value for the `%s` css style property.",
                x
              ))), x = h, k = Cc.get(x), k !== void 0 || (k = X(
                Pe(
                  x.replace(je, "-$1").toLowerCase().replace(Xe, "-ms-")
                )
              ), Cc.set(x, k)), x = k, typeof y == "number" ? y = y === 0 || No.has(h) ? ee("" + y) : ee(y + "px") : (Ie(y, h), y = ee(
                Pe(("" + y).trim())
              ));
            }
            c ? (c = !1, e.push(
              xa,
              x,
              _o,
              y
            )) : e.push(ja, x, _o, y);
          }
        }
      c || e.push(un);
    }
    function En(e, t, c) {
      c && typeof c != "function" && typeof c != "symbol" && e.push(
        Mt,
        ee(t),
        Ki
      );
    }
    function tt(e, t, c) {
      typeof c != "function" && typeof c != "symbol" && typeof c != "boolean" && e.push(
        Mt,
        ee(t),
        ml,
        ee(Pe(c)),
        un
      );
    }
    function mt(e, t) {
      this.push(Ea), Da(e), tt(this, "name", t), tt(this, "value", e), this.push(Zr);
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
    function St(e, t, c, h, y, x, k, M) {
      var V = null;
      if (typeof h == "function") {
        M === null || mc || (mc = !0, console.error(
          'Cannot specify a "name" prop for a button that specifies a function as a formAction. React needs it to encode which action should be invoked. It will get overridden.'
        )), y === null && x === null || ru || (ru = !0, console.error(
          "Cannot specify a formEncType or formMethod for a button that specifies a function as a formAction. React provides those automatically. They will get overridden."
        )), k === null || tu || (tu = !0, console.error(
          "Cannot specify a formTarget for a button that specifies a function as a formAction. The function will always be executed in the same window."
        ));
        var _ = Ge(t, h);
        _ !== null ? (M = _.name, h = _.action || "", y = _.encType, x = _.method, k = _.target, V = _.data) : (e.push(
          Mt,
          ee("formAction"),
          ml,
          Bo,
          un
        ), k = x = y = h = M = null, Xt(t, c));
      }
      return M != null && Tn(e, "name", M), h != null && Tn(e, "formAction", h), y != null && Tn(e, "formEncType", y), x != null && Tn(e, "formMethod", x), k != null && Tn(e, "formTarget", k), V;
    }
    function Tn(e, t, c) {
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
          Ct(e, c);
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
            Mt,
            ee(t),
            ml,
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
          En(e, t.toLowerCase(), c);
          break;
        case "xlinkHref":
          if (typeof c == "function" || typeof c == "symbol" || typeof c == "boolean")
            break;
          Vn(c, t), c = J("" + c), e.push(
            Mt,
            ee("xlink:href"),
            ml,
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
            Mt,
            ee(t),
            ml,
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
            Mt,
            ee(t),
            Ki
          );
          break;
        case "capture":
        case "download":
          c === !0 ? e.push(
            Mt,
            ee(t),
            Ki
          ) : c !== !1 && typeof c != "function" && typeof c != "symbol" && e.push(
            Mt,
            ee(t),
            ml,
            ee(Pe(c)),
            un
          );
          break;
        case "cols":
        case "rows":
        case "size":
        case "span":
          typeof c != "function" && typeof c != "symbol" && !isNaN(c) && 1 <= c && e.push(
            Mt,
            ee(t),
            ml,
            ee(Pe(c)),
            un
          );
          break;
        case "rowSpan":
        case "start":
          typeof c == "function" || typeof c == "symbol" || isNaN(c) || e.push(
            Mt,
            ee(t),
            ml,
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
          if ((!(2 < t.length) || t[0] !== "o" && t[0] !== "O" || t[1] !== "n" && t[1] !== "N") && (t = Lu.get(t) || t, Rt(t))) {
            switch (typeof c) {
              case "function":
              case "symbol":
                return;
              case "boolean":
                var h = t.toLowerCase().slice(0, 5);
                if (h !== "data-" && h !== "aria-") return;
            }
            e.push(
              Mt,
              ee(t),
              ml,
              ee(Pe(c)),
              un
            );
          }
      }
    }
    function kt(e, t, c) {
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
        c != null && (t += c, zo || typeof c == "string" || typeof c == "number" || typeof c == "bigint" || (zo = !0, console.error(
          "Cannot infer the option value of complex children. Pass a `value` prop or use a plain string as children to <option>."
        )));
      }), t;
    }
    function Xt(e, t) {
      if ((e.instructions & 16) === yt) {
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
    function De(e, t) {
      e.push(_n("link"));
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
                Tn(e, c, h);
            }
        }
      return e.push(Zr), null;
    }
    function Er(e) {
      return Ve(e), ("" + e).replace(Sc, ge);
    }
    function At(e, t, c) {
      e.push(_n(c));
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
                Tn(e, h, y);
            }
        }
      return e.push(Zr), null;
    }
    function $r(e, t) {
      e.push(_n("title"));
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
                Tn(e, y, x);
            }
        }
      return e.push(bt), t = Array.isArray(c) ? 2 > c.length ? c[0] : null : c, typeof t != "function" && typeof t != "symbol" && t !== null && t !== void 0 && e.push(ee(Pe("" + t))), kt(e, h, c), e.push(dt("title")), null;
    }
    function Na(e, t) {
      e.push(_n("script"));
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
                Tn(e, y, x);
            }
        }
      return e.push(bt), c != null && typeof c != "string" && (t = typeof c == "number" ? "a number for children" : Array.isArray(c) ? "an array for children" : "something unexpected for children", console.error(
        "A script element was rendered with %s. If script element has children it must be a single string. Consider using dangerouslySetInnerHTML or passing a plain string as children.",
        t
      )), kt(e, h, c), typeof c == "string" && e.push(ee(he(c))), e.push(dt("script")), null;
    }
    function vn(e, t, c) {
      e.push(_n(c));
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
                Tn(e, y, x);
            }
        }
      return e.push(bt), kt(e, h, c), c;
    }
    function lr(e, t, c) {
      e.push(_n(c));
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
                Tn(e, y, x);
            }
        }
      return e.push(bt), kt(e, h, c), typeof c == "string" ? (e.push(ee(Pe(c))), null) : c;
    }
    function _n(e) {
      var t = Uu.get(e);
      if (t === void 0) {
        if (!Hu.test(e)) throw Error("Invalid tag: " + e);
        t = X("<" + e), Uu.set(e, t);
      }
      return t;
    }
    function rc(e, t, c, h, y, x, k, M, V) {
      si(t, c), t !== "input" && t !== "textarea" && t !== "select" || c == null || c.value !== null || o || (o = !0, t === "select" && c.multiple ? console.error(
        "`value` prop on `%s` should not be null. Consider using an empty array when `multiple` is set to `true` to clear the component or `undefined` for uncontrolled components.",
        t
      ) : console.error(
        "`value` prop on `%s` should not be null. Consider using an empty string to clear the component or `undefined` for uncontrolled components.",
        t
      ));
      e: if (t.indexOf("-") === -1) var _ = !1;
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
            _ = !1;
            break e;
          default:
            _ = !0;
        }
      switch (_ || typeof c.is == "string" || qr(t, c), !c.suppressContentEditableWarning && c.contentEditable && c.children != null && console.error(
        "A component is `contentEditable` and contains `children` managed by React. It is now your responsibility to guarantee that none of those nodes are unexpectedly modified or duplicated. This is probably not intentional."
      ), M.insertionMode !== kr && M.insertionMode !== Cl && t.indexOf("-") === -1 && t.toLowerCase() !== t && console.error(
        "<%s /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.",
        t
      ), t) {
        case "div":
        case "span":
        case "svg":
        case "path":
          break;
        case "a":
          e.push(_n("a"));
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
                    ce === "" ? tt(e, "href", "") : Tn(e, se, ce);
                    break;
                  default:
                    Tn(e, se, ce);
                }
            }
          if (e.push(bt), kt(e, oe, U), typeof U == "string") {
            e.push(ee(Pe(U)));
            var le = null;
          } else le = U;
          return le;
        case "g":
        case "p":
        case "li":
          break;
        case "select":
          rn("select", c), Gt(c, "value"), Gt(c, "defaultValue"), c.value === void 0 || c.defaultValue === void 0 || Ml || (console.error(
            "Select elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled select element and remove one of these props. More info: https://react.dev/link/controlled-components"
          ), Ml = !0), e.push(_n("select"));
          var Ue = null, Zn = null, Be;
          for (Be in c)
            if (zn.call(c, Be)) {
              var hn = c[Be];
              if (hn != null)
                switch (Be) {
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
                    Tn(
                      e,
                      Be,
                      hn
                    );
                }
            }
          return e.push(bt), kt(e, Zn, Ue), Ue;
        case "option":
          var Pt = M.selectedValue;
          e.push(_n("option"));
          var Ht = null, Fn = null, Le = null, Ut = null, Lr;
          for (Lr in c)
            if (zn.call(c, Lr)) {
              var Qn = c[Lr];
              if (Qn != null)
                switch (Lr) {
                  case "children":
                    Ht = Qn;
                    break;
                  case "selected":
                    Le = Qn, _u || (console.error(
                      "Use the `defaultValue` or `value` props on <select> instead of setting `selected` on <option>."
                    ), _u = !0);
                    break;
                  case "dangerouslySetInnerHTML":
                    Ut = Qn;
                    break;
                  case "value":
                    Fn = Qn;
                  default:
                    Tn(
                      e,
                      Lr,
                      Qn
                    );
                }
            }
          if (Pt != null) {
            if (Fn !== null) {
              Vn(Fn, "value");
              var ut = "" + Fn;
            } else
              Ut === null || Ar || (Ar = !0, console.error(
                "Pass a `value` prop if you set dangerouslyInnerHTML so React knows which value should be selected."
              )), ut = Xl(Ht);
            if (xi(Pt)) {
              for (var cl = 0; cl < Pt.length; cl++)
                if (Vn(Pt[cl], "value"), "" + Pt[cl] === ut) {
                  e.push(Ri);
                  break;
                }
            } else
              Vn(Pt, "select.value"), "" + Pt === ut && e.push(Ri);
          } else Le && e.push(Ri);
          return e.push(bt), kt(e, Ut, Ht), Ht;
        case "textarea":
          rn("textarea", c), c.value === void 0 || c.defaultValue === void 0 || gr || (console.error(
            "Textarea elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled textarea and remove one of these props. More info: https://react.dev/link/controlled-components"
          ), gr = !0), e.push(_n("textarea"));
          var pr = null, nr = null, st = null, Vt;
          for (Vt in c)
            if (zn.call(c, Vt)) {
              var ul = c[Vt];
              if (ul != null)
                switch (Vt) {
                  case "children":
                    st = ul;
                    break;
                  case "value":
                    pr = ul;
                    break;
                  case "defaultValue":
                    nr = ul;
                    break;
                  case "dangerouslySetInnerHTML":
                    throw Error(
                      "`dangerouslySetInnerHTML` does not make sense on <textarea>."
                    );
                  default:
                    Tn(
                      e,
                      Vt,
                      ul
                    );
                }
            }
          if (pr === null && nr !== null && (pr = nr), e.push(bt), st != null) {
            if (console.error(
              "Use the `defaultValue` or `value` props instead of setting children on <textarea>."
            ), pr != null)
              throw Error(
                "If you supply `defaultValue` on a <textarea>, do not pass children."
              );
            if (xi(st)) {
              if (1 < st.length)
                throw Error("<textarea> can only have at most one child.");
              Ve(st[0]), pr = "" + st[0];
            }
            Ve(st), pr = "" + st;
          }
          return typeof pr == "string" && pr[0] === `
` && e.push(lu), pr !== null && (Vn(pr, "value"), e.push(
            ee(Pe("" + pr))
          )), null;
        case "input":
          rn("input", c), e.push(_n("input"));
          var Al = null, tr = null, xt = null, _r = null, sl = null, Br = null, na = null, fl = null, Wt = null, zl;
          for (zl in c)
            if (zn.call(c, zl)) {
              var ur = c[zl];
              if (ur != null)
                switch (zl) {
                  case "children":
                  case "dangerouslySetInnerHTML":
                    throw Error(
                      "input is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
                    );
                  case "name":
                    Al = ur;
                    break;
                  case "formAction":
                    tr = ur;
                    break;
                  case "formEncType":
                    xt = ur;
                    break;
                  case "formMethod":
                    _r = ur;
                    break;
                  case "formTarget":
                    sl = ur;
                    break;
                  case "defaultChecked":
                    Wt = ur;
                    break;
                  case "defaultValue":
                    na = ur;
                    break;
                  case "checked":
                    fl = ur;
                    break;
                  case "value":
                    Br = ur;
                    break;
                  default:
                    Tn(
                      e,
                      zl,
                      ur
                    );
                }
            }
          tr === null || c.type === "image" || c.type === "submit" || $a || ($a = !0, console.error(
            'An input can only specify a formAction along with type="submit" or type="image".'
          ));
          var Qu = St(
            e,
            h,
            y,
            tr,
            xt,
            _r,
            sl,
            Al
          );
          return fl === null || Wt === null || qa || (console.error(
            "%s contains an input of type %s with both checked and defaultChecked props. Input elements must be either controlled or uncontrolled (specify either the checked prop, or the defaultChecked prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://react.dev/link/controlled-components",
            "A component",
            c.type
          ), qa = !0), Br === null || na === null || Ra || (console.error(
            "%s contains an input of type %s with both value and defaultValue props. Input elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://react.dev/link/controlled-components",
            "A component",
            c.type
          ), Ra = !0), fl !== null ? En(e, "checked", fl) : Wt !== null && En(e, "checked", Wt), Br !== null ? Tn(e, "value", Br) : na !== null && Tn(e, "value", na), e.push(Zr), Qu?.forEach(mt, e), null;
        case "button":
          e.push(_n("button"));
          var Fi = null, Ft = null, Hl = null, zr = null, Nc = null, jo = null, ci = null, qo;
          for (qo in c)
            if (zn.call(c, qo)) {
              var hl = c[qo];
              if (hl != null)
                switch (qo) {
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
                    Nc = hl;
                    break;
                  case "formMethod":
                    jo = hl;
                    break;
                  case "formTarget":
                    ci = hl;
                    break;
                  default:
                    Tn(
                      e,
                      qo,
                      hl
                    );
                }
            }
          zr === null || c.type == null || c.type === "submit" || $a || ($a = !0, console.error(
            'A button can only specify a formAction along with type="submit" or no type.'
          ));
          var Lc = St(
            e,
            h,
            y,
            zr,
            Nc,
            jo,
            ci,
            Hl
          );
          if (e.push(bt), Lc?.forEach(mt, e), kt(e, Ft, Fi), typeof Fi == "string") {
            e.push(
              ee(Pe(Fi))
            );
            var Ju = null;
          } else Ju = Fi;
          return Ju;
        case "form":
          e.push(_n("form"));
          var Ul = null, _c = null, Hr = null, $o = null, go = null, Oa = null, Wl;
          for (Wl in c)
            if (zn.call(c, Wl)) {
              var Yl = c[Wl];
              if (Yl != null)
                switch (Wl) {
                  case "children":
                    Ul = Yl;
                    break;
                  case "dangerouslySetInnerHTML":
                    _c = Yl;
                    break;
                  case "action":
                    Hr = Yl;
                    break;
                  case "encType":
                    $o = Yl;
                    break;
                  case "method":
                    go = Yl;
                    break;
                  case "target":
                    Oa = Yl;
                    break;
                  default:
                    Tn(
                      e,
                      Wl,
                      Yl
                    );
                }
            }
          var Oi = null, dl = null;
          if (typeof Hr == "function") {
            $o === null && go === null || ru || (ru = !0, console.error(
              "Cannot specify a encType or method for a form that specifies a function as the action. React provides those automatically. They will get overridden."
            )), Oa === null || tu || (tu = !0, console.error(
              "Cannot specify a target for a form that specifies a function as the action. The function will always be executed in the same window."
            ));
            var Tr = Ge(
              h,
              Hr
            );
            Tr !== null ? (Hr = Tr.action || "", $o = Tr.encType, go = Tr.method, Oa = Tr.target, Oi = Tr.data, dl = Tr.name) : (e.push(
              Mt,
              ee("action"),
              ml,
              Bo,
              un
            ), Oa = go = $o = Hr = null, Xt(h, y));
          }
          if (Hr != null && Tn(e, "action", Hr), $o != null && Tn(e, "encType", $o), go != null && Tn(e, "method", go), Oa != null && Tn(e, "target", Oa), e.push(bt), dl !== null && (e.push(Ea), tt(e, "name", dl), e.push(Zr), Oi?.forEach(
            mt,
            e
          )), kt(e, _c, Ul), typeof Ul == "string") {
            e.push(
              ee(Pe(Ul))
            );
            var Ma = null;
          } else Ma = Ul;
          return Ma;
        case "menuitem":
          e.push(_n("menuitem"));
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
                    Tn(
                      e,
                      Mi,
                      vo
                    );
                }
            }
          return e.push(bt), null;
        case "object":
          e.push(_n("object"));
          var ta = null, ps = null, Kr;
          for (Kr in c)
            if (zn.call(c, Kr)) {
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
                    Vn(ui, "data");
                    var Bc = J("" + ui);
                    if (Bc === "") {
                      console.error(
                        'An empty string ("") was passed to the %s attribute. To fix this, either do not render the element at all or pass null to %s instead of an empty string.',
                        Kr,
                        Kr
                      );
                      break;
                    }
                    e.push(
                      Mt,
                      ee("data"),
                      ml,
                      ee(Pe(Bc)),
                      un
                    );
                    break;
                  default:
                    Tn(
                      e,
                      Kr,
                      ui
                    );
                }
            }
          if (e.push(bt), kt(e, ps, ta), typeof ta == "string") {
            e.push(
              ee(Pe(ta))
            );
            var pu = null;
          } else pu = ta;
          return pu;
        case "title":
          var Tu = M.tagScope & 1, Xs = M.tagScope & 4;
          if (zn.call(c, "children")) {
            var yo = c.children, ec = Array.isArray(yo) ? 2 > yo.length ? yo[0] : null : yo;
            Array.isArray(yo) && 1 < yo.length ? console.error(
              "React expects the `children` prop of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found an Array with length %s instead. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert `children` of <title> tags to a single string value which is why Arrays of length greater than 1 are not supported. When using JSX it can be common to combine text nodes and value nodes. For example: <title>hello {nameOfUser}</title>. While not immediately apparent, `children` in this case is an Array with length 2. If your `children` prop is using this form try rewriting it using a template string: <title>{`hello ${nameOfUser}`}</title>.",
              yo.length
            ) : typeof ec == "function" || typeof ec == "symbol" ? console.error(
              "React expect children of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found %s instead. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert children of <title> tags to a single string value.",
              typeof ec == "function" ? "a Function" : "a Sybmol"
            ) : ec && ec.toString === {}.toString && (ec.$$typeof != null ? console.error(
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
          var xu = M.tagScope & 1, Ls = M.tagScope & 4, ks = c.rel, jr = c.href, Ii = c.precedence;
          if (M.insertionMode === kr || xu || c.itemProp != null || typeof ks != "string" || typeof jr != "string" || jr === "") {
            ks === "stylesheet" && typeof c.precedence == "string" && (typeof jr == "string" && jr || console.error(
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
              var Gl = y.styles.get(Ii), Yt = h.styleResources.hasOwnProperty(
                jr
              ) ? h.styleResources[jr] : void 0;
              if (Yt !== An) {
                h.styleResources[jr] = An, Gl || (Gl = {
                  precedence: ee(Pe(Ii)),
                  rules: [],
                  hrefs: [],
                  sheets: /* @__PURE__ */ new Map()
                }, y.styles.set(Ii, Gl));
                var Et = {
                  state: Aa,
                  props: qn({}, c, {
                    "data-precedence": c.precedence,
                    precedence: null
                  })
                };
                if (Yt) {
                  Yt.length === 2 && hi(Et.props, Yt);
                  var et = y.preloads.stylesheets.get(jr);
                  et && 0 < et.length ? et.length = 0 : Et.state = hu;
                }
                Gl.sheets.set(jr, Et), k && k.stylesheets.add(Et);
              } else if (Gl) {
                var As = Gl.sheets.get(jr);
                As && k && k.stylesheets.add(As);
              }
              V && e.push(_t), wo = null;
            }
          else
            c.onLoad || c.onError ? wo = De(
              e,
              c
            ) : (V && e.push(_t), wo = Ls ? null : De(y.hoistableChunks, c));
          return wo;
        case "script":
          var nc = M.tagScope & 1, Ku = c.async;
          if (typeof c.src != "string" || !c.src || !Ku || typeof Ku == "function" || typeof Ku == "symbol" || c.onLoad || c.onError || M.insertionMode === kr || nc || c.itemProp != null)
            var tc = Na(
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
            if (Eu !== An) {
              ju[zc] = An;
              var Ru = c;
              if (Eu) {
                Eu.length === 2 && (Ru = qn({}, c), hi(Ru, Eu));
                var Ts = Hc.get(zc);
                Ts && (Ts.length = 0);
              }
              var Ps = [];
              y.scripts.add(Ps), Na(Ps, Ru);
            }
            V && e.push(_t), tc = null;
          }
          return tc;
        case "style":
          var _s = M.tagScope & 1;
          if (zn.call(c, "children")) {
            var qu = c.children, $u = Array.isArray(qu) ? 2 > qu.length ? qu[0] : null : qu;
            (typeof $u == "function" || typeof $u == "symbol" || Array.isArray($u)) && console.error(
              "React expect children of <style> tags to be a string, number, or object with a `toString` method but found %s instead. In browsers style Elements can only have `Text` Nodes as children.",
              typeof $u == "function" ? "a Function" : typeof $u == "symbol" ? "a Sybmol" : "an Array"
            );
          }
          var Uc = c.precedence, po = c.href, Ia = c.nonce;
          if (M.insertionMode === kr || _s || c.itemProp != null || typeof Uc != "string" || typeof po != "string" || po === "") {
            e.push(_n("style"));
            var gl = null, Cu = null, Bs;
            for (Bs in c)
              if (zn.call(c, Bs)) {
                var Zs = c[Bs];
                if (Zs != null)
                  switch (Bs) {
                    case "children":
                      gl = Zs;
                      break;
                    case "dangerouslySetInnerHTML":
                      Cu = Zs;
                      break;
                    default:
                      Tn(
                        e,
                        Bs,
                        Zs
                      );
                  }
              }
            e.push(bt);
            var Fs = Array.isArray(gl) ? 2 > gl.length ? gl[0] : null : gl;
            typeof Fs != "function" && typeof Fs != "symbol" && Fs !== null && Fs !== void 0 && e.push(
              ee(Er(Fs))
            ), kt(
              e,
              Cu,
              gl
            ), e.push(dt("style"));
            var cf = null;
          } else {
            po.includes(" ") && console.error(
              'React expected the `href` prop for a <style> tag opting into hoisting semantics using the `precedence` prop to not have any spaces but ecountered spaces instead. using spaces in this prop will cause hydration of this style to fail on the client. The href for the <style> where this ocurred is "%s".',
              po
            );
            var xs = y.styles.get(Uc), uf = h.styleResources.hasOwnProperty(po) ? h.styleResources[po] : void 0;
            if (uf !== An) {
              h.styleResources[po] = An, uf && console.error(
                'React encountered a hoistable style tag for the same href as a preload: "%s". When using a style tag to inline styles you should not also preload it as a stylsheet.',
                po
              ), xs || (xs = {
                precedence: ee(
                  Pe(Uc)
                ),
                rules: [],
                hrefs: [],
                sheets: /* @__PURE__ */ new Map()
              }, y.styles.set(
                Uc,
                xs
              ));
              var zs = y.nonce.style;
              if (zs && zs !== Ia)
                console.error(
                  'React encountered a style tag with `precedence` "%s" and `nonce` "%s". When React manages style rules using `precedence` it will only include rules if the nonce matches the style nonce "%s" that was included with this render.',
                  Uc,
                  Ia,
                  zs
                );
              else {
                !zs && Ia && console.error(
                  'React encountered a style tag with `precedence` "%s" and `nonce` "%s". When React manages style rules using `precedence` it will only include a nonce attributes if you also provide the same style nonce value as a render option.',
                  Uc,
                  Ia
                ), xs.hrefs.push(
                  ee(Pe(po))
                );
                var Qs = xs.rules, Js = null, mf = null, sf;
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
                  ee(Er(js))
                ), kt(Qs, mf, Js);
              }
            }
            xs && k && k.styles.add(xs), V && e.push(_t), cf = void 0;
          }
          return cf;
        case "meta":
          var Jf = M.tagScope & 1, Vf = M.tagScope & 4;
          if (M.insertionMode === kr || Jf || c.itemProp != null)
            var Sf = At(
              e,
              c,
              "meta"
            );
          else
            V && e.push(_t), Sf = Vf ? null : typeof c.charSet == "string" ? At(y.charsetChunks, c, "meta") : c.name === "viewport" ? At(y.viewportChunks, c, "meta") : At(
              y.hoistableChunks,
              c,
              "meta"
            );
          return Sf;
        case "listing":
        case "pre":
          e.push(_n(t));
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
                    Tn(
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
` ? e.push(lu, ee(Os)) : (Ve(Os), e.push(ee("" + Os))));
          }
          return typeof qs == "string" && qs[0] === `
` && e.push(lu), qs;
        case "img":
          var Kf = M.tagScope & 3, ra = c.src, Di = c.srcSet;
          if (!(c.loading === "lazy" || !ra && !Di || typeof ra != "string" && ra != null || typeof Di != "string" && Di != null || c.fetchPriority === "low" || Kf) && (typeof ra != "string" || ra[4] !== ":" || ra[0] !== "d" && ra[0] !== "D" || ra[1] !== "a" && ra[1] !== "A" || ra[2] !== "t" && ra[2] !== "T" || ra[3] !== "a" && ra[3] !== "A") && (typeof Di != "string" || Di[4] !== ":" || Di[0] !== "d" && Di[0] !== "D" || Di[1] !== "a" && Di[1] !== "A" || Di[2] !== "t" && Di[2] !== "T" || Di[3] !== "a" && Di[3] !== "A")) {
            k !== null && M.tagScope & 64 && (k.suspenseyImages = !0);
            var kf = typeof c.sizes == "string" ? c.sizes : void 0, Vs = Di ? Di + `
` + (kf || "") : ra, wf = y.preloads.images, Hs = wf.get(Vs);
            if (Hs)
              (c.fetchPriority === "high" || 10 > y.highImagePreloads.size) && (wf.delete(Vs), y.highImagePreloads.add(Hs));
            else if (!h.imageResources.hasOwnProperty(Vs)) {
              h.imageResources[Vs] = $t;
              var pf = c.crossOrigin, Af = typeof pf == "string" ? pf === "use-credentials" ? pf : "" : void 0, Us = y.headers, Tf;
              Us && 0 < Us.remainingCapacity && typeof c.srcSet != "string" && (c.fetchPriority === "high" || 500 > Us.highImagePreloads.length) && (Tf = ca(ra, "image", {
                imageSrcSet: c.srcSet,
                imageSizes: c.sizes,
                crossOrigin: Af,
                integrity: c.integrity,
                nonce: c.nonce,
                type: c.type,
                fetchPriority: c.fetchPriority,
                referrerPolicy: c.refererPolicy
              }), 0 <= (Us.remainingCapacity -= Tf.length + 2)) ? (y.resets.image[Vs] = $t, Us.highImagePreloads && (Us.highImagePreloads += ", "), Us.highImagePreloads += Tf) : (Hs = [], De(Hs, {
                rel: "preload",
                as: "image",
                href: Di ? void 0 : ra,
                imageSrcSet: Di,
                imageSizes: kf,
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
          if (M.insertionMode < Sr) {
            var xf = x || y.preamble;
            if (xf.headChunks)
              throw Error("The `<head>` tag may only be rendered once.");
            x !== null && e.push(kc), xf.headChunks = [];
            var Pf = vn(
              xf.headChunks,
              c,
              "head"
            );
          } else
            Pf = lr(
              e,
              c,
              "head"
            );
          return Pf;
        case "body":
          if (M.insertionMode < Sr) {
            var Ef = x || y.preamble;
            if (Ef.bodyChunks)
              throw Error("The `<body>` tag may only be rendered once.");
            x !== null && e.push(Bu), Ef.bodyChunks = [];
            var Ff = vn(
              Ef.bodyChunks,
              c,
              "body"
            );
          } else
            Ff = lr(
              e,
              c,
              "body"
            );
          return Ff;
        case "html":
          if (M.insertionMode === Lo) {
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
            Of = lr(
              e,
              c,
              "html"
            );
          return Of;
        default:
          if (t.indexOf("-") !== -1) {
            e.push(_n(t));
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
                      Ct(e, mu);
                      break;
                    case "suppressContentEditableWarning":
                    case "suppressHydrationWarning":
                    case "ref":
                      break;
                    case "className":
                      If = "class";
                    default:
                      if (Rt(Ks) && typeof mu != "function" && typeof mu != "symbol" && mu !== !1) {
                        if (mu === !0)
                          mu = "";
                        else if (typeof mu == "object")
                          continue;
                        e.push(
                          Mt,
                          ee(If),
                          ml,
                          ee(
                            Pe(mu)
                          ),
                          un
                        );
                      }
                  }
                }
              }
            return e.push(bt), kt(
              e,
              Mf,
              Cf
            ), Cf;
          }
      }
      return lr(e, c, t);
    }
    function dt(e) {
      var t = iu.get(e);
      return t === void 0 && (t = X("</" + e + ">"), iu.set(e, t)), t;
    }
    function xo(e, t) {
      e = e.preamble, e.htmlChunks === null && t.htmlChunks && (e.htmlChunks = t.htmlChunks), e.headChunks === null && t.headChunks && (e.headChunks = t.headChunks), e.bodyChunks === null && t.bodyChunks && (e.bodyChunks = t.bodyChunks);
    }
    function Eo(e, t) {
      t = t.bootstrapChunks;
      for (var c = 0; c < t.length - 1; c++)
        P(e, t[c]);
      return c < t.length ? (c = t[c], t.length = 0, N(e, c)) : !0;
    }
    function el(e, t, c) {
      if (P(e, Ca), c === null)
        throw Error(
          "An ID must have been assigned before we can complete the boundary."
        );
      return P(e, t.boundaryPrefix), P(e, ee(c.toString(16))), N(e, Il);
    }
    function oa(e, t, c, h) {
      switch (c.insertionMode) {
        case Lo:
        case Ta:
        case Ec:
        case Sr:
          return P(e, fs), P(e, t.segmentPrefix), P(e, ee(h.toString(16))), N(e, li);
        case kr:
          return P(e, Sl), P(e, t.segmentPrefix), P(e, ee(h.toString(16))), N(e, ka);
        case Cl:
          return P(e, Dl), P(e, t.segmentPrefix), P(e, ee(h.toString(16))), N(e, Yu);
        case Ji:
          return P(e, Wo), P(e, t.segmentPrefix), P(e, ee(h.toString(16))), N(e, l);
        case Rc:
          return P(e, s), P(e, t.segmentPrefix), P(e, ee(h.toString(16))), N(e, v);
        case Vi:
          return P(e, C), P(e, t.segmentPrefix), P(e, ee(h.toString(16))), N(e, S);
        case nu:
          return P(e, O), P(e, t.segmentPrefix), P(e, ee(h.toString(16))), N(e, z);
        default:
          throw Error("Unknown insertion mode. This is a bug in React.");
      }
    }
    function fi(e, t) {
      switch (t.insertionMode) {
        case Lo:
        case Ta:
        case Ec:
        case Sr:
          return N(e, Uo);
        case kr:
          return N(e, ro);
        case Cl:
          return N(e, hs);
        case Ji:
          return N(e, a);
        case Rc:
          return N(e, w);
        case Vi:
          return N(e, B);
        case nu:
          return N(e, Z);
        default:
          throw Error("Unknown insertion mode. This is a bug in React.");
      }
    }
    function Zl(e) {
      return JSON.stringify(e).replace(
        Ll,
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
        Or,
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
        for (P(this, sn.startInlineStyle), P(this, ii), P(this, e.precedence), P(this, Mr); h < c.length - 1; h++)
          P(this, c[h]), P(this, ot);
        for (P(this, c[h]), P(this, io), h = 0; h < t.length; h++) P(this, t[h]);
        Go = N(
          this,
          Yo
        ), Jr = !0, t.length = 0, c.length = 0;
      }
    }
    function R(e) {
      return e.state !== Ci ? Jr = !0 : !1;
    }
    function L(e, t, c) {
      return Jr = !1, Go = !0, sn = c, t.styles.forEach(bl, e), sn = null, t.stylesheets.forEach(R), Jr && (c.stylesToHoist = !0), Go;
    }
    function ne(e) {
      for (var t = 0; t < e.length; t++) P(this, e[t]);
      e.length = 0;
    }
    function Ee(e) {
      De(Ir, e.props);
      for (var t = 0; t < Ir.length; t++)
        P(this, Ir[t]);
      Ir.length = 0, e.state = Ci;
    }
    function Oe(e) {
      var t = 0 < e.sheets.size;
      e.sheets.forEach(Ee, this), e.sheets.clear();
      var c = e.rules, h = e.hrefs;
      if (!t || h.length) {
        if (P(this, sn.startInlineStyle), P(this, ao), P(this, e.precedence), e = 0, h.length) {
          for (P(this, Gu); e < h.length - 1; e++)
            P(this, h[e]), P(this, ot);
          P(this, h[e]);
        }
        for (P(this, Xo), e = 0; e < c.length; e++)
          P(this, c[e]);
        P(this, ai), c.length = 0, h.length = 0;
      }
    }
    function ln(e) {
      if (e.state === Aa) {
        e.state = hu;
        var t = e.props;
        for (De(Ir, {
          rel: "preload",
          as: "style",
          href: e.props.href,
          crossOrigin: t.crossOrigin,
          fetchPriority: t.fetchPriority,
          integrity: t.integrity,
          media: t.media,
          hrefLang: t.hrefLang,
          referrerPolicy: t.referrerPolicy
        }), e = 0; e < Ir.length; e++)
          P(this, Ir[e]);
        Ir.length = 0;
      }
    }
    function Ke(e) {
      e.sheets.forEach(ln, this), e.sheets.clear();
    }
    function an(e, t) {
      (t.instructions & kn) === yt && (t.instructions |= kn, e.push(
        uu,
        ee(
          Pe("_" + t.idPrefix + "R_")
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
            ), P(e, Zo), c = su;
          else {
            P(e, c);
            var y = h.props["data-precedence"], x = h.props, k = J("" + h.props.href);
            P(
              e,
              ee(Ql(k))
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
            P(e, Zo), c = su, h.state = co;
          }
      }), P(e, Zo);
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
          if (2 < t.length && (t[0] === "o" || t[0] === "O") && (t[1] === "n" || t[1] === "N") || !Rt(t))
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
    function gt(e, t, c, h) {
      (e.scriptResources.hasOwnProperty(c) || e.moduleScriptResources.hasOwnProperty(c)) && console.error(
        'Internal React Error: React expected bootstrap script or module with src "%s" to not have been preloaded already. please file an issue',
        c
      ), e.scriptResources[c] = An, e.moduleScriptResources[c] = An, e = [], De(e, h), t.bootstrapScripts.add(e);
    }
    function hi(e, t) {
      e.crossOrigin == null && (e.crossOrigin = t[0]), e.integrity == null && (e.integrity = t[1]);
    }
    function ca(e, t, c) {
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
        sr
      );
    }
    function sr(e) {
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
      return vl(e) && (console.error(
        "The provided `%s` option is an unsupported type %s. This value must be coerced to a string before using it here.",
        t,
        Ot(e)
      ), Kt(e)), ("" + e).replace(
        ds,
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
    function wl(e) {
      this.stylesheets.add(e);
    }
    function Rn(e, t) {
      t.styles.forEach(lc, e), t.stylesheets.forEach(wl, e), t.suspenseyImages && (e.suspenseyImages = !0);
    }
    function ns(e) {
      return 0 < e.stylesheets.size || e.suspenseyImages;
    }
    function dn(e) {
      if (e == null) return null;
      if (typeof e == "function")
        return e.$$typeof === gs ? null : e.displayName || e.name || null;
      if (typeof e == "string") return e;
      switch (e) {
        case Yi:
          return "Fragment";
        case pc:
          return "Profiler";
        case wc:
          return "StrictMode";
        case ya:
          return "Suspense";
        case Ga:
          return "SuspenseList";
        case ir:
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
          case mn:
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
    function Bn(e, t) {
      var c = t.parent;
      if (c === null)
        throw Error(
          "The depth must equal at least at zero before reaching the root. This is a bug in React."
        );
      e.depth === c.depth ? ic(e, c) : Bn(e, c), t.context._currentValue = t.value;
    }
    function Cn(e) {
      var t = qi;
      t !== e && (t === null ? oc(e) : e === null ? ac(t) : t.depth === e.depth ? ic(t, e) : t.depth > e.depth ? di(t, e) : Bn(t, e), qi = e);
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
    function fr(e, t) {
      e = (e = e.constructor) && dn(e) || "ReactClass";
      var c = e + "." + t;
      du[c] || (console.error(
        `Can only update a mounting component. This usually means you called %s() outside componentWillMount() on the server. This is a no-op.

Please check the code for the %s component.`,
        t,
        e
      ), du[c] = !0);
    }
    function _a(e, t, c) {
      var h = e.id;
      e = e.overflow;
      var y = 32 - Jo(h) - 1;
      h &= ~(1 << y), c += 1;
      var x = 32 - Jo(t) + y;
      if (30 < x) {
        var k = y - y % 5;
        return x = (h & (1 << k) - 1).toString(32), h >>= k, y -= k, {
          id: 1 << 32 - Jo(t) + y | c << y | h,
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
    function Rr() {
    }
    function ts(e, t, c) {
      switch (c = e[c], c === void 0 ? e.push(t) : c !== t && (t.then(Rr, Rr), t = c), t.status) {
        case "fulfilled":
          return t.value;
        case "rejected":
          throw t.reason;
        default:
          switch (typeof t.status == "string" ? t.then(Rr, Rr) : (e = t, e.status = "pending", e.then(
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
          throw bs = t, mi;
      }
    }
    function Su() {
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
      if (or === null)
        throw Error(
          `Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:
1. You might have mismatching versions of React and the renderer (such as React DOM)
2. You might be breaking the Rules of Hooks
3. You might have more than one copy of React in the same app
See https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.`
        );
      return oi && console.error(
        "Do not call Hooks inside useEffect(...), useMemo(...), or other built-in Hooks. You can only call Hooks at the top level of your React function. For more information, see https://react.dev/link/rules-of-hooks"
      ), or;
    }
    function Gc() {
      if (0 < Ic)
        throw Error("Rendered more hooks than during the previous render");
      return { memoizedState: null, queue: null, next: null };
    }
    function Ro() {
      return Nn === null ? Bl === null ? (il = !1, Bl = Nn = Gc()) : (il = !0, Nn = Bl) : Nn.next === null ? (il = !1, Nn = Nn.next = Gc()) : (il = !0, Nn = Nn.next), Nn;
    }
    function pl() {
      var e = Vo;
      return Vo = null, e;
    }
    function Ba() {
      oi = !1, Fa = Dr = $i = or = null, ea = !1, Bl = null, Ic = 0, Nn = fo = null;
    }
    function rs(e) {
      return oi && console.error(
        "Context can only be read while React is rendering. In classes, you can read it in the render method or getDerivedStateFromProps. In function components, you can read it directly in the function body, but not inside Hooks like useReducer() or useMemo()."
      ), e._currentValue;
    }
    function ls(e, t) {
      return typeof t == "function" ? t(e) : t;
    }
    function Co(e, t, c) {
      if (e !== ls && (ho = "useReducer"), or = rt(), Nn = Ro(), il) {
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
      return oi = !0, e = e === ls ? typeof t == "function" ? t() : t : c !== void 0 ? c(t) : t, oi = !1, Nn.memoizedState = e, e = Nn.queue = { last: null, dispatch: null }, e = e.dispatch = gi.bind(
        null,
        or,
        e
      ), [Nn.memoizedState, e];
    }
    function mo(e, t) {
      if (or = rt(), Nn = Ro(), t = t === void 0 ? null : t, Nn !== null) {
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
      if (e === or)
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
      var h = Mc++, y = Dr;
      if (typeof e.$$FORM_ACTION == "function") {
        var x = null, k = Fa;
        y = y.formState;
        var M = e.$$IS_SIGNATURE_EQUAL;
        if (y !== null && typeof M == "function") {
          var V = y[1];
          M.call(e, y[2], y[3]) && (x = c !== void 0 ? "p" + c : "k" + Re(
            JSON.stringify([
              k,
              null,
              h
            ]),
            0
          ), V === x && (wu = h, t = y[0]));
        }
        var _ = e.bind(null, t);
        return e = function(oe) {
          _(oe);
        }, typeof _.$$FORM_ACTION == "function" && (e.$$FORM_ACTION = function(oe) {
          oe = _.$$FORM_ACTION(oe), c !== void 0 && (Vn(c, "target"), c += "", oe.action = c);
          var se = oe.data;
          return se && (x === null && (x = c !== void 0 ? "p" + c : "k" + Re(
            JSON.stringify([
              k,
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
      var t = ws;
      return ws += 1, Vo === null && (Vo = []), ts(Vo, e, t);
    }
    function So() {
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
      if (de === void 0)
        try {
          throw Error();
        } catch (c) {
          var t = c.stack.trim().match(/\n( *(at )?)/);
          de = t && t[1] || "", Ce = -1 < c.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < c.stack.indexOf("@") ? "@unknown:0:0" : "";
        }
      return `
` + de + e + Ce;
    }
    function Kl(e, t) {
      if (!e || be) return "";
      var c = ae.get(e);
      if (c !== void 0) return c;
      be = !0, c = Error.prepareStackTrace, Error.prepareStackTrace = void 0;
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
        var k = y.DetermineComponentFrameRoot(), M = k[0], V = k[1];
        if (M && V) {
          var _ = M.split(`
`), U = V.split(`
`);
          for (k = x = 0; x < _.length && !_[x].includes(
            "DetermineComponentFrameRoot"
          ); )
            x++;
          for (; k < U.length && !U[k].includes(
            "DetermineComponentFrameRoot"
          ); )
            k++;
          if (x === _.length || k === U.length)
            for (x = _.length - 1, k = U.length - 1; 1 <= x && 0 <= k && _[x] !== U[k]; )
              k--;
          for (; 1 <= x && 0 <= k; x--, k--)
            if (_[x] !== U[k]) {
              if (x !== 1 || k !== 1)
                do
                  if (x--, k--, 0 > k || _[x] !== U[k]) {
                    var oe = `
` + _[x].replace(
                      " at new ",
                      " at "
                    );
                    return e.displayName && oe.includes("<anonymous>") && (oe = oe.replace("<anonymous>", e.displayName)), typeof e == "function" && ae.set(e, oe), oe;
                  }
                while (1 <= x && 0 <= k);
              break;
            }
        }
      } finally {
        be = !1, cn.H = h, yi(), Error.prepareStackTrace = c;
      }
      return _ = (_ = e ? e.displayName || e.name : "") ? Ur(_) : "", typeof e == "function" && ae.set(e, _), _;
    }
    function ku(e) {
      if (typeof e == "string") return Ur(e);
      if (typeof e == "function")
        return e.prototype && e.prototype.isReactComponent ? Kl(e, !0) : Kl(e, !1);
      if (typeof e == "object" && e !== null) {
        switch (e.$$typeof) {
          case mn:
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
            return ku(e);
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
        case ya:
          return Ur("Suspense");
      }
      return "";
    }
    function hc() {
      var e = Si();
      1e3 < e - In && (cn.recentlyCreatedOwnerStacks = 0, In = e);
    }
    function Wr(e, t) {
      return (500 < t.byteSize || ns(t.contentState)) && t.contentPreamble === null;
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
        ), e.unshift(console), t = _l.apply(console.error, e), t();
      } else console.error(e);
      return null;
    }
    function ua(e, t, c, h, y, x, k, M, V, _, U) {
      var oe = /* @__PURE__ */ new Set();
      this.destination = null, this.flushScheduled = !1, this.resumableState = e, this.renderState = t, this.rootFormatContext = c, this.progressiveChunkSize = h === void 0 ? 12800 : h, this.status = 10, this.fatalError = null, this.pendingRootTasks = this.allPendingTasks = this.nextSegmentId = 0, this.completedPreambleSegments = this.completedRootSegment = null, this.byteSize = 0, this.abortableTasks = oe, this.pingedTasks = [], this.clientRenderedBoundaries = [], this.completedBoundaries = [], this.partialBoundaries = [], this.trackedPostpones = null, this.onError = y === void 0 ? dc : y, this.onPostpone = _ === void 0 ? Rr : _, this.onAllReady = x === void 0 ? Rr : x, this.onShellReady = k === void 0 ? Rr : k, this.onShellError = M === void 0 ? Rr : M, this.onFatalError = V === void 0 ? Rr : V, this.formState = U === void 0 ? null : U, this.didWarnForKey = null;
    }
    function ko(e, t, c, h, y, x, k, M, V, _, U, oe) {
      return hc(), t = new ua(
        t,
        c,
        h,
        y,
        x,
        k,
        M,
        V,
        _,
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
      ), Bi(e), t.pingedTasks.push(e), t;
    }
    function Yr(e, t, c, h, y, x, k, M, V, _, U) {
      return e = ko(
        e,
        t,
        c,
        h,
        y,
        x,
        k,
        M,
        V,
        _,
        U,
        void 0
      ), e.trackedPostpones = {
        workingMap: /* @__PURE__ */ new Map(),
        rootNodes: [],
        rootSlots: null
      }, e;
    }
    function jt(e, t, c, h, y, x, k, M, V) {
      return hc(), c = new ua(
        t.resumableState,
        c,
        t.rootFormatContext,
        t.progressiveChunkSize,
        h,
        y,
        x,
        k,
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
      ), Bi(e), c.pingedTasks.push(e), c) : (e = Pu(
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
      ), Bi(e), c.pingedTasks.push(e), c);
    }
    function jn(e, t, c, h, y, x, k, M, V) {
      return e = jt(
        e,
        t,
        c,
        h,
        y,
        x,
        k,
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
        return va(e);
      }) : ie(function() {
        return va(e);
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
      }, t !== null && (t.pendingTasks++, h = t.boundaries, h !== null && (e.allPendingTasks++, c.pendingTasks++, h.push(c)), e = t.inheritedHoistables, e !== null && Rn(c.contentState, e)), c;
    }
    function jl(e, t, c, h, y, x, k, M, V, _, U, oe, se, ce, le, Ue, Zn) {
      e.allPendingTasks++, y === null ? e.pendingRootTasks++ : y.pendingTasks++, ce !== null && ce.pendingTasks++;
      var Be = {
        replay: null,
        node: c,
        childIndex: h,
        ping: function() {
          return Au(e, Be);
        },
        blockedBoundary: y,
        blockedSegment: x,
        blockedPreamble: k,
        hoistableState: M,
        abortSet: V,
        keyPath: _,
        formatContext: U,
        context: oe,
        treeContext: se,
        row: ce,
        componentStack: le,
        thenableState: t
      };
      return Be.debugTask = Zn, V.add(Be), Be;
    }
    function Pu(e, t, c, h, y, x, k, M, V, _, U, oe, se, ce, le, Ue) {
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
        hoistableState: k,
        abortSet: M,
        keyPath: V,
        formatContext: _,
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
          e.owner || (t += ku(e.type));
        for (; e; )
          c = null, e.debugStack != null ? c = fc(
            e.debugStack
          ) : (x = e, x.stack != null && (c = typeof x.stack != "string" ? x.stack = fc(
            x.stack
          ) : x.stack)), (e = e.owner) && c && (t += `
` + c);
        var k = t;
      } catch (M) {
        k = `
Error generating stack: ` + M.message + `
` + M.stack;
      }
      return k;
    }
    function Ao(e, t) {
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
    function _i(e, t) {
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
    function Bi(e) {
      var t = e.node;
      if (typeof t == "object" && t !== null)
        switch (t.$$typeof) {
          case jc:
            var c = t.type, h = t._owner, y = t._debugStack;
            _i(e, t._debugInfo), e.debugTask = t._debugTask, e.componentStack = {
              parent: e.componentStack,
              type: c,
              owner: h,
              stack: y
            };
            break;
          case ba:
            _i(e, t._debugInfo);
            break;
          default:
            typeof t.then == "function" && _i(e, t._debugInfo);
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
              c += ku(h.type), h = h.parent;
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
      e.errorDigest = t, c instanceof Error ? (t = String(c.message), c = String(c.stack)) : (t = typeof c == "object" && c !== null ? On(c) : String(c), c = null), y = y ? `Switched to client rendering because the server rendering aborted due to:

` : `Switched to client rendering because the server rendering errored:

`, e.errorMessage = y + t, e.errorStack = c !== null ? y + c : null, e.errorComponentStack = h.componentStack;
    }
    function Dt(e, t, c, h) {
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
      h ? (h.run(c.bind(null, t)), h.run(y.bind(null, t))) : (c(t), y(t)), e.destination !== null ? (e.status = Nr, rr(e.destination, t)) : (e.status = 13, e.fatalError = t);
    }
    function Qt(e, t) {
      sa(e, t.next, t.hoistables);
    }
    function sa(e, t, c) {
      for (; t !== null; ) {
        c !== null && (Rn(t.hoistables, c), t.inheritedHoistables = c);
        var h = t.boundaries;
        if (h !== null) {
          t.boundaries = null;
          for (var y = 0; y < h.length; y++) {
            var x = h[y];
            c !== null && Rn(
              x.contentState,
              c
            ), ga(e, x, null, null);
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
        h && sa(e, t, t.hoistables);
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
      var x = t.keyPath, k = t.treeContext, M = t.row, V = t.componentStack, _ = t.debugTask;
      _i(t, t.node.props.children._debugInfo), t.keyPath = c, c = h.length;
      var U = null;
      if (t.replay !== null) {
        var oe = t.replay.slots;
        if (oe !== null && typeof oe == "object")
          for (var se = 0; se < c; se++) {
            var ce = y !== "backwards" && y !== "unstable_legacy-backwards" ? se : c - 1 - se, le = h[ce];
            t.row = U = pi(
              U
            ), t.treeContext = _a(k, c, ce);
            var Ue = oe[ce];
            typeof Ue == "number" ? (Ha(e, t, Ue, le, ce), delete oe[ce]) : qt(e, t, le, ce), --U.pendingTasks === 0 && Qt(e, U);
          }
        else
          for (oe = 0; oe < c; oe++)
            se = y !== "backwards" && y !== "unstable_legacy-backwards" ? oe : c - 1 - oe, ce = h[se], $l(e, t, ce), t.row = U = pi(U), t.treeContext = _a(k, c, se), qt(e, t, ce, se), --U.pendingTasks === 0 && Qt(e, U);
      } else if (y !== "backwards" && y !== "unstable_legacy-backwards")
        for (y = 0; y < c; y++)
          oe = h[y], $l(e, t, oe), t.row = U = pi(U), t.treeContext = _a(
            k,
            c,
            y
          ), qt(e, t, oe, y), --U.pendingTasks === 0 && Qt(e, U);
      else {
        for (y = t.blockedSegment, oe = y.children.length, se = y.chunks.length, ce = c - 1; 0 <= ce; ce--) {
          le = h[ce], t.row = U = pi(
            U
          ), t.treeContext = _a(k, c, ce), Ue = Li(
            e,
            se,
            null,
            t.formatContext,
            ce === 0 ? y.lastPushedText : !0,
            !0
          ), y.children.splice(oe, 0, Ue), t.blockedSegment = Ue, $l(e, t, le);
          try {
            qt(e, t, le, ce), Ue.lastPushedText && Ue.textEmbedded && Ue.chunks.push(_t), Ue.status = Un, ei(e, t.blockedBoundary, Ue), --U.pendingTasks === 0 && Qt(e, U);
          } catch (Zn) {
            throw Ue.status = e.status === 12 ? Tt : pn, Zn;
          }
        }
        t.blockedSegment = y, y.lastPushedText = !1;
      }
      M !== null && U !== null && 0 < U.pendingTasks && (M.pendingTasks++, U.next = M), t.treeContext = k, t.row = M, t.keyPath = x, t.componentStack = V, t.debugTask = _;
    }
    function Nt(e, t, c, h, y, x) {
      var k = t.thenableState;
      for (t.thenableState = null, or = {}, $i = t, Dr = e, Fa = c, oi = !1, Mc = zt = 0, wu = -1, ws = 0, Vo = k, e = Jn(h, y, x); ea; )
        ea = !1, Mc = zt = 0, wu = -1, ws = 0, Ic += 1, Nn = null, e = h(y, x);
      return Ba(), e;
    }
    function Hi(e, t, c, h, y, x, k) {
      var M = !1;
      if (x !== 0 && e.formState !== null) {
        var V = t.blockedSegment;
        if (V !== null) {
          M = !0, V = V.chunks;
          for (var _ = 0; _ < x; _++)
            _ === k ? V.push(no) : V.push(Pr);
        }
      }
      x = t.keyPath, t.keyPath = c, y ? (c = t.treeContext, t.treeContext = _a(c, 1, 0), qt(e, t, h, -1), t.treeContext = c) : M ? qt(e, t, h, -1) : Gr(e, t, h, -1), t.keyPath = x;
    }
    function Ui(e, t, c, h, y, x) {
      if (typeof h == "function")
        if (h.prototype && h.prototype.isReactComponent) {
          var k = y;
          if ("ref" in y) {
            k = {};
            for (var M in y)
              M !== "ref" && (k[M] = y[M]);
          }
          var V = h.defaultProps;
          if (V) {
            k === y && (k = qn({}, k, y));
            for (var _ in V)
              k[_] === void 0 && (k[_] = V[_]);
          }
          var U = k, oe = kl, se = h.contextType;
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
            var Zn = null, Be = null, hn = null;
            if (typeof le.componentWillMount == "function" && le.componentWillMount.__suppressDeprecationWarning !== !0 ? Zn = "componentWillMount" : typeof le.UNSAFE_componentWillMount == "function" && (Zn = "UNSAFE_componentWillMount"), typeof le.componentWillReceiveProps == "function" && le.componentWillReceiveProps.__suppressDeprecationWarning !== !0 ? Be = "componentWillReceiveProps" : typeof le.UNSAFE_componentWillReceiveProps == "function" && (Be = "UNSAFE_componentWillReceiveProps"), typeof le.componentWillUpdate == "function" && le.componentWillUpdate.__suppressDeprecationWarning !== !0 ? hn = "componentWillUpdate" : typeof le.UNSAFE_componentWillUpdate == "function" && (hn = "UNSAFE_componentWillUpdate"), Zn !== null || Be !== null || hn !== null) {
              var Pt = dn(h) || "Component", Ht = typeof h.getDerivedStateFromProps == "function" ? "getDerivedStateFromProps()" : "getSnapshotBeforeUpdate()";
              vs.has(Pt) || (vs.add(
                Pt
              ), console.error(
                `Unsafe legacy lifecycles will not be called for components using new component APIs.

%s uses %s but also contains the following legacy lifecycles:%s%s%s

The above lifecycles should be removed. Learn more about this warning here:
https://react.dev/link/unsafe-component-lifecycles`,
                Pt,
                Ht,
                Zn !== null ? `
  ` + Zn : "",
                Be !== null ? `
  ` + Be : "",
                hn !== null ? `
  ` + hn : ""
              ));
            }
          }
          var Fn = dn(h) || "Component";
          le.render || (h.prototype && typeof h.prototype.render == "function" ? console.error(
            "No `render` method found on the %s instance: did you accidentally return an object from the constructor?",
            Fn
          ) : console.error(
            "No `render` method found on the %s instance: you may have forgotten to define `render`.",
            Fn
          )), !le.getInitialState || le.getInitialState.isReactClassApproved || le.state || console.error(
            "getInitialState was defined on %s, a plain JavaScript class. This is only supported for classes created using React.createClass. Did you mean to define a state property instead?",
            Fn
          ), le.getDefaultProps && !le.getDefaultProps.isReactClassApproved && console.error(
            "getDefaultProps was defined on %s, a plain JavaScript class. This is only supported for classes created using React.createClass. Use a static property to define defaultProps instead.",
            Fn
          ), le.contextType && console.error(
            "contextType was defined as an instance property on %s. Use a static property to define contextType instead.",
            Fn
          ), h.childContextTypes && !yu.has(h) && (yu.add(h), console.error(
            "%s uses the legacy childContextTypes API which was removed in React 19. Use React.createContext() instead. (https://react.dev/link/legacy-context)",
            Fn
          )), h.contextTypes && !ys.has(h) && (ys.add(h), console.error(
            "%s uses the legacy contextTypes API which was removed in React 19. Use React.createContext() with static contextType instead. (https://react.dev/link/legacy-context)",
            Fn
          )), typeof le.componentShouldUpdate == "function" && console.error(
            "%s has a method called componentShouldUpdate(). Did you mean shouldComponentUpdate()? The name is phrased as a question because the function is expected to return a value.",
            Fn
          ), h.prototype && h.prototype.isPureReactComponent && typeof le.shouldComponentUpdate < "u" && console.error(
            "%s has a method called shouldComponentUpdate(). shouldComponentUpdate should not be used when extending React.PureComponent. Please extend React.Component if shouldComponentUpdate is used.",
            dn(h) || "A pure component"
          ), typeof le.componentDidUnmount == "function" && console.error(
            "%s has a method called componentDidUnmount(). But there is no such lifecycle method. Did you mean componentWillUnmount()?",
            Fn
          ), typeof le.componentDidReceiveProps == "function" && console.error(
            "%s has a method called componentDidReceiveProps(). But there is no such lifecycle method. If you meant to update the state in response to changing props, use componentWillReceiveProps(). If you meant to fetch data or run side-effects or mutations after React has updated the UI, use componentDidUpdate().",
            Fn
          ), typeof le.componentWillRecieveProps == "function" && console.error(
            "%s has a method called componentWillRecieveProps(). Did you mean componentWillReceiveProps()?",
            Fn
          ), typeof le.UNSAFE_componentWillRecieveProps == "function" && console.error(
            "%s has a method called UNSAFE_componentWillRecieveProps(). Did you mean UNSAFE_componentWillReceiveProps()?",
            Fn
          );
          var Le = le.props !== U;
          le.props !== void 0 && Le && console.error(
            "When calling super() in `%s`, make sure to pass up the same props that your component's constructor was passed.",
            Fn
          ), le.defaultProps && console.error(
            "Setting defaultProps as an instance property on %s is not supported and will be ignored. Instead, define defaultProps as a static property on %s.",
            Fn,
            Fn
          ), typeof le.getSnapshotBeforeUpdate != "function" || typeof le.componentDidUpdate == "function" || so.has(h) || (so.add(h), console.error(
            "%s: getSnapshotBeforeUpdate() should be used with componentDidUpdate(). This component defines getSnapshotBeforeUpdate() only.",
            dn(h)
          )), typeof le.getDerivedStateFromProps == "function" && console.error(
            "%s: getDerivedStateFromProps() is defined as an instance method and will be ignored. Instead, declare it as a static method.",
            Fn
          ), typeof le.getDerivedStateFromError == "function" && console.error(
            "%s: getDerivedStateFromError() is defined as an instance method and will be ignored. Instead, declare it as a static method.",
            Fn
          ), typeof h.getSnapshotBeforeUpdate == "function" && console.error(
            "%s: getSnapshotBeforeUpdate() is defined as a static method and will be ignored. Instead, declare it as an instance method.",
            Fn
          );
          var Ut = le.state;
          Ut && (typeof Ut != "object" || xi(Ut)) && console.error("%s.state: must be set to an object or null", Fn), typeof le.getChildContext == "function" && typeof h.childContextTypes != "object" && console.error(
            "%s.getChildContext(): childContextTypes must be defined in order to use getChildContext().",
            Fn
          );
          var Lr = le.state !== void 0 ? le.state : null;
          le.updater = Ss, le.props = U, le.state = Lr;
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
          var pr = h.getDerivedStateFromProps;
          if (typeof pr == "function") {
            var nr = pr(
              U,
              Lr
            );
            if (nr === void 0) {
              var st = dn(h) || "Component";
              Qo.has(st) || (Qo.add(st), console.error(
                "%s.getDerivedStateFromProps(): A valid state object (or null) must be returned. You have returned undefined.",
                st
              ));
            }
            var Vt = nr == null ? Lr : qn({}, Lr, nr);
            le.state = Vt;
          }
          if (typeof h.getDerivedStateFromProps != "function" && typeof le.getSnapshotBeforeUpdate != "function" && (typeof le.UNSAFE_componentWillMount == "function" || typeof le.componentWillMount == "function")) {
            var ul = le.state;
            if (typeof le.componentWillMount == "function") {
              if (le.componentWillMount.__suppressDeprecationWarning !== !0) {
                var Al = dn(h) || "Unknown";
                gu[Al] || (console.warn(
                  `componentWillMount has been renamed, and is not recommended for use. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move code from componentWillMount to componentDidMount (preferred in most cases) or the constructor.

Please update the following components: %s`,
                  Al
                ), gu[Al] = !0);
              }
              le.componentWillMount();
            }
            if (typeof le.UNSAFE_componentWillMount == "function" && le.UNSAFE_componentWillMount(), ul !== le.state && (console.error(
              "%s.componentWillMount(): Assigning directly to this.state is deprecated (except inside a component's constructor). Use setState instead.",
              dn(h) || "Component"
            ), Ss.enqueueReplaceState(
              le,
              le.state,
              null
            )), Qn.queue !== null && 0 < Qn.queue.length) {
              var tr = Qn.queue, xt = Qn.replace;
              if (Qn.queue = null, Qn.replace = !1, xt && tr.length === 1)
                le.state = tr[0];
              else {
                for (var _r = xt ? tr[0] : le.state, sl = !0, Br = xt ? 1 : 0; Br < tr.length; Br++) {
                  var na = tr[Br], fl = typeof na == "function" ? na.call(
                    le,
                    _r,
                    U,
                    void 0
                  ) : na;
                  fl != null && (sl ? (sl = !1, _r = qn(
                    {},
                    _r,
                    fl
                  )) : qn(_r, fl));
                }
                le.state = _r;
              }
            } else Qn.queue = null;
          }
          var Wt = Pn(le);
          if (e.status === 12) throw null;
          le.props !== U && (ol || console.error(
            "It looks like %s is reassigning its own `this.props` while rendering. This is not supported and can lead to confusing bugs.",
            dn(h) || "a component"
          ), ol = !0);
          var zl = t.keyPath;
          t.keyPath = c, Gr(e, t, Wt, -1), t.keyPath = zl;
        } else {
          if (h.prototype && typeof h.prototype.render == "function") {
            var ur = dn(h) || "Unknown";
            wr[ur] || (console.error(
              "The <%s /> component appears to have a render method, but doesn't extend React.Component. This is likely to cause errors. Change %s to extend React.Component instead.",
              ur,
              ur
            ), wr[ur] = !0);
          }
          var Qu = Nt(
            e,
            t,
            c,
            h,
            y,
            void 0
          );
          if (e.status === 12) throw null;
          var Fi = zt !== 0, Ft = Mc, Hl = wu;
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
            var Nc = dn(h) || "Unknown";
            Ko[Nc] || (console.error(
              "%s: Function components do not support getDerivedStateFromProps.",
              Nc
            ), Ko[Nc] = !0);
          }
          if (typeof h.contextType == "object" && h.contextType !== null) {
            var jo = dn(h) || "Unknown";
            al[jo] || (console.error(
              "%s: Function components do not support contextType.",
              jo
            ), al[jo] = !0);
          }
          Hi(
            e,
            t,
            c,
            Qu,
            Fi,
            Ft,
            Hl
          );
        }
      else if (typeof h == "string") {
        var ci = t.blockedSegment;
        if (ci === null) {
          var qo = y.children, hl = t.formatContext, Lc = t.keyPath;
          t.formatContext = we(hl, h, y), t.keyPath = c, qt(e, t, qo, -1), t.formatContext = hl, t.keyPath = Lc;
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
          var Ul = t.formatContext, _c = t.keyPath;
          if (t.keyPath = c, (t.formatContext = we(
            Ul,
            h,
            y
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
              Hr.status = 6, qt(e, t, Ju, -1), Hr.lastPushedText && Hr.textEmbedded && Hr.chunks.push(_t), Hr.status = Un, ei(e, t.blockedBoundary, Hr);
            } finally {
              t.blockedSegment = ci;
            }
          } else qt(e, t, Ju, -1);
          t.formatContext = Ul, t.keyPath = _c;
          e: {
            var $o = ci.chunks, go = e.resumableState;
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
                if (Ul.insertionMode <= Ta) {
                  go.hasBody = !0;
                  break e;
                }
                break;
              case "html":
                if (Ul.insertionMode === Lo) {
                  go.hasHtml = !0;
                  break e;
                }
                break;
              case "head":
                if (Ul.insertionMode <= Ta) break e;
            }
            $o.push(dt(h));
          }
          ci.lastPushedText = !1;
        }
      } else {
        switch (h) {
          case Rs:
          case wc:
          case pc:
          case Yi:
            var Oa = t.keyPath;
            t.keyPath = c, Gr(e, t, y.children, -1), t.keyPath = Oa;
            return;
          case ir:
            var Wl = t.blockedSegment;
            if (Wl === null) {
              if (y.mode !== "hidden") {
                var Yl = t.keyPath;
                t.keyPath = c, qt(e, t, y.children, -1), t.keyPath = Yl;
              }
            } else if (y.mode !== "hidden") {
              Wl.chunks.push(Wu), Wl.lastPushedText = !1;
              var Oi = t.keyPath;
              t.keyPath = c, qt(e, t, y.children, -1), t.keyPath = Oi, Wl.chunks.push(ou), Wl.lastPushedText = !1;
            }
            return;
          case Ga:
            e: {
              var dl = y.children, Tr = y.revealOrder;
              if (Tr === "forwards" || Tr === "backwards" || Tr === "unstable_legacy-backwards") {
                if (xi(dl)) {
                  zi(
                    e,
                    t,
                    c,
                    dl,
                    Tr
                  );
                  break e;
                }
                var Ma = W(dl);
                if (Ma) {
                  var Mi = Ma.call(dl);
                  if (Mi) {
                    Ua(
                      t,
                      dl,
                      -1,
                      Mi,
                      Ma
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
                        Tr
                      );
                    }
                    break e;
                  }
                }
              }
              if (Tr === "together") {
                var ps = t.keyPath, Kr = t.row, ui = t.row = pi(null);
                ui.boundaries = [], ui.together = !0, t.keyPath = c, Gr(e, t, dl, -1), --ui.pendingTasks === 0 && Qt(e, ui), t.keyPath = ps, t.row = Kr, Kr !== null && 0 < ui.pendingTasks && (Kr.pendingTasks++, ui.next = Kr);
              } else {
                var Bc = t.keyPath;
                t.keyPath = c, Gr(e, t, dl, -1), t.keyPath = Bc;
              }
            }
            return;
          case as:
          case Du:
            throw Error(
              "ReactDOMServer does not yet support scope components."
            );
          case ya:
            e: if (t.replay !== null) {
              var pu = t.keyPath, Tu = t.formatContext, Xs = t.row;
              t.keyPath = c, t.formatContext = _e(
                e.resumableState,
                Tu
              ), t.row = null;
              var yo = y.children;
              try {
                qt(e, t, yo, -1);
              } finally {
                t.keyPath = pu, t.formatContext = Tu, t.row = Xs;
              }
            } else {
              var ec = t.keyPath, bo = t.formatContext, xu = t.row, Ls = t.blockedBoundary, ks = t.blockedPreamble, jr = t.hoistableState, Ii = t.blockedSegment, wo = y.fallback, Vu = y.children, Gl = /* @__PURE__ */ new Set(), Yt = t.formatContext.insertionMode < Sr ? Ni(
                e,
                t.row,
                Gl,
                fe(),
                fe()
              ) : Ni(
                e,
                t.row,
                Gl,
                null,
                null
              );
              e.trackedPostpones !== null && (Yt.trackedContentKeyPath = c);
              var Et = Li(
                e,
                Ii.chunks.length,
                Yt,
                t.formatContext,
                !1,
                !1
              );
              Ii.children.push(Et), Ii.lastPushedText = !1;
              var et = Li(
                e,
                0,
                null,
                t.formatContext,
                !1,
                !1
              );
              if (et.parentFlushed = !0, e.trackedPostpones !== null) {
                var As = t.componentStack, nc = [
                  c[0],
                  "Suspense Fallback",
                  c[2]
                ], Ku = [
                  nc[1],
                  nc[2],
                  [],
                  null
                ];
                e.trackedPostpones.workingMap.set(
                  nc,
                  Ku
                ), Yt.trackedFallbackNode = Ku, t.blockedSegment = Et, t.blockedPreamble = Yt.fallbackPreamble, t.keyPath = nc, t.formatContext = me(
                  e.resumableState,
                  bo
                ), t.componentStack = Po(
                  As
                ), Et.status = 6;
                try {
                  qt(e, t, wo, -1), Et.lastPushedText && Et.textEmbedded && Et.chunks.push(_t), Et.status = Un, ei(e, Ls, Et);
                } catch (Qs) {
                  throw Et.status = e.status === 12 ? Tt : pn, Qs;
                } finally {
                  t.blockedSegment = Ii, t.blockedPreamble = ks, t.keyPath = ec, t.formatContext = bo;
                }
                var tc = jl(
                  e,
                  null,
                  Vu,
                  -1,
                  Yt,
                  et,
                  Yt.contentPreamble,
                  Yt.contentState,
                  t.abortSet,
                  c,
                  _e(
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
                Bi(tc), e.pingedTasks.push(tc);
              } else {
                t.blockedBoundary = Yt, t.blockedPreamble = Yt.contentPreamble, t.hoistableState = Yt.contentState, t.blockedSegment = et, t.keyPath = c, t.formatContext = _e(
                  e.resumableState,
                  bo
                ), t.row = null, et.status = 6;
                try {
                  if (qt(e, t, Vu, -1), et.lastPushedText && et.textEmbedded && et.chunks.push(_t), et.status = Un, ei(e, Yt, et), Io(Yt, et), Yt.pendingTasks === 0 && Yt.status === Hn) {
                    if (Yt.status = Un, !Wr(e, Yt)) {
                      xu !== null && --xu.pendingTasks === 0 && Qt(e, xu), e.pendingRootTasks === 0 && t.blockedPreamble && Ya(e);
                      break e;
                    }
                  } else
                    xu !== null && xu.together && za(e, xu);
                } catch (Qs) {
                  if (Yt.status = Me, e.status === 12) {
                    et.status = Tt;
                    var zc = e.fatalError;
                  } else
                    et.status = pn, zc = Qs;
                  var ju = $e(t.componentStack), Hc = Dt(
                    e,
                    zc,
                    ju,
                    t.debugTask
                  );
                  ql(
                    Yt,
                    Hc,
                    zc,
                    ju,
                    !1
                  ), Fo(e, Yt);
                } finally {
                  t.blockedBoundary = Ls, t.blockedPreamble = ks, t.hoistableState = jr, t.blockedSegment = Ii, t.keyPath = ec, t.formatContext = bo, t.row = xu;
                }
                var Eu = jl(
                  e,
                  null,
                  wo,
                  -1,
                  Ls,
                  Et,
                  Yt.fallbackPreamble,
                  Yt.fallbackState,
                  Gl,
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
                Bi(Eu), e.pingedTasks.push(Eu);
              }
            }
            return;
        }
        if (typeof h == "object" && h !== null)
          switch (h.$$typeof) {
            case mn:
              if ("ref" in y) {
                var Ru = {};
                for (var Ts in y)
                  Ts !== "ref" && (Ru[Ts] = y[Ts]);
              } else Ru = y;
              var Ps = Nt(
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
                zt !== 0,
                Mc,
                wu
              );
              return;
            case Xa:
              Ui(e, t, c, h.type, y, x);
              return;
            case it:
              var _s = y.value, qu = y.children, $u = t.context, Uc = t.keyPath, po = h._currentValue;
              h._currentValue = _s, h._currentRenderer !== void 0 && h._currentRenderer !== null && h._currentRenderer !== Pa && console.error(
                "Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported."
              ), h._currentRenderer = Pa;
              var Ia = qi, gl = {
                parent: Ia,
                depth: Ia === null ? 0 : Ia.depth + 1,
                context: h,
                parentValue: po,
                value: _s
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
              var Bs = qi = Cu.parent;
              t.context = Bs, t.keyPath = Uc, $u !== t.context && console.error(
                "Popping the context provider did not return back to the original snapshot. This is a bug in React."
              );
              return;
            case Xr:
              var Zs = h._context, Fs = y.children;
              typeof Fs != "function" && console.error(
                "A context consumer was rendered with multiple children, or a child that isn't a function. A context consumer expects a single child that is a function. If you did pass a function, make sure there is no trailing or leading whitespace around it."
              );
              var cf = Fs(Zs._currentValue), xs = t.keyPath;
              t.keyPath = c, Gr(e, t, cf, -1), t.keyPath = xs;
              return;
            case ba:
              var uf = br(h);
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
      var x = t.replay, k = t.blockedBoundary, M = Li(
        e,
        0,
        null,
        t.formatContext,
        !1,
        !1
      );
      M.id = c, M.parentFlushed = !0;
      try {
        t.replay = null, t.blockedSegment = M, qt(e, t, h, y), M.status = Un, ei(e, k, M), k === null ? e.completedRootSegment = M : (Io(k, M), k.parentFlushed && e.partialBoundaries.push(k));
      } finally {
        t.replay = x, t.blockedSegment = null;
      }
    }
    function fa(e, t, c, h, y, x, k, M, V, _) {
      x = _.nodes;
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
              if (Ui(e, t, c, k, M, V), t.replay.pendingTasks === 1 && 0 < t.replay.nodes.length)
                throw Error(
                  "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                );
              t.replay.pendingTasks--;
            } catch (Le) {
              if (typeof Le == "object" && Le !== null && (Le === mi || typeof Le.then == "function"))
                throw t.node === y ? t.replay = _ : x.splice(U, 1), Le;
              t.replay.pendingTasks--, k = $e(t.componentStack), M = e, e = t.blockedBoundary, c = Le, V = h, h = Dt(M, c, k, t.debugTask), ha(
                M,
                e,
                se,
                V,
                c,
                h,
                k,
                !1
              );
            }
            t.replay = _;
          } else {
            if (k !== ya)
              throw Error(
                "Expected the resume to render <Suspense> in this slot but instead it rendered <" + (dn(k) || "Unknown") + ">. The tree doesn't match so React will fallback to client rendering."
              );
            e: {
              _ = void 0, h = oe[5], k = oe[2], V = oe[3], y = oe[4] === null ? [] : oe[4][2], oe = oe[4] === null ? null : oe[4][3];
              var ce = t.keyPath, le = t.formatContext, Ue = t.row, Zn = t.replay, Be = t.blockedBoundary, hn = t.hoistableState, Pt = M.children, Ht = M.fallback, Fn = /* @__PURE__ */ new Set();
              M = t.formatContext.insertionMode < Sr ? Ni(
                e,
                t.row,
                Fn,
                fe(),
                fe()
              ) : Ni(
                e,
                t.row,
                Fn,
                null,
                null
              ), M.parentFlushed = !0, M.rootSegmentID = h, t.blockedBoundary = M, t.hoistableState = M.contentState, t.keyPath = c, t.formatContext = _e(
                e.resumableState,
                le
              ), t.row = null, t.replay = { nodes: k, slots: V, pendingTasks: 1 };
              try {
                if (qt(e, t, Pt, -1), t.replay.pendingTasks === 1 && 0 < t.replay.nodes.length)
                  throw Error(
                    "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                  );
                if (t.replay.pendingTasks--, M.pendingTasks === 0 && M.status === Hn) {
                  M.status = Un, e.completedBoundaries.push(M);
                  break e;
                }
              } catch (Le) {
                M.status = Me, se = $e(t.componentStack), _ = Dt(
                  e,
                  Le,
                  se,
                  t.debugTask
                ), ql(M, _, Le, se, !1), t.replay.pendingTasks--, e.clientRenderedBoundaries.push(M);
              } finally {
                t.blockedBoundary = Be, t.hoistableState = hn, t.replay = Zn, t.keyPath = ce, t.formatContext = le, t.row = Ue;
              }
              M = Pu(
                e,
                null,
                { nodes: y, slots: oe, pendingTasks: 0 },
                Ht,
                -1,
                Be,
                M.fallbackState,
                Fn,
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
              ), Bi(M), e.pingedTasks.push(M);
            }
          }
          x.splice(U, 1);
          break;
        }
      }
    }
    function Ua(e, t, c, h, y) {
      h === t ? (c !== -1 || e.componentStack === null || typeof e.componentStack.type != "function" || Object.prototype.toString.call(e.componentStack.type) !== "[object GeneratorFunction]" || Object.prototype.toString.call(h) !== "[object Generator]") && (ki || console.error(
        "Using Iterators as children is unsupported and will likely yield unexpected results because enumerating a generator mutates it. You may convert it to an array with `Array.from()` or the `[...spread]` operator before rendering. You can also use an Iterable that can iterate multiple times over the same items."
      ), ki = !0) : t.entries !== y || Ai || (console.error(
        "Using Maps as children is not supported. Use an array of keyed ReactElements instead."
      ), Ai = !0);
    }
    function Gr(e, t, c, h) {
      t.replay !== null && typeof t.replay.slots == "number" ? Ha(e, t, t.replay.slots, c, h) : (t.node = c, t.childIndex = h, c = t.componentStack, h = t.debugTask, Bi(t), Wa(e, t), t.componentStack = c, t.debugTask = h);
    }
    function Wa(e, t) {
      var c = t.node, h = t.childIndex;
      if (c !== null) {
        if (typeof c == "object") {
          switch (c.$$typeof) {
            case jc:
              var y = c.type, x = c.key;
              c = c.props;
              var k = c.ref;
              k = k !== void 0 ? k : null;
              var M = t.debugTask, V = dn(y);
              x = x ?? (h === -1 ? 0 : h);
              var _ = [t.keyPath, V, x];
              t.replay !== null ? M ? M.run(
                fa.bind(
                  null,
                  e,
                  t,
                  _,
                  V,
                  x,
                  h,
                  y,
                  c,
                  k,
                  t.replay
                )
              ) : fa(
                e,
                t,
                _,
                V,
                x,
                h,
                y,
                c,
                k,
                t.replay
              ) : M ? M.run(
                Ui.bind(
                  null,
                  e,
                  t,
                  _,
                  y,
                  c,
                  k
                )
              ) : Ui(e, t, _, y, c, k);
              return;
            case bc:
              throw Error(
                "Portals are not currently supported by the server renderer. Render them conditionally so that they only appear on the client render."
              );
            case ba:
              if (y = br(c), e.status === 12) throw null;
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
        typeof c == "string" ? (t = t.blockedSegment, t !== null && (t.lastPushedText = ke(
          t.chunks,
          c,
          e.renderState,
          t.lastPushedText
        ))) : typeof c == "number" || typeof c == "bigint" ? (t = t.blockedSegment, t !== null && (t.lastPushedText = ke(
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
            var k = dn(x.type);
            k && (e = `

Check the render method of \`` + k + "`.");
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
      var y = t.keyPath, x = t.componentStack, k = t.debugTask;
      if (_i(t, t.node._debugInfo), h !== -1 && (t.keyPath = [t.keyPath, "Fragment", h], t.replay !== null)) {
        for (var M = t.replay, V = M.nodes, _ = 0; _ < V.length; _++) {
          var U = V[_];
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
              U = Dt(
                e,
                se,
                oe,
                t.debugTask
              ), ha(
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
            t.replay = M, V.splice(_, 1);
            break;
          }
        }
        t.keyPath = y, t.componentStack = x, t.debugTask = k;
        return;
      }
      if (M = t.treeContext, V = c.length, t.replay !== null && (_ = t.replay.slots, _ !== null && typeof _ == "object")) {
        for (h = 0; h < V; h++)
          U = c[h], t.treeContext = _a(
            M,
            V,
            h
          ), se = _[h], typeof se == "number" ? (Ha(e, t, se, U, h), delete _[h]) : qt(e, t, U, h);
        t.treeContext = M, t.keyPath = y, t.componentStack = x, t.debugTask = k;
        return;
      }
      for (_ = 0; _ < V; _++)
        h = c[_], $l(e, t, h), t.treeContext = _a(M, V, _), qt(e, t, h, _);
      t.treeContext = M, t.keyPath = y, t.componentStack = x, t.debugTask = k;
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
      ], t.workingMap.set(e, c), Rl(c, e[0], t), c) : (x[4] = h, x[5] = c.rootSegmentID, x);
    }
    function Mu(e, t, c, h) {
      h.status = tn;
      var y = c.keyPath, x = c.blockedBoundary;
      if (x === null)
        h.id = e.nextSegmentId++, t.rootSlots = h.id, e.completedRootSegment !== null && (e.completedRootSegment.status = tn);
      else {
        if (x !== null && x.status === Hn) {
          var k = Ou(
            e,
            t,
            x
          );
          if (x.trackedContentKeyPath === y && c.childIndex === -1) {
            h.id === -1 && (h.id = h.parentFlushed ? x.rootSegmentID : e.nextSegmentId++), k[3] = h.id;
            return;
          }
        }
        if (h.id === -1 && (h.id = h.parentFlushed && x !== null ? x.rootSegmentID : e.nextSegmentId++), c.childIndex === -1)
          y === null ? t.rootSlots = h.id : (c = t.workingMap.get(y), c === void 0 ? (c = [y[1], y[2], [], h.id], Rl(c, y[0], t)) : c[3] = h.id);
        else {
          if (y === null) {
            if (e = t.rootSlots, e === null)
              e = t.rootSlots = {};
            else if (typeof e == "number")
              throw Error(
                "It should not be possible to postpone both at the root of an element as well as a slot below. This is a bug in React."
              );
          } else if (x = t.workingMap, k = x.get(y), k === void 0)
            e = {}, k = [y[1], y[2], [], e], x.set(y, k), Rl(k, y[0], t);
          else if (e = k[3], e === null)
            e = k[3] = {};
          else if (typeof e == "number")
            throw Error(
              "It should not be possible to postpone both at the root of an element as well as a slot below. This is a bug in React."
            );
          e[c.childIndex] = h.id;
        }
      }
    }
    function Fo(e, t) {
      e = e.trackedPostpones, e !== null && (t = t.trackedContentKeyPath, t !== null && (t = e.workingMap.get(t), t !== void 0 && (t.length = 4, t[2] = [], t[3] = null)));
    }
    function Oo(e, t, c) {
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
    function Mo(e, t, c) {
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
    function qt(e, t, c, h) {
      var y = t.formatContext, x = t.context, k = t.keyPath, M = t.treeContext, V = t.componentStack, _ = t.debugTask, U = t.blockedSegment;
      if (U === null) {
        U = t.replay;
        try {
          return Gr(e, t, c, h);
        } catch (ce) {
          if (Ba(), c = ce === mi ? Su() : ce, e.status !== 12 && typeof c == "object" && c !== null) {
            if (typeof c.then == "function") {
              h = ce === mi ? pl() : null, e = Oo(
                e,
                t,
                h
              ).ping, c.then(e, e), t.formatContext = y, t.context = x, t.keyPath = k, t.treeContext = M, t.componentStack = V, t.replay = U, t.debugTask = _, Cn(x);
              return;
            }
            if (c.message === "Maximum call stack size exceeded") {
              c = ce === mi ? pl() : null, c = Oo(e, t, c), e.pingedTasks.push(c), t.formatContext = y, t.context = x, t.keyPath = k, t.treeContext = M, t.componentStack = V, t.replay = U, t.debugTask = _, Cn(x);
              return;
            }
          }
        }
      } else {
        var oe = U.children.length, se = U.chunks.length;
        try {
          return Gr(e, t, c, h);
        } catch (ce) {
          if (Ba(), U.children.length = oe, U.chunks.length = se, c = ce === mi ? Su() : ce, e.status !== 12 && typeof c == "object" && c !== null) {
            if (typeof c.then == "function") {
              U = c, c = ce === mi ? pl() : null, e = Mo(e, t, c).ping, U.then(e, e), t.formatContext = y, t.context = x, t.keyPath = k, t.treeContext = M, t.componentStack = V, t.debugTask = _, Cn(x);
              return;
            }
            if (c.message === "Maximum call stack size exceeded") {
              U = ce === mi ? pl() : null, U = Mo(e, t, U), e.pingedTasks.push(U), t.formatContext = y, t.context = x, t.keyPath = k, t.treeContext = M, t.componentStack = V, t.debugTask = _, Cn(x);
              return;
            }
          }
        }
      }
      throw t.formatContext = y, t.context = x, t.keyPath = k, t.treeContext = M, Cn(x), c;
    }
    function is(e) {
      var t = e.blockedBoundary, c = e.blockedSegment;
      c !== null && (c.status = Tt, ga(this, t, e.row, c));
    }
    function ha(e, t, c, h, y, x, k, M) {
      for (var V = 0; V < c.length; V++) {
        var _ = c[V];
        if (_.length === 4)
          ha(
            e,
            t,
            _[2],
            _[3],
            y,
            x,
            k,
            M
          );
        else {
          var U = e;
          _ = _[5];
          var oe = y, se = x, ce = k, le = M, Ue = Ni(
            U,
            null,
            /* @__PURE__ */ new Set(),
            null,
            null
          );
          Ue.parentFlushed = !0, Ue.rootSegmentID = _, Ue.status = Me, ql(
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
          k,
          M
        ), t.parentFlushed && e.clientRenderedBoundaries.push(t)), typeof h == "object")
          for (var Zn in h) delete h[Zn];
      }
    }
    function gc(e, t, c) {
      var h = e.blockedBoundary, y = e.blockedSegment;
      if (y !== null) {
        if (y.status === 6) return;
        y.status = Tt;
      }
      var x = $e(e.componentStack), k = e.node;
      if (k !== null && typeof k == "object" && Ao(e, k._debugInfo), h === null) {
        if (t.status !== 13 && t.status !== Nr) {
          if (h = e.replay, h === null) {
            t.trackedPostpones !== null && y !== null ? (h = t.trackedPostpones, Dt(t, c, x, e.debugTask), Mu(t, h, e, y), ga(t, null, e.row, y)) : (Dt(t, c, x, e.debugTask), wi(t, c, x, e.debugTask));
            return;
          }
          h.pendingTasks--, h.pendingTasks === 0 && 0 < h.nodes.length && (y = Dt(t, c, x, null), ha(
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
        if (k = t.trackedPostpones, h.status !== Me) {
          if (k !== null && y !== null)
            return Dt(t, c, x, e.debugTask), Mu(t, k, e, y), h.fallbackAbortableTasks.forEach(function(M) {
              return gc(M, t, c);
            }), h.fallbackAbortableTasks.clear(), ga(t, h, e.row, y);
          h.status = Me, y = Dt(
            t,
            c,
            x,
            e.debugTask
          ), h.status = Me, ql(h, y, c, x, !0), Fo(t, h), h.parentFlushed && t.clientRenderedBoundaries.push(h);
        }
        h.pendingTasks--, x = h.row, x !== null && --x.pendingTasks === 0 && Qt(t, x), h.fallbackAbortableTasks.forEach(function(M) {
          return gc(M, t, c);
        }), h.fallbackAbortableTasks.clear();
      }
      e = e.row, e !== null && --e.pendingTasks === 0 && Qt(t, e), t.allPendingTasks--, t.allPendingTasks === 0 && da(t);
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
              var k = c.styles.values(), M = k.next();
              e: for (; 0 < y.remainingCapacity && !M.done; M = k.next())
                for (var V = M.value.sheets.values(), _ = V.next(); 0 < y.remainingCapacity && !_.done; _ = V.next()) {
                  var U = _.value, oe = U.props, se = oe.href, ce = U.props, le = ca(
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
                    c.resets.style[se] = $t, x && (x += ", "), x += le, c.resets.style[se] = typeof oe.crossOrigin == "string" || typeof oe.integrity == "string" ? [oe.crossOrigin, oe.integrity] : $t;
                  else break e;
                }
            }
            h(x ? { Link: x } : {});
          }
        }
      } catch (Ue) {
        Dt(e, Ue, {}, null);
      }
    }
    function Wi(e) {
      e.trackedPostpones === null && Qc(e, !0), e.trackedPostpones === null && Ya(e), e.onShellError = Rr, e = e.onShellReady, e();
    }
    function da(e) {
      Qc(
        e,
        e.trackedPostpones === null ? !0 : e.completedRootSegment === null || e.completedRootSegment.status !== tn
      ), Ya(e), e = e.onAllReady, e();
    }
    function Io(e, t) {
      if (t.chunks.length === 0 && t.children.length === 1 && t.children[0].boundary === null && t.children[0].id === -1) {
        var c = t.children[0];
        c.id = t.id, c.parentFlushed = !0, c.status !== Un && c.status !== Tt && c.status !== pn || Io(e, c);
      } else e.completedSegments.push(t);
    }
    function ei(e, t, c) {
      if (ht !== null) {
        c = c.chunks;
        for (var h = 0, y = 0; y < c.length; y++)
          h += c[y].byteLength;
        t === null ? e.byteSize += h : t.byteSize += h;
      }
    }
    function ga(e, t, c, h) {
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
          if (t.status === Hn && (t.status = Un), h !== null && h.parentFlushed && (h.status === Un || h.status === Tt) && Io(t, h), t.parentFlushed && e.completedBoundaries.push(t), t.status === Un)
            c = t.row, c !== null && Rn(c.hoistables, t.contentState), Wr(e, t) || (t.fallbackAbortableTasks.forEach(
              is,
              e
            ), t.fallbackAbortableTasks.clear(), c !== null && --c.pendingTasks === 0 && Qt(e, c)), e.pendingRootTasks === 0 && e.trackedPostpones === null && t.contentPreamble !== null && Ya(e);
          else if (t.status === tn && (t = t.row, t !== null)) {
            if (e.trackedPostpones !== null) {
              c = e.trackedPostpones;
              var y = t.next;
              if (y !== null && (h = y.boundaries, h !== null))
                for (y.boundaries = null, y = 0; y < h.length; y++) {
                  var x = h[y];
                  Ou(e, c, x), ga(e, x, null, null);
                }
            }
            --t.pendingTasks === 0 && Qt(e, t);
          }
        } else
          h === null || !h.parentFlushed || h.status !== Un && h.status !== Tt || (Io(t, h), t.completedSegments.length === 1 && t.parentFlushed && e.partialBoundaries.push(t)), t = t.row, t !== null && t.together && za(e, t);
      e.allPendingTasks === 0 && da(e);
    }
    function va(e) {
      if (e.status !== Nr && e.status !== 13) {
        var t = qi, c = cn.H;
        cn.H = Dc;
        var h = cn.A;
        cn.A = u;
        var y = Wn;
        Wn = e;
        var x = cn.getCurrentStack;
        cn.getCurrentStack = bi;
        var k = n;
        n = e.resumableState;
        try {
          var M = e.pingedTasks, V;
          for (V = 0; V < M.length; V++) {
            var _ = e, U = M[V], oe = U.blockedSegment;
            if (oe === null) {
              var se = void 0, ce = _;
              if (_ = U, _.replay.pendingTasks !== 0) {
                Cn(_.context), se = r, r = _;
                try {
                  if (typeof _.replay.slots == "number" ? Ha(
                    ce,
                    _,
                    _.replay.slots,
                    _.node,
                    _.childIndex
                  ) : Wa(ce, _), _.replay.pendingTasks === 1 && 0 < _.replay.nodes.length)
                    throw Error(
                      "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                    );
                  _.replay.pendingTasks--, _.abortSet.delete(_), ga(
                    ce,
                    _.blockedBoundary,
                    _.row,
                    null
                  );
                } catch (xt) {
                  Ba();
                  var le = xt === mi ? Su() : xt;
                  if (typeof le == "object" && le !== null && typeof le.then == "function") {
                    var Ue = _.ping;
                    le.then(Ue, Ue), _.thenableState = xt === mi ? pl() : null;
                  } else {
                    _.replay.pendingTasks--, _.abortSet.delete(_);
                    var Zn = $e(_.componentStack), Be = void 0, hn = ce, Pt = _.blockedBoundary, Ht = ce.status === 12 ? ce.fatalError : le, Fn = Zn, Le = _.replay.nodes, Ut = _.replay.slots;
                    Be = Dt(
                      hn,
                      Ht,
                      Fn,
                      _.debugTask
                    ), ha(
                      hn,
                      Pt,
                      Le,
                      Ut,
                      Ht,
                      Be,
                      Fn,
                      !1
                    ), ce.pendingRootTasks--, ce.pendingRootTasks === 0 && Wi(ce), ce.allPendingTasks--, ce.allPendingTasks === 0 && da(ce);
                  }
                } finally {
                  r = se;
                }
              }
            } else if (ce = se = void 0, Be = U, hn = oe, hn.status === Hn) {
              hn.status = 6, Cn(Be.context), ce = r, r = Be;
              var Lr = hn.children.length, Qn = hn.chunks.length;
              try {
                Wa(_, Be), hn.lastPushedText && hn.textEmbedded && hn.chunks.push(_t), Be.abortSet.delete(Be), hn.status = Un, ei(
                  _,
                  Be.blockedBoundary,
                  hn
                ), ga(
                  _,
                  Be.blockedBoundary,
                  Be.row,
                  hn
                );
              } catch (xt) {
                Ba(), hn.children.length = Lr, hn.chunks.length = Qn;
                var ut = xt === mi ? Su() : _.status === 12 ? _.fatalError : xt;
                if (_.status === 12 && _.trackedPostpones !== null) {
                  var cl = _.trackedPostpones, pr = $e(Be.componentStack);
                  Be.abortSet.delete(Be), Dt(
                    _,
                    ut,
                    pr,
                    Be.debugTask
                  ), Mu(
                    _,
                    cl,
                    Be,
                    hn
                  ), ga(
                    _,
                    Be.blockedBoundary,
                    Be.row,
                    hn
                  );
                } else if (typeof ut == "object" && ut !== null && typeof ut.then == "function") {
                  hn.status = Hn, Be.thenableState = xt === mi ? pl() : null;
                  var nr = Be.ping;
                  ut.then(nr, nr);
                } else {
                  var st = $e(
                    Be.componentStack
                  );
                  Be.abortSet.delete(Be), hn.status = pn;
                  var Vt = Be.blockedBoundary, ul = Be.row, Al = Be.debugTask;
                  if (ul !== null && --ul.pendingTasks === 0 && Qt(_, ul), _.allPendingTasks--, se = Dt(
                    _,
                    ut,
                    st,
                    Al
                  ), Vt === null)
                    wi(
                      _,
                      ut,
                      st,
                      Al
                    );
                  else if (Vt.pendingTasks--, Vt.status !== Me) {
                    Vt.status = Me, ql(
                      Vt,
                      se,
                      ut,
                      st,
                      !1
                    ), Fo(_, Vt);
                    var tr = Vt.row;
                    tr !== null && --tr.pendingTasks === 0 && Qt(_, tr), Vt.parentFlushed && _.clientRenderedBoundaries.push(Vt), _.pendingRootTasks === 0 && _.trackedPostpones === null && Vt.contentPreamble !== null && Ya(_);
                  }
                  _.allPendingTasks === 0 && da(_);
                }
              } finally {
                r = ce;
              }
            }
          }
          M.splice(0, V), e.destination !== null && Tl(
            e,
            e.destination
          );
        } catch (xt) {
          M = {}, Dt(e, xt, M, null), wi(e, xt, M, null);
        } finally {
          n = k, cn.H = c, cn.A = h, cn.getCurrentStack = x, c === Dc && Cn(t), Wn = y;
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
          if (xo(e.renderState, y), e.byteSize += h.byteSize, t = h.completedSegments[0], !t)
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
            return xo(e.renderState, x), Iu(
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
    function Lt(e, t, c, h) {
      switch (c.parentFlushed = !0, c.status) {
        case Hn:
          c.id = e.nextSegmentId++;
        case tn:
          return h = c.id, c.lastPushedText = !1, c.textEmbedded = !1, e = e.renderState, P(t, Pc), P(t, e.placeholderPrefix), e = ee(h.toString(16)), P(t, e), N(t, au);
        case Un:
          c.status = Xn;
          var y = !0, x = c.chunks, k = 0;
          c = c.children;
          for (var M = 0; M < c.length; M++) {
            for (y = c[M]; k < y.index; k++)
              P(t, x[k]);
            y = Ti(e, t, y, h);
          }
          for (; k < x.length - 1; k++)
            P(t, x[k]);
          return k < x.length && (y = N(t, x[k])), y;
        case Tt:
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
        return Lt(e, t, c, h);
      if (y.parentFlushed = !0, y.status === Me) {
        var x = y.row;
        x !== null && --x.pendingTasks === 0 && Qt(e, x), x = y.errorDigest;
        var k = y.errorMessage, M = y.errorStack;
        y = y.errorComponentStack, N(t, us), P(t, Fc), x && (P(t, Ho), P(t, ee(Pe(x))), P(
          t,
          ri
        )), k && (P(t, ma), P(
          t,
          ee(Pe(k))
        ), P(
          t,
          ri
        )), M && (P(t, Oc), P(
          t,
          ee(Pe(M))
        ), P(
          t,
          ri
        )), y && (P(t, Sa), P(
          t,
          ee(Pe(y))
        ), P(
          t,
          ri
        )), N(t, ss), Lt(e, t, c, h);
      } else if (y.status !== Un)
        y.status === Hn && (y.rootSegmentID = e.nextSegmentId++), 0 < y.completedSegments.length && e.partialBoundaries.push(y), el(
          t,
          e.renderState,
          y.rootSegmentID
        ), h && Rn(h, y.fallbackState), Lt(e, t, c, h);
      else if (!cr && Wr(e, y) && (Pi + y.byteSize > e.progressiveChunkSize || ns(y.contentState)))
        y.rootSegmentID = e.nextSegmentId++, e.completedBoundaries.push(y), el(
          t,
          e.renderState,
          y.rootSegmentID
        ), Lt(e, t, c, h);
      else {
        if (Pi += y.byteSize, h && Rn(h, y.contentState), c = y.row, c !== null && Wr(e, y) && --c.pendingTasks === 0 && Qt(e, c), N(t, cu), c = y.completedSegments, c.length !== 1)
          throw Error(
            "A previously unvisited boundary must have exactly one root segment. This is a bug in React."
          );
        Ti(e, t, c[0], h);
      }
      return N(t, to);
    }
    function vc(e, t, c, h) {
      return oa(
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
      return e.stylesToHoist = !1, P(t, e.startInlineScript), P(t, bt), x ? ((h.instructions & Dn) === yt && (h.instructions |= Dn, P(t, Fr)), (h.instructions & Cr) === yt && (h.instructions |= Cr, P(t, Qe)), (h.instructions & xn) === yt ? (h.instructions |= xn, P(
        t,
        wt
      )) : P(t, $n)) : ((h.instructions & Cr) === yt && (h.instructions |= Cr, P(t, Qe)), P(t, bn)), h = ee(y.toString(16)), P(t, e.boundaryPrefix), P(t, h), P(t, vr), P(t, e.segmentPrefix), P(t, h), x ? (P(t, ll), We(t, c)) : P(t, Nl), c = N(t, Je), Eo(t, e) && c;
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
      ) : (vc(e, t, h, y), c = e.resumableState, e = e.renderState, P(t, e.startInlineScript), P(t, bt), (c.instructions & Sn) === yt ? (c.instructions |= Sn, P(t, K)) : P(t, xe), P(t, e.segmentPrefix), x = ee(x.toString(16)), P(t, x), P(t, pe), P(t, e.placeholderPrefix), P(t, x), t = N(t, yn), t);
    }
    function Tl(e, t) {
      dr = new Uint8Array(2048), ar = 0;
      try {
        if (!(0 < e.pendingRootTasks)) {
          var c, h = e.completedRootSegment;
          if (h !== null) {
            if (h.status === tn) return;
            var y = e.completedPreambleSegments;
            if (y === null) return;
            Pi = e.byteSize;
            var x = e.resumableState, k = e.renderState, M = k.preamble, V = M.htmlChunks, _ = M.headChunks, U;
            if (V) {
              for (U = 0; U < V.length; U++)
                P(t, V[U]);
              if (_)
                for (U = 0; U < _.length; U++)
                  P(t, _[U]);
              else
                P(t, _n("head")), P(t, bt);
            } else if (_)
              for (U = 0; U < _.length; U++)
                P(t, _[U]);
            var oe = k.charsetChunks;
            for (U = 0; U < oe.length; U++)
              P(t, oe[U]);
            oe.length = 0, k.preconnects.forEach(ne, t), k.preconnects.clear();
            var se = k.viewportChunks;
            for (U = 0; U < se.length; U++)
              P(t, se[U]);
            se.length = 0, k.fontPreloads.forEach(ne, t), k.fontPreloads.clear(), k.highImagePreloads.forEach(ne, t), k.highImagePreloads.clear(), sn = k, k.styles.forEach(Oe, t), sn = null;
            var ce = k.importMapChunks;
            for (U = 0; U < ce.length; U++)
              P(t, ce[U]);
            ce.length = 0, k.bootstrapScripts.forEach(ne, t), k.scripts.forEach(ne, t), k.scripts.clear(), k.bulkPreloads.forEach(ne, t), k.bulkPreloads.clear(), V || _ || (x.instructions |= kn);
            var le = k.hoistableChunks;
            for (U = 0; U < le.length; U++)
              P(t, le[U]);
            for (x = le.length = 0; x < y.length; x++) {
              var Ue = y[x];
              for (k = 0; k < Ue.length; k++)
                Ti(e, t, Ue[k], null);
            }
            var Zn = e.renderState.preamble, Be = Zn.headChunks;
            (Zn.htmlChunks || Be) && P(t, dt("head"));
            var hn = Zn.bodyChunks;
            if (hn)
              for (y = 0; y < hn.length; y++)
                P(t, hn[y]);
            Ti(e, t, h, null), e.completedRootSegment = null;
            var Pt = e.renderState;
            if (e.allPendingTasks !== 0 || e.clientRenderedBoundaries.length !== 0 || e.completedBoundaries.length !== 0 || e.trackedPostpones !== null && (e.trackedPostpones.rootNodes.length !== 0 || e.trackedPostpones.rootSlots !== null)) {
              var Ht = e.resumableState;
              if ((Ht.instructions & qe) === yt) {
                if (Ht.instructions |= qe, P(t, Pt.startInlineScript), (Ht.instructions & kn) === yt) {
                  Ht.instructions |= kn;
                  var Fn = "_" + Ht.idPrefix + "R_";
                  P(t, uu), P(
                    t,
                    ee(Pe(Fn))
                  ), P(t, un);
                }
                P(t, bt), P(t, Ac), N(t, Zi);
              }
            }
            Eo(t, Pt);
          }
          var Le = e.renderState;
          h = 0;
          var Ut = Le.viewportChunks;
          for (h = 0; h < Ut.length; h++)
            P(
              t,
              Ut[h]
            );
          Ut.length = 0, Le.preconnects.forEach(ne, t), Le.preconnects.clear(), Le.fontPreloads.forEach(ne, t), Le.fontPreloads.clear(), Le.highImagePreloads.forEach(
            ne,
            t
          ), Le.highImagePreloads.clear(), Le.styles.forEach(Ke, t), Le.scripts.forEach(ne, t), Le.scripts.clear(), Le.bulkPreloads.forEach(ne, t), Le.bulkPreloads.clear();
          var Lr = Le.hoistableChunks;
          for (h = 0; h < Lr.length; h++)
            P(
              t,
              Lr[h]
            );
          Lr.length = 0;
          var Qn = e.clientRenderedBoundaries;
          for (c = 0; c < Qn.length; c++) {
            var ut = Qn[c];
            Le = t;
            var cl = e.resumableState, pr = e.renderState, nr = ut.rootSegmentID, st = ut.errorDigest, Vt = ut.errorMessage, ul = ut.errorStack, Al = ut.errorComponentStack;
            P(
              Le,
              pr.startInlineScript
            ), P(Le, bt), (cl.instructions & Dn) === yt ? (cl.instructions |= Dn, P(Le, It)) : P(Le, Qr), P(
              Le,
              pr.boundaryPrefix
            ), P(Le, ee(nr.toString(16))), P(Le, ji), (st || Vt || ul || Al) && (P(
              Le,
              pt
            ), P(
              Le,
              ee(
                Zl(st || "")
              )
            )), (Vt || ul || Al) && (P(
              Le,
              pt
            ), P(
              Le,
              ee(
                Zl(Vt || "")
              )
            )), (ul || Al) && (P(
              Le,
              pt
            ), P(
              Le,
              ee(
                Zl(ul || "")
              )
            )), Al && (P(
              Le,
              pt
            ), P(
              Le,
              ee(
                Zl(Al)
              )
            ));
            var tr = N(
              Le,
              lo
            );
            if (!tr) {
              e.destination = null, c++, Qn.splice(0, c);
              return;
            }
          }
          Qn.splice(0, c);
          var xt = e.completedBoundaries;
          for (c = 0; c < xt.length; c++)
            if (!yc(
              e,
              t,
              xt[c]
            )) {
              e.destination = null, c++, xt.splice(0, c);
              return;
            }
          xt.splice(0, c), Fe(t), dr = new Uint8Array(2048), ar = 0, cr = !0;
          var _r = e.partialBoundaries;
          for (c = 0; c < _r.length; c++) {
            e: {
              Qn = e, ut = t;
              var sl = _r[c];
              Pi = sl.byteSize;
              var Br = sl.completedSegments;
              for (tr = 0; tr < Br.length; tr++)
                if (!Jc(
                  Qn,
                  ut,
                  sl,
                  Br[tr]
                )) {
                  tr++, Br.splice(0, tr);
                  var na = !1;
                  break e;
                }
              Br.splice(0, tr);
              var fl = sl.row;
              fl !== null && fl.together && sl.pendingTasks === 1 && (fl.pendingTasks === 1 ? sa(
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
              e.destination = null, c++, _r.splice(0, c);
              return;
            }
          }
          _r.splice(0, c), cr = !1;
          var Wt = e.completedBoundaries;
          for (c = 0; c < Wt.length; c++)
            if (!yc(e, t, Wt[c])) {
              e.destination = null, c++, Wt.splice(0, c);
              return;
            }
          Wt.splice(0, c);
        }
      } finally {
        cr = !1, e.allPendingTasks === 0 && e.clientRenderedBoundaries.length === 0 && e.completedBoundaries.length === 0 ? (e.flushScheduled = !1, c = e.resumableState, c.hasBody && P(t, dt("body")), c.hasHtml && P(t, dt("html")), Fe(t), e.abortableTasks.size !== 0 && console.error(
          "There was still abortable task at the root when we closed. This is a bug in React."
        ), e.status = Nr, t.close(), e.destination = null) : Fe(t);
      }
    }
    function xl(e) {
      e.flushScheduled = e.destination !== null, Qa(function() {
        return va(e);
      }), ie(function() {
        e.status === 10 && (e.status = 11), e.trackedPostpones === null && Qc(e, e.pendingRootTasks === 0);
      });
    }
    function rl(e) {
      e.flushScheduled === !1 && e.pingedTasks.length === 0 && e.destination !== null && (e.flushScheduled = !0, ie(function() {
        var t = e.destination;
        t ? Tl(e, t) : e.flushScheduled = !1;
      }));
    }
    function El(e, t) {
      if (e.status === 13)
        e.status = Nr, rr(t, e.fatalError);
      else if (e.status !== Nr && e.destination === null) {
        e.destination = t;
        try {
          Tl(e, t);
        } catch (c) {
          t = {}, Dt(e, c, t, null), wi(e, c, t, null);
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
            var x = r, k = cn.getCurrentStack;
            r = y, cn.getCurrentStack = bi;
            try {
              gc(y, e, h);
            } finally {
              r = x, cn.getCurrentStack = k;
            }
          }), c.clear();
        }
        e.destination !== null && Tl(e, e.destination);
      } catch (y) {
        t = {}, Dt(e, y, t, null), wi(e, y, t, null);
      }
    }
    function Rl(e, t, c) {
      if (t === null) c.rootNodes.push(e);
      else {
        var h = c.workingMap, y = h.get(t);
        y === void 0 && (y = [t[1], t[2], [], null], h.set(t, y), Rl(y, t[0], c)), y[2].push(e);
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
        y.nextFormID = 0, y.hasBody = !1, y.hasHtml = !1, y.unknownResources = { font: x.resets.font }, y.dnsResources = x.resets.dns, y.connectResources = x.resets.connect, y.imageResources = x.resets.image, y.styleResources = x.resets.style, y.scriptResources = {}, y.moduleUnknownResources = {}, y.moduleScriptResources = {}, y.instructions = yt;
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
    var Vc = Ms(), Kc = yf(), jc = /* @__PURE__ */ Symbol.for("react.transitional.element"), bc = /* @__PURE__ */ Symbol.for("react.portal"), Yi = /* @__PURE__ */ Symbol.for("react.fragment"), wc = /* @__PURE__ */ Symbol.for("react.strict_mode"), pc = /* @__PURE__ */ Symbol.for("react.profiler"), Xr = /* @__PURE__ */ Symbol.for("react.consumer"), it = /* @__PURE__ */ Symbol.for("react.context"), mn = /* @__PURE__ */ Symbol.for("react.forward_ref"), ya = /* @__PURE__ */ Symbol.for("react.suspense"), Ga = /* @__PURE__ */ Symbol.for("react.suspense_list"), Xa = /* @__PURE__ */ Symbol.for("react.memo"), ba = /* @__PURE__ */ Symbol.for("react.lazy"), Du = /* @__PURE__ */ Symbol.for("react.scope"), ir = /* @__PURE__ */ Symbol.for("react.activity"), Rs = /* @__PURE__ */ Symbol.for("react.legacy_hidden"), ti = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), as = /* @__PURE__ */ Symbol.for("react.view_transition"), Nu = Symbol.iterator, xi = Array.isArray, Tc = /* @__PURE__ */ new WeakMap(), hr = /* @__PURE__ */ new WeakMap(), Gi = /* @__PURE__ */ Symbol.for("react.client.reference"), os = new MessageChannel(), Za = [];
    os.port1.onmessage = function() {
      var e = Za.shift();
      e && e();
    };
    var qc = Promise, Qa = typeof queueMicrotask == "function" ? queueMicrotask : function(e) {
      qc.resolve(null).then(e).catch(He);
    }, dr = null, ar = 0, wa = new TextEncoder(), qn = Object.assign, zn = Object.prototype.hasOwnProperty, Ja = RegExp(
      "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    ), Do = {}, $c = {}, No = new Set(
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
    }, vt = {
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
    }, Xi = {}, cs = RegExp(
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
    ), I = /^(?:webkit|moz|o)[A-Z]/, G = /^-ms-/, re = /-(.)/g, $ = /;\s*$/, ye = {}, Ne = {}, on = !1, Ze = !1, ze = /["'&<>]/, je = /([A-Z])/g, Xe = /^ms-/, at = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i, cn = Vc.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, wn = Kc.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Mn = Object.freeze({
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
              c.dnsResources[e] = An, c = h.headers;
              var y, x;
              (x = c && 0 < c.remainingCapacity) && (x = (y = "<" + La(e) + ">; rel=dns-prefetch", 0 <= (c.remainingCapacity -= y.length + 2))), x ? (h.resets.dns[e] = An, c.preconnects && (c.preconnects += ", "), c.preconnects += y) : (y = [], De(y, { href: e, rel: "dns-prefetch" }), h.preconnects.add(y));
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
              h.connectResources[x][e] = An, h = y.headers;
              var k, M;
              if (M = h && 0 < h.remainingCapacity) {
                if (M = "<" + La(e) + ">; rel=preconnect", typeof t == "string") {
                  var V = tl(
                    t,
                    "crossOrigin"
                  );
                  M += '; crossorigin="' + V + '"';
                }
                M = (k = M, 0 <= (h.remainingCapacity -= k.length + 2));
              }
              M ? (y.resets.connect[x][e] = An, h.preconnects && (h.preconnects += ", "), h.preconnects += k) : (x = [], De(x, {
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
                  var k = c.imageSrcSet, M = c.imageSizes, V = c.fetchPriority;
                var _ = k ? k + `
` + (M || "") : e;
                if (y.imageResources.hasOwnProperty(_)) return;
                y.imageResources[_] = $t, y = x.headers;
                var U;
                y && 0 < y.remainingCapacity && typeof k != "string" && V === "high" && (U = ca(e, t, c), 0 <= (y.remainingCapacity -= U.length + 2)) ? (x.resets.image[_] = $t, y.highImagePreloads && (y.highImagePreloads += ", "), y.highImagePreloads += U) : (y = [], De(
                  y,
                  qn(
                    {
                      rel: "preload",
                      href: k ? void 0 : e,
                      as: t
                    },
                    c
                  )
                ), V === "high" ? x.highImagePreloads.add(y) : (x.bulkPreloads.add(y), x.preloads.images.set(_, y)));
                break;
              case "style":
                if (y.styleResources.hasOwnProperty(e)) return;
                k = [], De(
                  k,
                  qn({ rel: "preload", href: e, as: t }, c)
                ), y.styleResources[e] = !c || typeof c.crossOrigin != "string" && typeof c.integrity != "string" ? $t : [c.crossOrigin, c.integrity], x.preloads.stylesheets.set(e, k), x.bulkPreloads.add(k);
                break;
              case "script":
                if (y.scriptResources.hasOwnProperty(e)) return;
                k = [], x.preloads.scripts.set(e, k), x.bulkPreloads.add(k), De(
                  k,
                  qn({ rel: "preload", href: e, as: t }, c)
                ), y.scriptResources[e] = !c || typeof c.crossOrigin != "string" && typeof c.integrity != "string" ? $t : [c.crossOrigin, c.integrity];
                break;
              default:
                if (y.unknownResources.hasOwnProperty(t)) {
                  if (k = y.unknownResources[t], k.hasOwnProperty(e))
                    return;
                } else
                  k = {}, y.unknownResources[t] = k;
                k[e] = $t, (y = x.headers) && 0 < y.remainingCapacity && t === "font" && (_ = ca(e, t, c), 0 <= (y.remainingCapacity -= _.length + 2)) ? (x.resets.font[e] = $t, y.fontPreloads && (y.fontPreloads += ", "), y.fontPreloads += _) : (y = [], e = qn(
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
                x = [], h.moduleScriptResources[e] = !t || typeof t.crossOrigin != "string" && typeof t.integrity != "string" ? $t : [t.crossOrigin, t.integrity], y.preloads.moduleScripts.set(e, x);
                break;
              default:
                if (h.moduleUnknownResources.hasOwnProperty(x)) {
                  var k = h.unknownResources[x];
                  if (k.hasOwnProperty(e)) return;
                } else
                  k = {}, h.moduleUnknownResources[x] = k;
                x = [], k[e] = $t;
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
            x !== An && (h.scriptResources[e] = An, t = qn({ src: e, async: !0 }, t), x && (x.length === 2 && hi(t, x), e = y.preloads.scripts.get(e)) && (e.length = 0), e = [], y.scripts.add(e), Na(e, t), rl(c));
          }
        } else en.X(e, t);
      },
      S: function(e, t, c) {
        var h = Wn || null;
        if (h) {
          var y = h.resumableState, x = h.renderState;
          if (e) {
            t = t || "default";
            var k = x.styles.get(t), M = y.styleResources.hasOwnProperty(e) ? y.styleResources[e] : void 0;
            M !== An && (y.styleResources[e] = An, k || (k = {
              precedence: ee(Pe(t)),
              rules: [],
              hrefs: [],
              sheets: /* @__PURE__ */ new Map()
            }, x.styles.set(t, k)), t = {
              state: Aa,
              props: qn(
                {
                  rel: "stylesheet",
                  href: e,
                  "data-precedence": t
                },
                c
              )
            }, M && (M.length === 2 && hi(t.props, M), (x = x.preloads.stylesheets.get(e)) && 0 < x.length ? x.length = 0 : t.state = hu), k.sheets.set(e, t), rl(h));
          }
        } else en.S(e, t, c);
      },
      M: function(e, t) {
        var c = Wn || null;
        if (c) {
          var h = c.resumableState, y = c.renderState;
          if (e) {
            var x = h.moduleScriptResources.hasOwnProperty(e) ? h.moduleScriptResources[e] : void 0;
            x !== An && (h.moduleScriptResources[e] = An, t = qn(
              { src: e, type: "module", async: !0 },
              t
            ), x && (x.length === 2 && hi(t, x), e = y.preloads.moduleScripts.get(e)) && (e.length = 0), e = [], y.scripts.add(e), Na(e, t), rl(c));
          }
        } else en.M(e, t);
      }
    };
    var yt = 0, Sn = 1, Cr = 2, Dn = 4, xn = 8, kn = 32, qe = 64, An = null, $t = [];
    Object.freeze($t);
    var sn = null;
    X('"></template>');
    var pa = X("<script"), Zi = X("<\/script>"), mr = X('<script src="'), Pl = X('<script type="module" src="'), Fl = X(' nonce="'), Ol = X(' integrity="'), Ei = X(' crossorigin="'), Qi = X(' async=""><\/script>'), Jt = X("<style"), Va = /(<\/|<)(s)(cript)/gi, Ka = X(
      '<script type="importmap">'
    ), xc = X("<\/script>"), eu = {}, Lo = 0, Ta = 1, Sr = 2, Ec = 3, kr = 4, Cl = 5, Ji = 6, Rc = 7, Vi = 8, nu = 9, _t = X("<!-- -->"), Cc = /* @__PURE__ */ new Map(), xa = X(' style="'), _o = X(":"), ja = X(";"), Mt = X(" "), ml = X('="'), un = X('"'), Ki = X('=""'), Bo = X(
      Pe(
        "javascript:throw new Error('React form unexpectedly submitted.')"
      )
    ), Ea = X('<input type="hidden"'), bt = X(">"), Zr = X("/>"), Ra = !1, qa = !1, Ml = !1, gr = !1, zo = !1, Ar = !1, _u = !1, $a = !1, mc = !1, tu = !1, ru = !1, Ri = X(' selected=""'), eo = X(
      `addEventListener("submit",function(a){if(!a.defaultPrevented){var c=a.target,d=a.submitter,e=c.action,b=d;if(d){var f=d.getAttribute("formAction");null!=f&&(e=f,b=null)}"javascript:throw new Error('React form unexpectedly submitted.')"===e&&(a.preventDefault(),b?(a=document.createElement("input"),a.name=b.name,a.value=b.value,b.parentNode.insertBefore(a,b),b=new FormData(c),a.parentNode.removeChild(a)):b=new FormData(c),a=c.ownerDocument||c,(a.$$reactFormReplay=a.$$reactFormReplay||[]).push(c,d,b))}});`
    ), no = X("<!--F!-->"), Pr = X("<!--F-->"), Sc = /(<\/|<)(s)(tyle)/gi, kc = X("<!--head-->"), Bu = X("<!--body-->"), zu = X("<!--html-->"), lu = X(`
`), Hu = /^[a-zA-Z][a-zA-Z:_\.\-\d]*$/, Uu = /* @__PURE__ */ new Map(), Bt = X("<!DOCTYPE html>"), iu = /* @__PURE__ */ new Map(), Ac = X(
      "requestAnimationFrame(function(){$RT=performance.now()});"
    ), Pc = X('<template id="'), au = X('"></template>'), Wu = X("<!--&-->"), ou = X("<!--/&-->"), cu = X("<!--$-->"), Ca = X(
      '<!--$?--><template id="'
    ), Il = X('"></template>'), us = X("<!--$!-->"), to = X("<!--/$-->"), Fc = X("<template"), ri = X('"'), Ho = X(' data-dgst="'), ma = X(' data-msg="'), Oc = X(' data-stck="'), Sa = X(' data-cstck="'), ss = X("></template>"), fs = X('<div hidden id="'), li = X('">'), Uo = X("</div>"), Sl = X(
      '<svg aria-hidden="true" style="display:none" id="'
    ), ka = X('">'), ro = X("</svg>"), Dl = X(
      '<math aria-hidden="true" style="display:none" id="'
    ), Yu = X('">'), hs = X("</math>"), Wo = X('<table hidden id="'), l = X('">'), a = X("</table>"), s = X(
      '<table hidden><tbody id="'
    ), v = X('">'), w = X("</tbody></table>"), C = X('<table hidden><tr id="'), S = X('">'), B = X("</tr></table>"), O = X(
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
    var bn = X('$RC("'), wt = X(
      `$RM=new Map;$RR=function(n,w,p){function u(q){this._p=null;q()}for(var r=new Map,t=document,h,b,e=t.querySelectorAll("link[data-precedence],style[data-precedence]"),v=[],k=0;b=e[k++];)"not all"===b.getAttribute("media")?v.push(b):("LINK"===b.tagName&&$RM.set(b.getAttribute("href"),b),r.set(b.dataset.precedence,h=b));e=0;b=[];var l,a;for(k=!0;;){if(k){var f=p[e++];if(!f){k=!1;e=0;continue}var c=!1,m=0;var d=f[m++];if(a=$RM.get(d)){var g=a._p;c=!0}else{a=t.createElement("link");a.href=d;a.rel=
"stylesheet";for(a.dataset.precedence=l=f[m++];g=f[m++];)a.setAttribute(g,f[m++]);g=a._p=new Promise(function(q,x){a.onload=u.bind(a,q);a.onerror=u.bind(a,x)});$RM.set(d,a)}d=a.getAttribute("media");!g||d&&!matchMedia(d).matches||b.push(g);if(c)continue}else{a=v[e++];if(!a)break;l=a.getAttribute("data-precedence");a.removeAttribute("media")}c=r.get(l)||h;c===h&&(h=a);r.set(l,a);c?c.parentNode.insertBefore(a,c.nextSibling):(c=t.head,c.insertBefore(a,c.firstChild))}if(p=document.getElementById(n))p.previousSibling.data=
"$~";Promise.all(b).then($RC.bind(null,n,w),$RX.bind(null,n,"CSS failed to load"))};$RR("`
    ), $n = X('$RR("'), vr = X('","'), ll = X('",'), Nl = X('"'), Je = X(")<\/script>");
    X('<template data-rci="" data-bid="'), X('<template data-rri="" data-bid="'), X('" data-sid="'), X('" data-sty="');
    var Fr = X(
      '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};'
    ), It = X(
      '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};;$RX("'
    ), Qr = X('$RX("'), ji = X('"'), pt = X(","), lo = X(")<\/script>");
    X('<template data-rxi="" data-bid="'), X('" data-dgst="'), X('" data-msg="'), X('" data-stck="'), X('" data-cstck="');
    var Ll = /[<\u2028\u2029]/g, Or = /[&><\u2028\u2029]/g, ii = X(
      ' media="not all" data-precedence="'
    ), Mr = X('" data-href="'), io = X('">'), Yo = X("</style>"), Jr = !1, Go = !0, Ir = [], ao = X(' data-precedence="'), Gu = X('" data-href="'), ot = X(" "), Xo = X('">'), ai = X("</style>");
    X('<link rel="expect" href="#'), X('" blocking="render"/>');
    var uu = X(' id="'), oo = X("["), su = X(",["), fu = X(","), Zo = X("]"), Aa = 0, hu = 1, Ci = 2, co = 3, uo = /[<>\r\n]/g, ds = /["';,\r\n]/g, _l = Function.prototype.bind, gs = /* @__PURE__ */ Symbol.for("react.client.reference"), kl = {};
    Object.freeze(kl);
    var Pa = {}, qi = null, du = {}, gu = {}, vu = /* @__PURE__ */ new Set(), so = /* @__PURE__ */ new Set(), vs = /* @__PURE__ */ new Set(), Xu = /* @__PURE__ */ new Set(), Qo = /* @__PURE__ */ new Set(), ys = /* @__PURE__ */ new Set(), yu = /* @__PURE__ */ new Set(), ms = /* @__PURE__ */ new Set(), Zu = /* @__PURE__ */ new Set(), Ss = {
      enqueueSetState: function(e, t, c) {
        var h = e._reactInternals;
        h.queue === null ? fr(e, "setState") : (h.queue.push(t), c != null && Vl(c));
      },
      enqueueReplaceState: function(e, t, c) {
        e = e._reactInternals, e.replace = !0, e.queue = [t], c != null && Vl(c);
      },
      enqueueForceUpdate: function(e, t) {
        e._reactInternals.queue === null ? fr(e, "forceUpdate") : t != null && Vl(t);
      }
    }, bu = { id: 1, overflow: "" }, Jo = Math.clz32 ? Math.clz32 : Wc, Is = Math.log, Ds = Math.LN2, mi = Error(
      "Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`."
    ), bs = null, Ns = typeof Object.is == "function" ? Object.is : Yc, or = null, $i = null, Dr = null, Fa = null, Bl = null, Nn = null, il = !1, ea = !1, zt = 0, Mc = 0, wu = -1, ws = 0, Vo = null, fo = null, Ic = 0, oi = !1, ho, Dc = {
      readContext: rs,
      use: function(e) {
        if (e !== null && typeof e == "object") {
          if (typeof e.then == "function")
            return Zt(e);
          if (e.$$typeof === it)
            return rs(e);
        }
        throw Error(
          "An unsupported type was passed to use(): " + String(e)
        );
      },
      useContext: function(e) {
        return ho = "useContext", rt(), e._currentValue;
      },
      useMemo: mo,
      useReducer: Co,
      useRef: function(e) {
        or = rt(), Nn = Ro();
        var t = Nn.memoizedState;
        return t === null ? (e = { current: e }, Object.seal(e), Nn.memoizedState = e) : t;
      },
      useState: function(e) {
        return ho = "useState", Co(ls, e);
      },
      useInsertionEffect: Rr,
      useLayoutEffect: Rr,
      useCallback: function(e, t) {
        return mo(function() {
          return e;
        }, t);
      },
      useImperativeHandle: Rr,
      useEffect: Rr,
      useDebugValue: Rr,
      useDeferredValue: function(e, t) {
        return rt(), t !== void 0 ? t : e;
      },
      useTransition: function() {
        return rt(), [!1, Xc];
      },
      useId: function() {
        var e = $i.treeContext, t = e.overflow;
        e = e.id, e = (e & ~(1 << 32 - Jo(e) - 1)).toString(32) + t;
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
        return rt(), Mn;
      },
      useMemoCache: function(e) {
        for (var t = Array(e), c = 0; c < e; c++)
          t[c] = ti;
        return t;
      },
      useCacheRefresh: function() {
        return So;
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
    var de, Ce, be = !1, ae = new (typeof WeakMap == "function" ? WeakMap : Map)(), fn = {
      react_stack_bottom_frame: function(e, t, c) {
        return e(t, c);
      }
    }, Jn = fn.react_stack_bottom_frame.bind(fn), Ye = {
      react_stack_bottom_frame: function(e) {
        return e.render();
      }
    }, Pn = Ye.react_stack_bottom_frame.bind(Ye), yr = {
      react_stack_bottom_frame: function(e) {
        var t = e._init;
        return t(e._payload);
      }
    }, br = yr.react_stack_bottom_frame.bind(yr), In = 0;
    if (typeof performance == "object" && typeof performance.now == "function")
      var er = performance, Si = function() {
        return er.now();
      };
    else {
      var Vr = Date;
      Si = function() {
        return Vr.now();
      };
    }
    var Me = 4, Hn = 0, Un = 1, Xn = 2, Tt = 3, pn = 4, tn = 5, Nr = 14, Wn = null, wr = {}, ct = {}, al = {}, Ko = {}, ol = !1, ki = !1, Ai = !1, Pi = 0, cr = !1;
    ni(), ni(), Gs.prerender = function(e, t) {
      return new Promise(function(c, h) {
        var y = t ? t.onHeaders : void 0, x;
        y && (x = function(U) {
          y(new Headers(U));
        });
        var k = yl(
          t ? t.identifierPrefix : void 0,
          t ? t.unstable_externalRuntimeSrc : void 0,
          t ? t.bootstrapScriptContent : void 0,
          t ? t.bootstrapScripts : void 0,
          t ? t.bootstrapModules : void 0
        ), M = Yr(
          e,
          k,
          xr(
            k,
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
                  El(M, oe);
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
            var _ = function() {
              Gn(M, V.reason), V.removeEventListener("abort", _);
            };
            V.addEventListener("abort", _);
          }
        }
        xl(M);
      });
    }, Gs.renderToReadableStream = function(e, t) {
      return new Promise(function(c, h) {
        var y, x, k = new Promise(function(ce, le) {
          x = ce, y = le;
        }), M = t ? t.onHeaders : void 0, V;
        M && (V = function(ce) {
          M(new Headers(ce));
        });
        var _ = yl(
          t ? t.identifierPrefix : void 0,
          t ? t.unstable_externalRuntimeSrc : void 0,
          t ? t.bootstrapScriptContent : void 0,
          t ? t.bootstrapScripts : void 0,
          t ? t.bootstrapModules : void 0
        ), U = ko(
          e,
          _,
          xr(
            _,
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
                  El(U, le);
                },
                cancel: function(le) {
                  U.destination = null, Gn(U, le);
                }
              },
              { highWaterMark: 0 }
            );
            ce.allReady = k, c(ce);
          },
          function(ce) {
            k.catch(function() {
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
        xl(U);
      });
    }, Gs.resume = function(e, t, c) {
      return new Promise(function(h, y) {
        var x, k, M = new Promise(function(oe, se) {
          k = oe, x = se;
        }), V = jt(
          e,
          t,
          xr(
            t.resumableState,
            c ? c.nonce : void 0,
            void 0,
            void 0,
            void 0,
            void 0
          ),
          c ? c.onError : void 0,
          k,
          function() {
            var oe = new ReadableStream(
              {
                type: "bytes",
                pull: function(se) {
                  El(V, se);
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
          var _ = c.signal;
          if (_.aborted) Gn(V, _.reason);
          else {
            var U = function() {
              Gn(V, _.reason), _.removeEventListener("abort", U);
            };
            _.addEventListener("abort", U);
          }
        }
        xl(V);
      });
    }, Gs.resumeAndPrerender = function(e, t, c) {
      return new Promise(function(h, y) {
        var x = jn(
          e,
          t,
          xr(
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
                pull: function(_) {
                  El(x, _);
                },
                cancel: function(_) {
                  x.destination = null, Gn(x, _);
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
          var k = c.signal;
          if (k.aborted) Gn(x, k.reason);
          else {
            var M = function() {
              Gn(x, k.reason), k.removeEventListener("abort", M);
            };
            k.addEventListener("abort", M);
          }
        }
        xl(x);
      });
    }, Gs.version = "19.2.6";
  })()), Gs;
}
var Qf;
function uh() {
  if (Qf) return Ws;
  Qf = 1;
  var ge, ue;
  return process.env.NODE_ENV === "production" ? (ge = ih(), ue = ah()) : (ge = oh(), ue = ch()), Ws.version = ge.version, Ws.renderToString = ge.renderToString, Ws.renderToStaticMarkup = ge.renderToStaticMarkup, Ws.renderToReadableStream = ue.renderToReadableStream, Ws.resume = ue.resume, Ws;
}
var sh = uh(), fh = Ms();
const hh = /* @__PURE__ */ jf(fh);
function dh(ge) {
  const ue = Number(ge);
  return !Number.isFinite(ue) || ue === 0 ? 0 : ue < 0 ? ue : Math.ceil(ue / 5) * 5;
}
const gh = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQAAACWCAYAAAAonXpvAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAgAElEQVR4nOydeXwb1bn3f8+ZkbzEhJBrnNR1rLEkbCcOKRdzucAN1G1pS+kKJA5Ly1K60L1cLuWlXC7w9vK2tKUUulBuW8pSCFGAQqFAN0hTyqUUaBpiYgdJlhQTspGG1HZkaeY87x8jW6N9l5Mw389HiTU6c+bMaDTPOc8K2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NgcWNBsD8Cmdvj6+lqAiRY5pTZDGC1EogVELQKyBUQtALWw5GYibgaTgwUEMSDBQrAQEgwSEMwQBAYBgokSbSCIIElSlElOgGkShCiIJpnlJIii5jaKKtKYhCImpaFMIh7fMxgM7pvta2NjY2NzqGEL9IMAX0dHo9GiLlQktZGgNsloI0IbAQskRBsBbWDZCqK5AFoSr+ZZHnY+JkHYDmAbgO3E2CaJXxWg7Qy5TUJsd7Jj25nDw3tme6A2NjY2Bwu2QJ9l7l3a1abGxVIW1AuWi4jRBkIbYH3RgSyca0kMSAp+Zt4mQK9J8DbBtI0dYrtO+rYtm0Z3XwvI2R2qjY2NzexiC/Q64evrmM+yaSlJYwkRjmbQUgBLALTO9tgOAXQQ/MzYAOK/kqSNitA3nLU5vH22B2ZjY2NTL2yBXmXuWrasuTE2uYzBS4lwNCSWgrAEwMLZHtubkJ0AbSTwBsn0NyK54ciFncPvWLdOn+2B2djY2FQbW6BXyIMeT5vh4OWSxclEvBzAMQDU2R6XTU5iAF4GsIGI/yYlbdCd8Q3nvRTZO9sDs7GxsakEW6CXiK/P44WB5UR0MjMvB9A922OqNzLxUnAI3UCMMQi8SIzfMsvfDI6MbpntIdnY2NiUwiHzPK4FPkDIxd5jhJTLQTgZoOU4CFXnOoAoA1EAUWbsBzDFwH7Ltiis74EpADoz9MT+OgCdzf+t3mcEU7ALAApZ/k7ZTinbc7V1kuma30SE5pm/gWYiNAFoTuxTJyLM+I0A/TrmjP3OXsHb2Ngc6NgCPQ2f19sKBz4ExhkAD8AMATug+QcDO5mxUwK7Ev/vSwjuaEIIHyo4YQr2JqIZgT+XgHlEOJyAeYm/D6Oq3twSwItMeEKQ/HVrm+tZ2w5vY2NzoGELdAAPLO7qlKAzmXFGYhUuZntM6TCAPQzskoydDOyUjF0JQR7l2R7dgYdAUtDPSwj6wy1/zyNCY/l3/ziAJ5no1wrkb1ZsDvqrNnAbGxubMnnTCvT7l3iXsMFnMuEMAMfO9nim0QHsTgjtXQnBvZPNbZUtCVkHaB+AvYmX+TdjLwF7IbBPAn83t/E+AiYBRCmhhQdzTABRYo6SlNF4Y6OqTE2pMVV1Cl2oQuhOQ1FU0skphKGSEE7DMP8nSaok6SQilSQ5pWCVJDmJpCqJnMSkAmhk8D8RYz4LzCem+QDPBzD9qrqjYQOAIwRhAQFtgrCQgAWCcAQYgkr6abzMxHeSof58cMuWbdUep42NjU0xvKkE+v1LjjreMORZRDgTgHe2xwMAcQARyQgajKAExsoT3HsAfhnAMBENSSn8RMYeYt4rpNzbGI/v3bhjx2S1x15Penp6WmKx2HxFyvmSeb6AMp8FzwdTG4gXgdEJzLwqMpM4AByZEPBtBCwStO8tAmgyM/HlQ4Kxjgl3ktL44ODQ0Hgl47CxsbEphUNaoD81MKDu3BEZgMQZRPQRAO2zPaYYgLBkjFoEuFHszowxBl4mgWEAQ4JomBXlZb/fv7t2Iz74cLvdcxFDJxSjE0SdkHCBuANMnUToBNCBMlb8DQAWCMQ0AX+3EHvaidQmAQ3ZHSUnGfSQAO7kYf/vBu1MdjY2NjXmkBToaxYfdYpgeTGDPpBQ284aMQAhgzEqTQH+akEBzjpAQQAvM2NYgIYk03BTtGl4aJe94qsSomfRooWGonSypG4I7gNjKYClMFf4xcMYe4vAox90KIEulTwwQxmXprXaTkx3CRG/yc5eZ2NjUysOGYF+z9Gd85y6eiGDPg1G72yNYwqmAA9KxmhCgBdYmo0DeJoZTwmB9Q1z5rw4NDQUq8dYbTLp6elpMaamloJpKRMfDeYlMNP0FhOuuIEJdw4QPfbeBqWbiN8OxnIAx8HUCMSIcLvOxg3nDIdCtTwPGxubNx8HvUBf2+s5SQKfJmAQQONsjGGHZLxkMEYksK2wAN8H4GmAnpIC60dHR5+HrY494Ol961vnG07nUpZyKUBHS8YSQVjKpsNeGqwD9DsQ7pzS9YduXSDF5HjT8UR8CkAng3EcgEelFNef/corw3U/GRsbm0OSg1KgP9zT0zJF+oUAPo1M9WZd2M3ARoOx0WDskHnjxvYReD0DT7FU1ge3Bl+ELcAPGbo7OtqlcCxnkicDdArM+9Ea9riPgPsB/oE/HH4RMH07dmyLHKMoWM4QuyHk+sGhYGRWTsDGxuaQ4aAS6L6+jvkwGr8E8BcBzKv38fdYhPhruYX4XhDWE/AUmNf7w+ENsAX4mwZN0+YJ5pME0ds5qW53Jj5+gllcH4wEn57FIdrY2ByiHBQC/d6lXW0OXVzOwCWoc+a2vQy8lBDiYzmFOD1DxGsJWPdKKLQRtgC3SaBpWqMKHM9MpzDzyUR8Eog2EPA1fyj0m9ken42NzaHDAS3QVy/1dKg6X8mgj6OO9vF9FiG+VTKyiXEGnhOE1Yir9/tf9Y/Va2w2Bz3C09l5DAtxigAaWcr1gUjkmdkelI2NzcHPASnQfT09GgnjamY+H3UqRTpuEeLhHEIcoBcBrJYCvtHRUdvmaVMV+vv71RdeeMHODW9jY1MRB5RAf6S/vXn/ZNNVYPwHknbHmjIqGet1xhYjp3f6RgKvYUP1BcYCds5uGxsbG5sDkgNGoPsWewYhcSMIHbU+loS5Gv+jzng1u138ZWaskQK+UChkhxXZ2NjY2BzwzLpA9/W6lwL0PQADtT7WFIC/6Iw/6RJ7M+X4FoB9kOqawNbAplqPxcbGxsbGpprMmkC/5+jOeY6442sAPosalyt9g4FndInnjIxSozEw7iXi703HCNvY2NjY2ByMzIpAX9vrPpNBtwForeVxXpOmWn2jkZE/fS8zfmQQ3xwO27m1bWxsbGwOfuoq0H+maY1zmtSbwHxJLY+zxTAd3QKZ9vEgmG6aMzV5e73Kia5e6ulwxOV8XSjNJLmRBDeDxR4oDS8O2jnbbWxsbGyqRN0Euq+nqxukrAV4WS36NwBsSDi6padiZeA5wfQtf2T0QdQ46cvqXk1TWQww6F0gDAA5nfwmwXgWxH9gUtat2vzK+lqOy8bGxsbm0KYuAn1Nr+d8At8KUHO1+2YALxqM38Ql9qXKcQngl2D5rXok7rhvsfcEwbgK4A+U2cU6sPz04MjolqoOrM7c1t+v/tP434+RhG5iMc6EvVIaex0K9qrSuefDIyN2CVgbGxubGlBTge7r62uBHr0VhI/Wov9RyXg0ztiWuiKPEnCHNMSNwbFgzePGfb3eUwC+GsCpVeguBvD1Lbr4xul+/0Ghjr/P63WTKo8nohPBOB7AscifQ+AZEN165IKO+96xbp2dTMXGxsamStRMoN/X6+4WoEcAdFe779cZeDwuMWSkCPKdAH1PiTt+tGXblt3VPmY6vh7PaSBcDeCk6vdOw5Jw0dmb/c9Wv+/KeaS/vTk60fRRBr6A8qvdrYdOZw36/TX/rmwObtwdbm89Juc2Ngc7NRHo9y32LBWM3wNoq2a/UQae1CWe0VO81vcy4xrhVH/kr8OqdnWvpilQ7gRwSo0PNS4EnbziZf+GGh+naO7zet2KKr/ATBeCqlLtzh91znnb+Rs31sVBMRdmhsLmMxncIxheJnKDuQWABEia9c0hAST+Z93cnnhPkGDSQSyZMSkYfkk8RIoyjDf2Dw+OjUVn8/xmA0+HxysdslllFswMAIKZwawKVlmozGBzmwAzGKpgZigKi+m2MMNZ5wJ0XSAcettsns/BTkdHR2OjcHyABZ8MiXkgzGXwuGAakwJhJnrMTmd98FN1gX7/Eu8xUvLvAcyvZr+bDcYv4hL/SC7KdRB+OKXr142Nje2p5rFy4ev1XAjge6hfxbftBowTzxkOhep0vKysXeJ+Jxt0GQinV7tvAr69cjhwebX7LQZfX5+TjOinGLgKwMIaHUYCiIAwTMBTjc37v//BF7bN6gSmHrhdXT8g8Ger1N0zgXDo36rU15uKZQsWNE82Nt3IwLkA5hZo/gxAq5W44756aDltqk9VBfr9S446Xhry11VavQEwV+WPxCVetKjXmfAohLgsGAzWxYHsMa/XOa7IW0H08Yo6Yt7AAqsB2gJmQUSfBOO0AnutGxwOvKOi45aJz+ttZZW/R8DZNTyMDvA/Dw4H65qd797u7laV9N+C6Jh6HhfANiji/YNDrxwwmpda0LNoUbsulFer1N2DgXDorCr19aahx+XSdNDDAEqNLNIB/BKEX8NQnrEzZx48VK2S2dolXcullI+Dqrd6HTEYD6Z6r29klpcGw5Enq3WMQty7tKttXOdfAFSurdwP0L3SoNVnv/JKSl74tUvce5mpkEAfuG+x94R629PXLvacz8w3UZU1LVlQE6l/6zZpuXdpV5uqG08BtKRex7TQDoNXATikBbpUlLYcJQtLhoCd1enpzYNnkWepDuMPKO/3qwI4E4wBdnBXlYf2ZkT09/eLelRUrIpAX7PYfSpLehhAVcLSpgA8GpN4PrkqjwJ0dSA8+h3UOI7cyn2LvccKnR9G7ljy3DBvIMLXhoaDD12ba8wGnVSMjkQwLgdQlxXKA4u7Og0WP2bGe+pxvAQn+QAxWIfvdnVPT7ui60+hBs6aJXBQRDBUAmfxnyHQgwy5LbmBsn7fJM37gAUEGKdKxms1G2gevJ1dKxjGNkvYq+jv7xdvvPGG0HVdxGIxcUT8CKHP1xGPx4Wu60JKKZplszCaDAFdvzoQDn9het8BDIhdfbvExMSE0HUd8+NxYchWMXX41PS+aDYMIXmOMJoMYRiGYGY4WBwnSc4NhsP3Fjt2EvrXGZQuzDeC6QdEcqNUlG3CMOYzi2Ugfh+AFUiTB8y4LhgM7pt+7+nUbmUpbpSqHG8wDGHIBsGNDCmlcEopmFkY0iHYyUJKKRzMYGYhpSpI6HNBylmB8OhlBYYuPIs8S1joxwsWMQiOCCnH2iPuyDrkj4rp7+9X/7FrV6dkBrNTAACDEUNsTz6zrKZp81Qp21MGoTfutJodurq6OoUu5jIz2MEi4RsipFQEACiKFNM+IcxKuj/I+/++a9fjAGq+EK1YoK9d0rWcJf0KVSp3ukMy7opJ7EnIcmI8pwtcEAqN1rXq2Zoe7yAx3wmgscRdYwC+MDgS/J98jXx9fU42ohcU1SNxXdTCa3rclxiMG1HexOx5MNaA8CQxL2Oin5Wwr1Pp7tawZUuwjOMWzeqlno6EMPfW8jiFkFI+MpvHrwuS2kBpS3Q2rg5EIi+X0o2maZoCdlu3eTo7TwKJRxhoTMyHBUDXB8Kj/11K3x0dHY0NivoCgN7EJkGM56JSf/vY2FgUgr1gsdbj0mb22bv7dQCAAqDJ4UTUMWEuNwA4SACKgKHETKU10xjMSBB4Xa5LtiL0A4yb+yqKiglFBTABxBPbSCCuCgDm/goAgMDEEFJ8uNjzci9yH8eQKfkwiOlj/sjoz9OaRmBqiu7yeDxfgmFcBcYXAYCBkHCqP0ppTRggRV6iMKALBRA6oJueizoIIAIUA2SYY5eJbaRIAALE/I1s421vb29udDq/SMzvAugEwGihxHmDAYMEtrpCEQ9rNy6KaD/MJdjfeOONZkniASIcg4TbNIH1Bhb/CiCnQFelbGcSfwJmTMW6oUbfDmBGoCtSrmDBNxJMd1iZ6J2E+VcycppAJEEEsGWbAJfyPCybioqi3Nvd3cpSrEGVhPlmg3Hr1IwwjxHhSn8kdGI9S5heCwjfYs/1RLwGpQpzQlAI+tfB4UBeYQ4ApEevRrGChasbLZCNNb3e64ionOQ/zwriowaHA/8yOBL49uBw4MWVI8E7GLirlE50IWsqZFf3apqi44+YZWEOYPvZW4LPz/IYag6TzLhno1KWXDchFAqFAuFwysomsWLeTebEsxng3aUKcwAYGxuLMmMNzOdgYkUnLx1LRCUw8JZS+0yBeOZ8RbzBV0lXhoqirx0JI134r88izFMIBAI7A6HQlwA+w+wEV6ZHDVGFUUsSmZoWj8s10ORwvkSMrwN0KnI7HHeCcPPWztCvNE3L6qPl9/v3AZSWRIxUSMe+bO1n9jMnmTNtCPhJejIyQ4in8/VRCKE31sVsVNEKXVWMu8FoL9yyMOt0M9tbYlLzIqRygb/OzhgP9/S0TAn9HjA+VPre/CimcN6KYCDvzQMknAel/GoJnavXAuLaGqmkfb3erwP8f0rdj4G7DtPpk6f7AxkqZAH8rRQTKilUsxv+kf725v0Tym8BaLU6RtEQ8j5YDxmIFqTZ0PUqR6MkhQtRqOxeiBbAMlAynNbQrYoiHwhJIcyOqdZKfJCJqPjJENPx1kMRYV2xuwbC4Yc8Ltf3g6FwygSkv79f3bv79XQVvp54OZG6OJzOBikt/88jkeoL0dXZdSrAjyNTDk0y43kitALcDVDyc8J7FOC3AP4VWZ6HRJzpu6HINV6v98QCYc3JQmGEcEa/RrrGiXczaNxsnuu5zBIgJ8DtW7ZtqUskVtkCfe1iz1e4sId2QXQAD8QkNiTs5cT4bkdEu7yQvaTaPNDd7Z4i/REwynGUeuzvc44449PDhZ0eTOEi70Zp2pEnrq2VMF/suRnMXyx5R+YNq0aC+UwGpaxu9tTS63tyoukGmv2VOQCMQTReN9uDqAsSbanyi4sSSJ2dnfMikcjefG36+vqc0fGJmVUac3F9Z0e2WQVtw7yGnXh1ul/aDYOOEiyihtOINcRieqyhQSedzwbxbdP7EOEdUV1/VlVVqKoqAUBKuZCkvHhmjEQpgoYZVxxx5D99Z/r9YS8cBgBYh3Upv/P+/n6xd/eeG4QQxZ8jUQtSDobPezu7XpEqrQ8Gg2Mo8Cyx2P1neOONN+YBdDk5lFv8fv90XgYAgMel/R7AOxNvI4FwyJW+v8flOo0NZUaF7XW5jmXIX6QIa/DTLJVLj2g7YsO0A1lHR0djo6LexECyoBfjOG9n17lZtQ5ZtZl8LMf0mwF8Jtv5tre3JzQ9080pM2SPjLa0Cdkng+HQQ9n6S8frcn0WdfL9Kkug+3q9JzDz9ZUePMrA7TGJraYBIsaETwfCoTv8CFXadUms6fEMGCQfQFkeobwe47GzihHmwIxwKckhi8FrSh9XYdYu9tzKjLIq3zGJK/J9LkHtVLyb87pyxlAMvl7PsQA+X6v+S4LwhcGhoTdHLntKfbAyaLfX652r67pojMdFvLFRNQxDOHVd6E6nKqUUqqTlLPhfAHwpX9fxN95ohWJdtBWvjs4YJtFCy226d8hSATEYHv1ctn08nWkqX8OIjGUmD4oAuGbmXZpPgQBtK8br+YUXXpAACjmSpUDgjWzJYMnAfBDfTQbD49J0gEPMFCQgSMQvgejFqK5vyHIOM/jNjI7fzvFxUpNB2SMSAuHwE9b3DPopLOp1Aj2oE84LbQ1GsTXZLjGmz3g07c9gzNihmfh6TdPuD4VC6WPObhYgXOLt7PpTtklAY2NjKwyLvJVZzoGpNUXrUcI95w+Hf1hs20op2YZ+z9Gd82AKmIrU9TEAdySF+U6wfEcwFLqjkj7LYe1i72eJ8HuAywnveBExfLDYTGBret1nU+nC5dnJqCxqJlgKvsWem8sV5gB2rhr2/yZfAwIXbW8jIW8qcxyFUVDQBFIHdCJcMbg5UPXv8cCFUtTVBBzDcf0NhfH3uOp4HbqxQ2G8Zijqq2TIsMIYZeK7iXlHoZ6loqTdW6LgPjlJXdEVZfZhStM+NTQUTsKS5lMgUYIKvUQkOJ/TpQqQlwjvAeESBv2AGf/boKh/92jazR6Pp/SIHqtA58LX0FS1Y8bRl4B7/eHRlVmE8wyBUOgOBp6zbOoUzNkSXVmvc0oCJya+zdvZmaGBJV1vTdmgcOY5EC2wvhWcpc0BQMkC3aE77gTQWclBdQB3T0mEJYOBDayIf6lHRTQrTw0MqGt6Pbcx8w9QnnPgFuj03kFLWEc+1vR4TiLQnaUeQ4Xj/RfludHLwdfjOW3am7VMNubtv6OjEcAJRfZ1x8qXRytyOMnH4FDAz8wXA3gZdQx5TDDOoDuklP0rNwe+Wedjzy5c/ITOiixm5SNESt+VrNCRYosvTqBTqm09ZjpjFdopVSAQ5xbo7kXu43p6esrO5xEMhx8DuFRfjUYwvgjdGHVrWtET/f7+fhVWzSaj4ORGkLRo91iXirgSRfw2BdO3rO8JIkU4D2AgbSx0BSNF3dvMJH6Rfm1JiBSBLqTMch+kTsgap6Zyfn/ezq6aFCMrhpJW2b7F7tPLcxhLIgGsjkn4zZX5Yy3R/Ss37thR11SYPkDs2j52J5npEMshYqh41znDxRUWue+oo3qJ5CMoLRpgI1j98Jkjw1V1pniwt3e+jnhFIRRE+W2WdFjDR5iLSjC0W5dKzdO+rhoJ3g7gdl9fn1PI/Z1skJcFvofK7erbQAiCeTtA2xn0Glhuh8B2htgeczQPz3ae+lmDyvaILiycjTT7PJcn0NNt8cRFO2ZaBHpxKzVO9ykQxlUeTYuB4WSwSiAVICczq0TymKmpqQw7dCnEmb/gIGoB8JESd1WJcXNXV9czo6OjeSfuAPCPHTvarOYPUP7r0dHR0QjQO2c2ED0YDAaLyyFvKM9CTVopCLzY+nFIC7UqFisfCd5CzGcw6M9IPnu79ampnwJYNdMwzRzi2H9YNpV7yvc30dj8W2+npjLBCbBqOr9BBcPJxBKYHefXEtXmdGUlB2MA98ckXjYd4J40CGdt3LGjroUrrgUELfb+mJnLFeYxKOLD52x6ZayYxvd5vW6hyKdQvH1+JxFdxZv9t9ci0YqO2FXp6tBSYaa8kQ0s8bEiHHr3ScnvO3dL/XJGD5r2UT8Av6/X+zGA/7fMrsaYsWrVSKCuWqWDBa/XO5fjetrklZ4k5hkBIWfuj5nkMo0EPpeKcXCjVEc2mWe1mw99375WCMWypWg1quX3U+QkIHOCc/a07Z5mzoVB5p9786mfiyHhWHiGt7NziSTlMoI8BaBiJ7BOIfk2ACcWaigVJe1Zkt/80SDEElg1opL+WOSYEKXo7gaLyEpfNBBRmyX4G2De7Q+HN7hdrs+QabNPbMegp7Prj4HI6PcBQAputcjz6NCuTD8Xyvj++CRO3sOWhgCAF4s9p2pTtED3dbuXg7G8koP9WWf81RTmzzZOzvnw0K6hulehWtzj/h4zl5+TnegzxXpkr17q6RA6P4Xiwl82AfRgTMeNHy1GhVcG9xzdOQ9x+lQVusppZ3vQ42nTqWCWuUlIfv+sxmMTvGWmJh0HqyevGhkJVXdAhw4c5TYoqduIcas/Ero/337eRV2/FkZj4dVaekico7zUsOnpaYvNSEdA28xuRaiYEzuVkgq3avbZRIz1xQDQ09PTIqemlkhAYwlNELrYDOU8BpnPqON7enpaRkZG8jpxZmQELLBChxBLU64DyaJDkxsaGuZCt9TZJErdN11zozt2AkAwHL7d7er6N4LluU98k1fTnveHQs8S05GWqIBc4y9F4zRr9vXiV+iistX5nkQNcwAb4yzfF8gyC6o1a3o9NxJQdgUoAu5audl/e7HtFR13I7e/wT4ATzLwK6niiXM2BYpa8VeCM+68hMFVyLXPOQW6rvLZqaEoGWwnIVeuHK6d3bwQvp4eDax/r5x9mflyW5gXQNHTQ3yKcgLzbx39ZVH9p4UmlRTSldJN2kNaFH4Qe71eJ8f1pLatkABLHsx6rCAxZY8SITmXQR8sqs8c9PX1OXVdd6YL48T755DqXAav1+uUceOmtOp4wohGlwLIW0OCiRZSyqKYC01wUhZxxKn263xQXL6HrbcV8Uspn6dpbtCU/D5jRvxzDYp6LJLOeCpLrO1u7/5nA1OW/XJ+n9bv7wk2RHZTocBCUCI5zyxQlED39bqXAuWXzpxWtceALVLQuyOj+eNMa8GaxZ6vEePfK+hiU+Oc/VnjGLNhpnadCgnwLZL4VYLYRiS3MYntDoe+7YwNobpfAyZ+f3UKZlCzr8/jHRwK+DM/onyx6euhGKtWDoVq5uFbCNNhL/4LgEqvCMh4ctVI8EeFG77pyVzNyIoc11JgUJtlRbW3QMKQ3KSnpy3Cc5kznP1Esasx635b/JHRnNqK7vbu4iY2OYj+Y/J8BjcDuKWY9n6/P+ZxuR4AKGWxYwixLdc+FlJX9lLJez0IiKQ8ggQfDSCv5mYaJpxjeaurhrE+pSuiNovGfdx6X4yNjUW7OzvPMki8gOkUr4QOXY3dQ0TR5O2UaULRNG0e2Cor2R8cy1kdchPqkLM9F0Wu0MWVqEAS/K/OGJUcI5ZnjI5G6q6OWNPr/Sox/2cFXYyD5Vml1LFO2GsvquCYVeUxr9c5znx81TrU8RGkxaXed9RRvYA8Nkvr7UR8A28O3lKPAiz5oJaG29gSMlMCUWnQJ6s+oEORtCQqAOCY46jeJM6SDawSD3dOX9FxfmEEABzjhWSJieEiwuzSne8KOfFVUou8v79f/fvu168iQHo8nvsCgUCxz9v3pb0fHx0dLWj+oLQEUqzmnxSxogStanNmfGLZggU3FHKM9i7q+hAjGaZGwM9Htm5NnXBILLB8nRnj2BKJBN2d7o8lHJTNfgjvAVueSVlMKEKINmucOmVJYZvGrD3jCoZr+Xp6NGZZdj3sfQw8EZdgxtX+EgszVIO1i91fJlSWBIeZLh4cGa1L7fVaMenEElQp5z4AgCzQlU8AACAASURBVPClRHjaDELhc1LaMMaY6HMTUaNr5ebgd2dbmPt63JcwcH45+zLxNWf7/TUtHnPIwJS+Qo8WssVmo7+/X9U0rTfjA06m6eRK7JVpoWRQC/cliFNXpEWo6fV9+1LUyhWG2eVl7+uvn0umXdwNXR/yulyfTYRz5UK4Ne3LAKWEsTKouFoMaeaPqampvJORQCCwEwSrBqJ9vKHpP/Lt43a7O5n4B9ZtBL4hoyEVzikQjAQfBej/pW1OysEsJpSMOPUafn+VUniFTsanCVR2EZe/GIw48GwwEsqVZahmrOlxX8JMFSUtIeCWwRF/RYUVDgSk5IoK8WShA3Ma/h1A8sdBrIIRARAEsBpq4x2rLJm3ZpP7FntPAPPN5e1NG9sWLPoONtvyvDjkgjQb+j6Py3USsyIUhRMlJs0yk8LyHqwIwSw4sW3v7t3vE0yvAEgvzpR8cJcQsuZe5D7OmlY0PT2tzBp/nAalq5hFwdV0uvMdF17hzdDjcmlxQ1GDY8FM81YmAsDVybfUysAPtrpCl3lIexrMfyMhNsWl3KgYSosQfAITXwzGQPqQJfG3UBwz14OByW3bCmsxCbiJkQx/JsI1blfX4S3RyavTV+rezq6PsiF/AMJcSwe3vBIKZxTsYtDCaU0yU25nxUB49GqPq+sEgN+Z+WkWL31KnaAWlSshgUfTTlN0feOWsbFizBcVU1Cgx1ie6qTyigowgOd1GZOCLkCdV2e+Xve5AN1aWS/8HCtNNY+TrgeCpS7Ln5dlh3DlvUu7fnLuptGdADC4OXAVgKuqe5DKedDjadOZH0B5Ggoppbz4HevqW1vgoCZT5d4G0J+IJOTMU8AsM8ly5h1AEkwAOBnKRQIpPhnLFixonrDm3RZY4tG0m8EsGEIQs4CAALMgkGCGCmJBEIJhnPLCCy8sSo4zZUUXC4UK+7Vwms2Ys2UVS98nPZxKYKWnU+uHAJhZCJBgQIAhICCISbB5AYUOLFNUeU6uvq24Xa6zwVlzK7jBcAMElgwVBCgytxGVcWkoHAoVc0ykXo+itCX+UGidx9X1GJIqdEHgf59obBz0dGpPguglQLoAOpXBKRoaAj3oD41emrVjiylG5M9YJ8mhrOJ4/K8ApTr4Ztsv7X4m4AaPS7uaGIKJBSAEwIIAwZT4Hs12ghmabGxclNFnjcgr0J8aGFBfey1Sdi3uVwzGG8A1o6P1VVff1+vuBujHlfVCe6DwysEsK8xrAXG816uONzQ44+IfqmO/UzUUxekUMTUeV1RV6E4phCqEUKVuOJmESkQqgfXGOfs3lGKLrxZSpb0wCrcrkRaHLq4HcMDaln2A0B1YA5RXFZCBnwgdW+7t7m5VHTHVIEV1xhSnQXFVKIoqiZwybqiKIKckoQoyVDbIyUQqgJghxYv1jLU/QKhKBUYgUz091diYqs5nLAWw1JwCsKkYYHPPxH+JvxmJ+uTW3mdWdEUniAHeYl3eOItY1UspW8mqCmAsB2H59MTFUjYbYIDTRK1RrBc/83aCWMmCPwbGB1B6BkwJxpWBSKgoZ7oEMwK9gBBNgRzKGazra1MTlVEHCOeb30m2RST/XCd8ErkWh5yS9S/vb87v9+/2atrHmPFU6sAyv0+WWJi6pqWlAMzJZ/KGM/9N1cQAYN3v99el0hpQQKBvem3r8QsobwhSXv6iy5gO1NUr2NfX54QRXQ3rLL4suBEG/dnX61GBmWxAib+BcTBgROEwHIDKUKDDYAGhMmQiCFdKBoRI3Jrmz3T/RJPu6/U8bcC46JzhomfBFTM4FIz4ej37AIvqqgow8PH7l3hvWvGyv+7+EcXAvZ5vETJUikVDwKfgpE+pMABDgQLAEAYAYX6/YAhhPpSJJZgJoBlxAlUY8PV6XhTSOG/FllCGmvBQw+tyncDMJ2R/IJcOpa364kSnUc6lZQFEcnLQ3dnpNsCW1KEkNE2bl2+V7na755IhB6zbJOWPlujr63PuHx+vKIyp2LC8YCQy7V19v/et3g6p6B8n4JOg3HkjTHgcoN9BKlcHSihZ7XG5PoJpj3EAIMwtploeYHrW9/f3n7V31+ufBeFqWMuXphID6Hkivs4fCuesH+Ht7PoAg2dChCWzG+aEJqdmmBXFD92IwaK5I2AJgJlCMj2LFrXrZMkqVzK0M98Yqk1eYb2PeeWCMtXtOoBhSfeHwqP1Dc8ypq4DkM3TulRSS+pV6QEF85oPKKTcDODD1eq0SDbBUoWpSghpyMuQSF5xILG2x7uCwZWEKlaLY6VQbgTw/tkeSK1hiOXM/G0AIKIsDzKZsi1bGylhENHhAH8iblmha5rWCIk2Bq7J13cygZfZRgIgpiNhPuQBAIYQxzOQUspWkdKNPFm+yDCWAviptX/JnDdp1MTERLtg+iMDf0w+QRJjT2wgyzWR1vOScBLh4nLC8vyv+scA/F8A/+3VtFPB7GWmFhAfRkwtTNzCTLuFwOMNc1qeHSrD14WkkFLI88w35ribJDcDKOqZn/BluGXZggU/mWxqWiaZ3QThBvMiBoZYoWcVRdlQ1PkLHifgwzAIIEiGwAAGRHo52nQYyZhxAiQjtZiT7nQKMoxLE+cIADAMJO6z6W9Ul5SUk+ZnRJBStBBkXbWXeaXUt7vdL3QKKks4vioZt+znk0e31i+ByNpe7wCDnyrccvYh4NsrhwN1tc+v6fHcQISv1KDrqKPReMtsxNbnwtfnXQKD/wwUlVO+5hDTN1eO+POWnLVJxdvZtaIj4npoHarjv6BpWm8odHBpSbq6ujqLCR+zOTApJtteNclrY5lbYt1uK7sl762nMPf1dcxn8N31Ol4F6Ey4es+ceRVl3isHNug21Eb90xibUi+sQb9l8XBPTwsM/gUODGE+yUSXDo346/59H+z4I6P3V0uYA8DBJswBwBbmBzf1FOZAHpW7z+2ey1T+AzEKypsysOoYztuQJ8f4AcLzAF+0anPOLEM15Wy/P+jr8TwBKj/rXy6I+XMAvlvtfsthivQ7UcFktHrweih08aohfzEhRzY2NjYVkXOF7hf8HirTfg4A/5D4Q9k7l8jaHveFAK2o1/HKIMbEVxy5cNGJg8OzI8wtlJXDvAi89/d0LatR30WzZrH7KwDOnN1R8CQTfW5wOPj2rOlxbWxsbGpAToE+xvjnSjpuJFpfuFXl+LzeViaqlZCqBs9KQ7xt1ebgNw+EWObBkcATAD1ai74liRNq0W+x+Ho87ySmr8/mGMB40oDsW7XZ/8NZHccBjtvtzlW0yMbGpkxyqtzfYM5MuVgCy4m2lBLMWC6s4gt0YNhK04kCdBWG/d89e5ZTnqZjsPJpBfoQCKUXKMnPiQD+p8p9FoWvT1sIA6tReuxttdgH4PLBkcCsnH896HG5NENKIdkh4ISQUgoHM8xMbw4hVSkAQJFSABBSKuZ7RQoGEtngGER0gjTkIgDZE4TY2NiURU6BHgNVZINsOnyy5slTHulvb94/wZ+v9XFKhvG0EHzRis0Hprr1nJGRbWt73Jcy6GfV7ZlmZYV+LSBgKPegtJrF1eQ3hoqL61ECdxYROrAWQjmOIAEDUABIkBnOQwZEYtrKM1nezA3SmjmFpmP2YXv829hUmZwCXZrl98qCmVGPbGiTk80XEnh+4Za1OTyAfSDsBWMvgL0M7BVEfxwa9v/o2gNsVZ7OypHgHb5ezyoAp1WvV+79xTHavHqHr/X1uv+TgSx5mctiHIQxMJww8xC0wEw8kZqkgjEJ4ueI6J6VmwPFFbI4uJEguhqMx6vTXeH66DY2NqWRU6ArFRRkkXUQZk8NDKi7tkcur2LCl2n2Avw0gD+BxBikKbSFwD7Sxb4pYJ/qcOzLlhL2oEPhT8OgEQCNBdsWSSyqHg8gZ0anarOmxzPAwDUVdCEBuhzMGwyow+eMjNSliMJBStU0ICTYFug2NlUmp0CnomulZ6IQiVqv1Ha+NnYmEWnV6o+AW0jQbZte9g9fe4CvrqvF4FAwsqbX80MCqpZNTUCegDoJ9HuXdrWRXqHdnPCdwc3+71RvVIcwTG1IyzNOwB1MSE5uU385yVIsiXk3MxpBvMKgIvOT22Tgfau3Qwq5UCiyRTI3sxCbKolXb29vbz7ssMMEABiGIWQicV0wGNyXrb3X5foqgMdizKFmwxB6U5NI7CcaDEMYDQ1CSimcUoppnwt2sFClFFKqKsi4LBAJXQQAHR0d8x0OR4qsmZqaGi+mahsAuFyuhSpwAgPzBdEYpBxrnpoKFaqvDgAej6eDYrHUgk2yIZbIspcL4Xa70wvgRIPBYM7rP4AB9VUtdKzB3EFMHSzQTMwbyOF43u/3V7XOQx6BXllprqlJ6kSRKQDLgYirZYPTGfjM4HDgJ1Xq76CClKnrYTR8AlXK8c5E/1SNfgpxLSBUXdyDtOpXJbJlYr9xdeFmNiYZZVF1f9h8MJeCR9Mej8fjWR+ank7tK6AM+/pe0tW3F3jQosfl0nTQ7wHMByABlonxSiQnF+b/DAmCBBBl0O9Y4LbR0dGNGeNxuU4DaC0AkejP2o/Muo0QBPO6OdHo17MJFremfZkY1rLOUYDPCITDT6S3nRnHIs9SCHkOID/E0JcSAE4UdyHJ8Li0EBjrpEI3ZTuPfDSpztV6dCpZztTsez2At2ffg45i4K8OIsRVAcR1CAACBENRAd2AAKCDAKGAIEEy4W8hDAA0nXMeDYpyKST/p6Xzbc2q+m4AOWtDeDu7VrDgVZA4AYncI9PXAyQw0dgUdbu6bpfEXwuFQjknjhQ3LmOhfNm6jUm/BmbK3OzH9npVjsd/CtDymX0Y3wCQNXGUu9P9ga0UugGMJWZFQYCmiwfFdXhcWpAIP0dc/XGh+7sYcgpticrqZwtStEr2z8fqnp52VCdfO5hw3aoaCvPb+vtVX6/3lDW9nk+s7XGf+3BPzwHlkT84NLaHCPdWscu6mCIWL/Z8FcCpFXUi+eKLQqFodUb0JiCtLnQptcitBEIh39jYWNYKVIaAD6ZAtrzooWIediPhcIgIQZgFQ+YD1Aqz6EcbzInfQpiV4NoTBUs6AXQT+LNC8p+6ujLzKFiEbDNALTAnvnPTjtFmOUY7GMsB+s+JxsZfe73ejIlyTNfTfS4eyifM3Zp2IYTxV4C/Ol3pKwsaCBcKyX/1uFzf0zSt+AgWgV9kbqKc9dDTS8iWCiFpbiHggZTPCD/xRyJZhXl3R0e7x9X1KyZeC8aKPEVnGgn8WYXxgtflyiknJMSvsmzOuwj1+/0xEFnz/W8LRkIZJaO7urraPC7tD0TyEZgFX3LhZsZ/saqHPZr2sNfl+my+4xcip9B+faZScXkQJSvfVBsFxnHV64vvq1ZfVp4aGFDX9rgvPGLi768A/AcCfsxE9ySymNUMX1+fc+1iz9m+HvdPfb2el3y97j+s7fHmT7rDqFrKXAZqLiB9vd5TiFMLa5TB9we3BOuWmviQgNNs6KI8gZ4PhTlLkZ9kUZVCSM5ZtasQLULy4wMYSNFaaprWiLLDYmk5x/WMSJImRUm9joRc6lrhdnXdSIyfIVObGoRZSOZlpBo6BECfVxiveFza45qmFQ4/Znwpc+gyX5KobL4U2eRFDObzwPqCtFbQS5sksqRXsx3Q6/W2Gqr6B0sN9WQXwEYGnmPTUdlKO4P+5OnwZKsRD5CRcR5E+Lq3szOfAAYxtSb/xhiynLsw+McATrFsGifC78C4A4TnkfmcFIlSss/kO3Yhcgr01wzo5VYpBAAJOrGC3fND6K9SRxtXbA5WNbTsqYEBde1iz/m7dmwdYaKfAaSlHrI29nlTE+D5FPRogBmrQfRxmHWiT2HitWaN+OysHA48A6Ba12GqSv1k5UGPpw3gNags3jwUdc6xw6ZKJ2VlxihOoPf19TkLtzIf2gC+nOWj04tdcRJSamL7DcJbDMJbpKAFUtACqMoCcqhHGoQuInwYqSuy9khHJEUAKoqSNkHgnxuEIwzCEayIw8mhHq42NhzGijhcMfS3EvhzsGipGDgt/fw5Q9PBO7Kdi6dT+ymlVQskxncNwuJAOOQJhEP9gXCob050/2EAvy8hKKZpJdCeQvnr3S7XmQCOSd/OoPNy7kT4XePknMMMQtOisOYIhEMUCIcUgP6ftZkUtCgQDjVZXwpLjwC/lGyUdi1EZl36viP7WljXHwfDIph5N8BnsCIO94dDbwuGQ/8aDIcOA9MFSBXsjVCN67Odhkj/HkyamcQvevJoUiVz8p6gzPF6Ne1DIEudd4bPocdd/lDo3YFI6KJAKPQvgXBojhT0NgD3JZvxz/3h8IZcxy2GnDb0KZhxWEeU6UROzKc/NTCg1iQ7GvNx1XBuJ/C6ynsx8QGCe7zn7tq+9RoA2WeEACCp6gVkfD3eD2Fi700A3LmuiwCdBGBL7l74boAqXfVC1DgcSXfw3QBVpPJj4k+ev3FjzcMqD0FSHoAEWCMCRH9/v3j99dfVufv3i8nDDlOj0ajaqCgXTo2P7wVwe6HOOR6/IqHWBkyhOC0InSrzmcX0AWtdbcZYKJzThrobQMjrcl3FoB8kzwILYZYZNonH21LdiUQkFMpZEnofgB96XK7FAH0eAAho3r9/vwbrb09SGyxF3YlFhlDwuFwnAbgwuYV3E9F5/nAow+E0Yad/AsBvPJp2Phg/BbA9xsbncoxz5mQI9LW08U+bCJYcpWnHvBIKZQiYQChkToZ3ASGEkucBXmhdBLpGXXtGMZqy75ZIJAhTu2CeFaWp7zlTQE7NmbgcDKtWNsiG8t7gWMZiTAYio3d5OzufZxJ/wPS9wBg8StNufCUUei6t/VvSj5WgW5+a+hmAldk+JLL+DijTqY2t9dN5UyASzlZPXSZ8Hc7xuFxrAFojiSr258m5ymFGaLusYI1OmLdzR2Sg/A7y9l0VlbsEtlbahw8Qa3rdZ6PXO0TEdyOfMAc9Ojji/2Wlx5zm4Z6elrWLvT8F8cMA8qslKUMdlQo7qhJLTYZeMzX2ml7vVwF6T0WdMN++anPwd1Ua0puNdBv6JzwuzfC4NPa4NGPv7tfjCmP/RGPTBMf1NxoU9XUG3ShZyXhIp+NyuRZOC0EAYMKXYFFLMuhjhfpwu91zkZwEAEVoECRRyu+CoKfa9oVIP+fXCvUJFiMpfcbSareTLLQqFcRkdZoDAR/0hzKFeRoyEArdwaA7SNBFkUgkrz3Y7XKdjaR9N0qcuiqXXPiaW+HUifae4irlyQUpbw015VosW7CgmRnW5GEhqMqJWYT5DKYNnlOun5TInNykmpAm0z5b4enUvpj1AFazDiHj3mZgJsEWM2X1FbESCIcfAuGToVAoVKhtIXKrLYk27ahE5w4AEmcUblQady1b1owqxcOKCsLT7jm6c97axe4vo9ezmUCrgYKpcneq8Wz2wfJYu6Rr+RTFX2Lmjxe1gxB5VufA4MhICEBF6h4AL67YUpsSlb6+o44hcKUahJ2OJnlZVQb0JiOh8k7X6AkUY/oownlOBa5CMh/Cls6Q9hOYq85pBjweT95qihRLs8cWEOher7eV2JJ+lrApEImk/gbSVMJUxCSBwR+0vB3fL/en5jYgShViaatSb2fX6Uw43nLMH/nD4aKrVwqHcoV/dDSv8B/AgEqU1MgR40f+yOijMG3C0wM7F6WZtmYEOiFT0GUlTe1NjZSy30Rj88dhOkeaIyLcEAgECvbt0PUfwWqnFpmOaQzLsRmPMvjnqWPjG70uV2b2S7JqgTLNJWxqf8ymhFO8rq4HPK6u//Bo2qDH5TrJ4/F0pPtqBEKhqiyocseaE7+0XZqjLxciWuHr6LhscGysao5S52/cOOnr9eioIE5+Ggl0lbqPr7vreAjxGcRxNhefkEWSxAVnFnEjFjWGXu91bIZ6FP1jiypNeQW6CQUBzrCnlcBtFeybu9P+fhUTb9yJir9zvrTeWewOFYiozYwLKmNfZ34zjNvt7oQhPzX9nsHXrcM63ctdDzDxR2Yaxo1zAXwz53EUvZUtzysCBjyadmci65+TwE7J5CQy33Nc70VSWIwT8DmkT/JJtlqfgSxY93q9rer+/XJSUaTD4XBSPN4KIdogqRXEZzCQ1CIR7k2PqWaJNutjVRhGynNBEt6R8tSVRk6P82wUE9sc0UIfpaRNOqoL3GCOlx+yaEoWujvd7wxGitVoybbpayW5SIGeukqO+f3+tNh3fr/lzb6Yrt9RTLfDr766x+PShjHtH5C1NklyvCDe2RKNXjHR2HhMMpKAVAav9Xq9/zx9TfuO7GuJYiL53M9iLoHp2DYzIWPwmQDORCJcDbqBra7QpAfaeoB+Na91/o9eeOGFqpimc8ehS7lxOymV9t+GFueXAXyj0o7S2IMqrNIJ+Oi9S7u+du6m0bw3n8/rbWWVP5L4wZcu8Ig+uXKLP2dYSin4et3nAvxfJe62rRibMUFGuPwJ3DiUxmqGv80wf+LvX2VQhaVZ6XeDw4GajO9NgY62LNPHJ0znJABkUStP53QXmE+M04ko7++LDONqgJwAQMBwIBy+DwCiMv5Yg6JKTE9cCechj0CHFG0QKZOOY8DJ3yuDkKMi9E5i+Q5/OEu4FNGClFw6jF9wXEdcdcABALoBJoHpBPVpRFTDyNQqUeqzy3H44bsxNmb5mE+wvPH7t24Noor09fU5o+MTM+Ni0A9DodHpSdcDQFLFTZDnAShSoFtU7lmcxXKQ3Cf7JMDyu6fnx0pYHBJht2UO2tjf36+mCs7kCp2Zdm3csWPS3eE+gxT5AmZ8CagDur4awHsByIk5E62K9WvO4sQnCTcojE/BTB2di2YApwF82t7XX7/A7XafFwwGi1h05SenQGdV3bTTkNjDwPyKHNDoSl9fx/8MDmWPOy2T3aiO2n2eqovH1/Z4r+MR/6ODiUeRr6+vBXp0ORPeTaBTAV5W7iUgwhUrN/uLceYplswQk8IUe6P8vYy+AQDMuG/V0NB4ufvn4v6ermUSFTuLxKDwZ6oyoDcpJCyrmeltLC/LFTM8jdfl+ne/358zN4F30SI3W5y/mHAdEr/DsbGxPR5X1zqAp/P0L+vq6lqWM3GKKPuZ0MaknI4syUyI0VaeXoJ3E/P7RrZuzZJKmK3Xcu9QZhrppD8MU9kZ4HKxf2Li42TG4ANAlKdX5wAWhbue3uoK7cG05oKwor29/XOFMrd1dHTMh0WeiGzOYtmxRCWkTvw6OzvnwcwbkPicN6EEmK3hhrQlyyo4eWxhTiaCY0G/x+W6AKCZ2HxmnOrVtGv8odA1whCtM1WIzA8zBHooFNruXuR+Owl5M4CTCg8Ux8GQf+3o6FiUKz9DseRU2QaDwX3MGHterzjKai4MZ0bgfYVUs6rVsUz8MHo9//D1evb7ej0MI/oPEB43U6Jy2StDZnxz5eZA7hVFidzfrfUCdHzhlmnjAIWKbFd2OCAzV13d/tTAgCpJVKxqJ+IrBocOzMp3Bw1ZQnwMRSn40PaHw3nT6rKiXAPQ9Pf7ciAU8qUcFjIl8YhgzhNOxa2pb/ENJlxK4MsAvgygywG6HIwrQLgLKUmQ+FvZknqk2FlNxtNeMm2H3wB8Bjkcb8092UnpM9uq1Coxyi6SlY2Ojo5GYlgmyPz90dGkhnId1ulgWB13W5qczg8U6rdRiFRv9SzOYjmwXIvU/P5SypTVuDX+uxCJCUbyWclImQwkEv7MqM6FTE5AAuHwQwB/29qeGf/l0bTTIFJj19PNJdMEtwafD4RD/8YsPsjAdwF6Bnn8LwhobhCOc4s7u9zkf1ASNr1gcMepjkqLTNPn7+/Wflw1hymiu8FcmbdzJlX94RBwy+BIoKqxzlJRelHGcoHAubJLpVNu+dMNZ28JPl+4WWns3LH1/1A5Jo5Unli5OfjdqgzozUya3RcA5s+fv2d0dDR7+yI4yuXqlYyPJrew0+PSktm7GEIC81IOy3wuzDSbGSsNyVhgbasL3Jwv9aemaVcojL8iofZl0EoAP7S2IeZWnu6UMRaIhBZZP/e6uj7B4B/PtAde9ofDD+U6ZgJrrHw2gWBdSS7p6OhoLEXVnA+nql4Ctqx6QYMel3Y6AJE8TaRUsCTmjwFImWilU2xsvZXECjwpg9JU7mNjY1GPS9uJxPVicN6EL1YahGMFLNlOiei3KcOLchusFuU01fmicNeVkc7Q8UTJ5DDEuAcQN8HyEE43l6QTjAQfBfDo9Huv1+vE1FQHC6ERaCUDl1hG9W4A3y/2HLORX04zHt/HwIhRqbs7nFIoD/vMsJLK+Uf0fqBwOMAsESHQe1cOB8pRjeeniBCIHBxbKOWsr8f9RZRpxiDmm8saVR58ve6lqSuJstipq/KCqgzoTY6gjJjdfZU68kjTy9ryDCIvzHK+5ovwHrKussw2HV5NOwVZSVmhy1AolHeVGAqFtjPYah8+CWnPRLbYu4mQ8fs7vHX+HaBkUiYmfNbtdufMkun1ep0w08aafXIW/wKCNV56boOqfiSjTa7+Xa4T3C5X1siXviP7Wogzco53wgxd6+XEC2nPAQZO627vzrs6ZkrLDZHdWSwFJT1jnsg6ubFq1o45qqsrx3efpLu9uxXEX7ds2q5Tmge7oqceW8oUbdM6rNOlwCpYVtXmRCcl0mZfFnMJPJ1dnzfDMLOcjN8f82/dGgyEw0/6w6HPAJYsgYSiEjDlI69Aj0PeBSD6l8oFOgB0w0Grr610sQ9gcGwsSpBVFyIV4ifgsphOR68c9tek2tiRCzueQWoyj2IRUxT/UK4P1y72fgJE5V7Ph1aOBO8oc9+sPDUwoAJ0J1DhDU58USGHR5tiyVA9VzSh7urqWgbGoGXTMAibsr441cSWMz6aU8a4G4XDUgUsRTZgJjxJ2Yctwo2znHNiUmOdeDpNJ78c7E+fNGfaYEnSmtQmuL7H5dJy9pmgvb29mYm+RcB1iYlD6qHnTHweyfMZB+GXMy9OvICHEi+LIx6pHVDkJQAAFPJJREFU0jE1mN5fGqkCTHBBc4yavk+WVT2Bf2p9L6W8EXlkiNfrdeqOqVthDXVj3BTKrNmQ+j04nVlt4cxiJTJS684MLmOf9vb2ZhBf7WC6It84AbPaG5K+DMiTArho8qrcI5HIXq9Le3DE4HP3MTC30uxshNP7erxfx4i/YlX00HDwv5f0ensSsZKzxSQIj0Hi1sGRwJOFm1fGO9at0309nptAKCmMxYTuXLPY3UGG+vMGon1TInYCWHkXCO9k5vIS9RCCmOKqr4B3bd96CSovvvP9wc3Bx6oxHhuAidtSzT2VaciEwV+bUeETng6EQifnautdtMjNpARmjgxeoWna59If0qkZvArGiwuPy/VlAFpyE6ckRWpvb28miymOkV1IBUIhn8elXYkZj2z6uLvDfXNwLJjpxKXGU50LswiFSX3qsSaHcxuSDmFuHfS/R2na+7Jlblu2YEHzRFPTCjCuA0MDCIjHPwGL+cDtds8lQ1qeu3RdIDT67fS+Ztq7XGcSaMZ/IZHY54e52gvgLSm3h5QFJ9JspJpxsmXM04nuVRg3YCYDIB3ncXX9lqT+yXTvf3eHeynH9XsoJSKGNzmaGjPHTZRyP/v9/qz3czASfNqraZdxanW8RNeZ2pVGp/NTYLQx4csel2s5M1/RGXGvT0+y07Woaznrxt1WkSqAW7ONoRQKOhsx+McMOvdZXeI9jooX12Dir6zt9QRWDgf+p5J+rgXkbXMOv2De5Bt/IZZfAkireHCF2QngaSb6Ixvy6TcOO2LDp6sUP1gsgyOBb/t6vSfCjG0sBZWYboAwbpgCEuYlRjk2+QQxQXTWimAga83kCqnUI33TRNS4vCojsTFJK8zCXHgFlgv3IvdxIJks18mc97vyb90a9LhczwM0PfGcK5hPB/Bg2iAtMeM83+3SbiKwSmY8sQomlcl8D8JSMNJ9S1KqbzU0NLTCki2TKOckRjKLqxKVtQBAQJE/BXAi0lf8aYIk26p027Ztk+5F7g+TkH9CUku1UDL/xePSngboVyDeCeYOAIsngI+AUwvIMOiKvr6+n8yohHX5ZdCMqn+bQZzXVhszjMcaFHUcycI0J3gXLXLnCqFLj63PtuLNgNIiJ7KEgIVCoahb064mtgo7ficLZcjtcj1KEH9LbHsXIJcjRabxGOmO942MjGRG3zC1WR5+e/5/e/cf3VZ53gH8+zz3SnacNBCThCzE1s/EAaehq1PaQdaGAu3WUmgIGA6jbLSFdO0Y7DC2Q7udstNlLKdjwOi20EEPPwoEQzfGUgqBhSykrISEMSC2k0iyZNxgshBCMI6R732f/XHlRJLl+JdkWfbzOSdHutKV7qtY0lf33vd9XpzgaE4smbwzHAicQ6C8Sa5y2xsMBqtJsqf+pRVE9J9vBZLpMIKtBHkTwGHvfSx5/ZXk3n3J8dVxB0YQ6PFUamskEIhtcxA90xKcyuPdTQcEuKfl9EiguS0+rt7vmTC9swX4Bzk9chF5swatGncDj9tLRNthzIvE2F7siVzGrKfv9zDL/yxAw55PKhUCrr+0NTbuN2C+x5dGzpYTTzc4nP0GskanRS26nMOjhc4njxRb5ras8cGdI6mCRkRPS1Y9b/L2GPMCPfuQOy0i4EaAMl/bmbmoBwIk74csAT/J78xGDuWMaycz9GtOdCY2RQLB15DpxEnAWZH60LfjnR25wZlXx32oc82JtxI7I/Wha0GSNTsj2QBWAbLqWJGSfILNxqKbs4f2RSKR+XDcm46vQs8kkx0n/Hx0dXX1ReqDL4GOF8kRtq8E8NcFH5Bbk90Mtceb+5j8Mf6Fx64nkskNkfqQDZK7s26u9gJWCs8kSXiTBZftG2LaXQF+4/gBouF75Puqq69x+j46G9nD6PI68bHDUVjuJgFdSbmdrP1e514q3MFX8GC8M7V2uDaMxIh2uYXoPhfAz/qleFOFCb7b0hB56J6mpnFXfGsGzOVt8Seb2+PnWg7VCeiLQvQnIrgXXtWeg/AmHugBpBdeScB05noMkG0CbCTInQLcDMJqxzanNrfHGy5ri33jsj2J+ydNmMPrQzBvQf15BPwNxlG+dqwE+NF4j7AMxYCuHcfDu2Dhc1e0j79AgzouHAhcieOTdgAARFA70lnUskUDgW+L5Mxjf8Jx7Me2N3gO7gsXB4PHviAznaXG0ufisBD+MJZKDnrfkWWuz142NExlSMK27EUhWb84EDhWoaypqckG55SFhbDk9CjPFu/seNAwNYDwY+QMsSuwacEOEb4g3pn8YnaYL1m4ZC4c9wFk/f2Ihj+6EolE5hMht3OfyNpCU4uGw+ElyB1vnY7W1QVP9PxLFi6ZC0FuZz/hIefBiHd2/MgIXQBvytgTOQDQX1bPnNm0L5UqOKoqFArVU9Y0rAKZ1VBXt7DQugO8vfzc4b/ECGf3VUh0Jd6Mp1LXOmJOE29Pfbj+TtuEcE28M3kNivQ9PqLd7VAoNJ+NdACo+bKPsdIuwlRnx21BWlY3JxKlOHQ75T3WEFlFwEMgnLDOdZEchtC1zXtiT5Tiyf+9oWHWR9T/DkBjGULYaRnr3DV79xa1qtZ0F41G/abfWV/oPkO4Z7jpObMtqa8Pu8xrgcwXj4ExAFySu1Kp1JDnvBvq6hY6bGdNrmG8otRE78aSyTsBIBII/SmRfGxQGw3c/NsI6BOSGBl7r2u5sQIdphAOh2ez6/5R/u2xVOpvUeDLNxqN+qXfzZvMwxgh6k0kkxuOvX6inBAT4HAilRq28FQoFJpPrvwBE0IiqAVJLYT2E+g5S5wthQvYAIuDwbNEZIXJVPIjwIiIM9w2I3WRZcLOoJoXFnNsX0dHzg+XUF1oJVPu5FDM8nqh8/1Zr2cJGZPbd0ekO9HZOVxfJF4cDC53RcIEDkNkMUjSAKeIZEcsmdyOYcIxFAotsfJLwfbbr8aG2JsHvB9j7x08OGiotCHaUuj9M6AhEAi6wisAaTLw3rMEc8gCtuxJpZLDvNZRG3EyR4PBG0Vwhw/ADdUWTilmphMSJPSNy9pjW4v4rNPG09Gov8cyXwfRLQCGHDIzTlsth762Jjb0m368Ni4Jr2CmV8bw0K2w5PebdyeKXlVLKaUqxWhimSOB4C8BfCbMhG9WcTGmJM9vzL2Slpt0b31s7mlqsuf0vn81RG7C+M5DZ6FDQmZ9W1vi724t8eH9lqXhZQC9MYqH9EDk5uY9iQ0la5RSSlWIUWVytL7+DCH+HwD+C3yMzxf30PuA/QJae3l7bNPwq6qhbFwaXmKBLhTIxZmxtqMZonBEgCdB8tjhmjmbJ6on/6PLIossZ0Rz1DsQbLLY3LCmrWNa75W3nB5pNiKvab8BpdSoEzkSCP0FID8AgAt9jHNKE+oA4Qkj8j39ohq/lsZFteRWrzCQeiKERChIJPUQ1AA4AMFBr6MMvwNB60wXz3zpBBNqlNLjDdH1QvJnBe5yAGwRkcfITj9Z5Ml+KlbL0vDtAF0H4Prm9vj95W6PUqp8Rp3GTU1N9vsH390lmSIKX/UxPl2qUAeMAC1CWHdFW3xUM+2oytXSGImaNNvMjjFEYIuMz+ce1LnMB2s5PfrPEMnUg6ZHqsRae3GhcbdKqSlvTEkcCoWWs5EXkSked6mf8UmrZKHuETxpmH5wRVtsuGELSk0LjY2N/m/1H33uVM6pR5AwRi4vxWQ5SqnJbcwpHAkEzgbwLECzGMDlfsbyUoc6ABCeAcztrW0dW24twxhspSaL+vr6k6+ust8r8LlziPC9Yk7dq5Sa/MaVwJFAYBVAvwBQzQAu8TOaJiLUPfsJeMQlPKCH49V01FBXt/DKat+vTx/yMyebHVu+phPUKDU9jDt9o8HgF0TwH8hUafqkRbjYz+OfB240RF4D8UOO7f5Uv7zUdBGtqwtfM8MXX3zicswHAfzVvAV1G87dunVC5x1QSk2souxOR4PBi0TkZ5law5hHwJV+xoIi1H0fJQNgM4CfM8kzk6lcq1LFFqmLLFs7Q94IjuxztheEP29uiz85/KpKqUpUtMQNBwKXAPTQQFF6H4Cv+BifKl0P+BGQJECbBfKsv9ps0V7SaioJ14VXXD8Dr5w2mh/OhO1MfNOlrft2lK5lSqlyKGraLg4Elhqix7OnJTzTIqz2M6qKuaGxMQB2ALQZxjyH3vTO5q4unZFLVazFodBnb/Dzf80fw6eYCC3sWrdo7Xulpo6i7z4vWrSousqy7gbomwO3zSLgPJtxlk2jKldWYgbeTE87hegVAV7lD/pe05BXlSIaDH7h5irr2Tlj/xSnReiffGT/4JL2di3Uo1SFK9nx8HAweAUJ/gXArIHb5hHwOz7GGRPXE360HACtAnqVCa8Q0c6+tLRfFYtpbXk16USCwa9+t8r6t4+N/+PUJ4KfCuMuHTGiVOUqabKGF4WjsMzj3uTux4WY8Ls+Qt3Ed5obq4MAYhDEQLJPgL1iEKuqMTE9L6/KJRwMXnFrlfVodXE/RltI6K7de2KbbtU6D0pVlJInalNTk3344KFvAeb7AM3N3vByi3CejzGvYnK9EDoE8sKeRBIC+TURDgDU7TrUPfOk3u6v7NrfW+5WqqknHAh8fd0M+z6rNE+fAOgfkTb36uyHSlWGCYvSaDQ6G2nnFiHcCKA6uwERJvyWTVhqTapz7MXUA8IBCLoBdItIN5jeJsEBEuoG4YhAjhhIj4/cIy7P6mnevVvrcU9TLQC/19TEc/r6+MMPP+S5p6T5aN8crnIcfNTfz/0zHZ7RX8N/39d33R9XW7eVuDk9IvKgZVkPaM94pSa3Cd83jkQii+A4twF0Vf59JxHwaZvxKYswq6L32oumB8CR/EsB9TDJERHpBZEREYeFHCHpF7DDJI4IOSLiMHuXudfZYTKOCDvCwizCIswCMLFAvAUWZhYRJoBFhPn4MkSExbuBjYCZB55DmATwntdbXxhMIixgi48tAwLynpfABmCGsBCxiHfdCMDsLYuACcJC7K0nA231tsnktRFgBoRBYHjLgGSWkbn/2DIYEICIIZlloszjBu4nb53c5cy6A9uggd+hPOQ/AY5vc8h/k12CgI3E9PClrbHWcjdGKZWrbLEZDQQ+AaIfiuD8/PssAB+3CJ+xCYHKOc+u1HTypoAeJbEead6zJ1nuxiilyhjoAyJ1kWXE7ncEchVAs/LvP4WAMyxCo0WoZyp/g5VS+XYK4RmAnztcM/ultbt2aYlZpcpg0uRjNBqdLf3u1YB8B8DSQuvMyoT7GUyIWoQSdQZSSo2Z9EJoK7E854Ke12FwSk2cSRPo2SKBwCoCXy8wFw3Uh89XBaAhs+ceYcLMSflKlJr2uiF4HkzPWuh/fk1bqrvcDVJqqprUMRgMBhdYwEUwWAPC5wEUDHfAK1oTtAhBJoSYMI7qWUqp0mkVyFOWyKOX7ul4vdyNUWoqqZjYC4fDs+G6FwJYDdCXBiaBGcps8grYeAEPzNfz70qViwNgOxF+ISJPN7cn9DC8UiVQkRkXDAar2fD5TGa1ABcCmD/cY6oAnMqEBQwsoOOXMyryf0CpyU0AxF1Jt7lm525XHn6PeVNHR0dnudul1FQ2JeIsHA4vYdddKUKfA2ElgPBIH3sSAQuYsCBzeSoBc4hQ5HKaSk0LhwTY5RjscgXvS96dhBgMngfjhaPp9Kb9+7WColLFNCVjq6GubqFL9koh89sE+qwAyzDKwh0zMsFeS8AcAmrJOy9fmzk/P+TJfKWmGQfAG65gpyPoMIL8HAfQC9BWgvm5uPbmeFc8Aa0Tr1TRTclAzxcOh2dbIp8QY5YJ0ZkQLIcX8oPGvY8EwRtCdxIRajIn82dkLmuybquhzDKge/xqyukR4FeOwcuuoGdwiveC8AQRPQzL2hqLxdJlaKJS08q0jpmGQCDoGl4ujOUg+Xgm6MMA/MXeFmP40Peue7f7yRtnz/Aq51l0/Hol1AhVU9fbRvBLR/C/rqBABZlfQeg+e4Z/4549e3Q+AqUm0LQO9CFw9LToQpfdIFsSJiAiQBBAGCJBgBaizJlKyAp3ygR+5jZ74L68HwQMwM77UaB//MpVx4Rz7In7CwqAdlew3REkzKDd8QOAPMjAfftSqfYJa5RSKod+p49SY2Oj/+j7R+uFJUhk5pNwrUBqiWQegWoFqAVhLgS1AOYCmF3uNqup5zctQrO/9L8r0wB2OoKXHIN383KcgNeFcAfZ9iN6SF2p8tNAL7FVWGV3RbtOdhxnrmVMLcGqFZa5EKkF+BSIzBWSWgLNJaBWILUCqiXvsL/2vVMFnWUTVvtKF+iHBXjJMXjFFfTlBrkBYRNE7oinUltL1gCl1KhpoE9yTU1N9ttvv+2vrq627T7b/5HvI5uZ/dzPfrYc22H2s+vaROQnZr/rujYx+8mQbcj4iSj7ug0hP5HYIoVL6qrKsNLG97/s4zF16jyRlPEOq7e6ktcNXXoA3A/XviveFY8Ve7tKqfHTQFeqAl0XCb13vo9PLsZzGXjDzrY7gq7B58c7AblLLOveRCJxpBjbU0qVhu6lKVWB7CKMxHAA7HIE2xyDQ4NynF4iwR2xzo5/hY4ZV6oiaKArVYFsGnugpwG87AhedAw+yA1yh4AWY/iOxFuJneNto1JqYmmgK1WB7DF8dnsF+G/X67Hemxvkh0WwwTbO3Xu7uvYXrZFKqQmlga5UhWlsbPT70kdHvP4HArzoGLzsCPLGlnUDdHt1b82G3f+3W4vAKFXhNNCVqjBHjx6t9lnDr3dIgG2OwS4nt6KbAEkQ1rNt/0THjys1dWigK1VhXNet8VlDJ/o7RrDVEbw+aOgZWknotnhnxyPQjm5KTTka6EpVmCqRGl+BAadvGcELjqDdzZ3xjAQ7wFgXSyafmrBGKqUmnAa6UhXGFV+NLyuy40bwQr8gPngM+RYRsy7e2bllQhuolCoLDXSlKoxAqm0Ara53aP2t/CAXPMWMdfuSyR1laaBSqiw00JWqMGyZmgfTwJG8GusE2ghx18U6O1vL1DSlVBlpoCtVYQSoyQrzNAT3WzDr93Z2JsrYLKVUmWmgK1VpRKoB9AD8Ywfmh6nOVHe5m6SUKj8NdKUqjFjWq+l0OtDVlTpU7rYopZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkqpEvl/Bx28DV6wg8UAAAAASUVORK5CYII=", vh = gh, yh = "This estimate total applies to payments made by cash, check, ACH, or debit card. Credit card payments are subject to an additional 3.5% transaction fee.", bh = "www.elitestonefabrication.com", wh = [
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
], ph = [
  "This estimate is valid for 30 days from the date shown unless otherwise noted in writing.",
  "Final pricing may change after field measure, material selection, template, and plan review.",
  "Payment terms, deposits, and schedule are confirmed in the signed customer agreement.",
  yh,
  "Natural stone and quartz may vary in color, veining, and pattern; samples are representative only."
];
function es(ge) {
  return `$${Math.max(0, Math.round(ge)).toLocaleString()}`;
}
function vf(ge) {
  const ue = Math.round(ge);
  return ue < 0 ? `-$${Math.abs(ue).toLocaleString()}` : `$${Math.max(0, ue).toLocaleString()}`;
}
function Th(ge) {
  const ue = ["Vanity program"], W = ge.colorLabel?.trim();
  W ? ue.push(`Color: ${W}`) : ge.projectColorTbd && ue.push("Color TBD");
  const Ae = ge.materialGroup?.trim();
  return Ae && ue.push(Ae), ue.join(" · ");
}
function xh(ge) {
  const ue = ge.quoteNumber?.trim();
  if (!ue) return null;
  const W = [ge.projectAddress, ge.city, ge.state].filter(Boolean).join(", "), Ae = ge.customerDisplay;
  return /* @__PURE__ */ q.jsxs("div", { className: "customer-estimate-print", "aria-hidden": "true", children: [
    /* @__PURE__ */ q.jsxs("header", { className: "cep-header", children: [
      /* @__PURE__ */ q.jsx("img", { className: "cep-logo", src: vh, alt: "Elite Stone Fabrication" }),
      /* @__PURE__ */ q.jsxs("div", { className: "cep-header-text", children: [
        /* @__PURE__ */ q.jsx("h1", { className: "cep-title", children: "Elite Stone Fabrication Estimate" }),
        /* @__PURE__ */ q.jsx("p", { className: "cep-date", children: ge.estimateDate })
      ] })
    ] }),
    /* @__PURE__ */ q.jsxs("section", { className: "cep-section cep-overview", children: [
      /* @__PURE__ */ q.jsx("h2", { className: "cep-h2", children: "Project overview" }),
      /* @__PURE__ */ q.jsxs("dl", { className: "cep-overview-grid", children: [
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Estimate date" }),
          /* @__PURE__ */ q.jsx("dd", { children: ge.estimateDate })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Quote / estimate ref." }),
          /* @__PURE__ */ q.jsx("dd", { children: ue })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Customer" }),
          /* @__PURE__ */ q.jsx("dd", { children: ge.customerName || "—" })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Account" }),
          /* @__PURE__ */ q.jsx("dd", { children: ge.accountName || "—" })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item cep-overview-span-2", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Project / Elite job name" }),
          /* @__PURE__ */ q.jsx("dd", { children: ge.projectName || "—" })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item cep-overview-span-3", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Project address" }),
          /* @__PURE__ */ q.jsx("dd", { children: W || "—" })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Branch" }),
          /* @__PURE__ */ q.jsx("dd", { children: ge.branch || "—" })
        ] }),
        /* @__PURE__ */ q.jsxs("div", { className: "cep-overview-item", children: [
          /* @__PURE__ */ q.jsx("dt", { children: "Salesperson" }),
          /* @__PURE__ */ q.jsx("dd", { children: ge.salesRep || "—" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ q.jsxs("section", { className: "cep-section cep-estimate-summary", children: [
      /* @__PURE__ */ q.jsx("h2", { className: "cep-h2", children: "Estimate summary" }),
      /* @__PURE__ */ q.jsx("table", { className: "cep-table cep-table-compact cep-table-amounts cep-summary-table", children: /* @__PURE__ */ q.jsxs("tbody", { children: [
        Ae.estimateSummaryRows.map((ve) => /* @__PURE__ */ q.jsxs("tr", { children: [
          /* @__PURE__ */ q.jsx("td", { children: ve.label }),
          /* @__PURE__ */ q.jsx("td", { className: "cep-amt", children: vf(ve.displayAmount) })
        ] }, ve.key)),
        /* @__PURE__ */ q.jsxs("tr", { className: "cep-summary-total-row", children: [
          /* @__PURE__ */ q.jsx("td", { children: /* @__PURE__ */ q.jsx("strong", { children: "Estimated project total" }) }),
          /* @__PURE__ */ q.jsx("td", { className: "cep-amt cep-summary-total-value", children: /* @__PURE__ */ q.jsx("strong", { children: vf(Ae.finalRounded) }) })
        ] })
      ] }) }),
      /* @__PURE__ */ q.jsx("p", { className: "cep-muted cep-round-note", children: "Estimate only — not a contract." })
    ] }),
    Ae.showRoomBreakdown ? /* @__PURE__ */ q.jsxs("section", { className: "cep-section cep-room-breakdown cep-section-compact", children: [
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
        /* @__PURE__ */ q.jsx("tbody", { children: Ae.roomAreaPrintRows.map((ve) => /* @__PURE__ */ q.jsxs(hh.Fragment, { children: [
          /* @__PURE__ */ q.jsxs("tr", { className: "cep-room-breakdown-main-row", children: [
            /* @__PURE__ */ q.jsxs("td", { children: [
              /* @__PURE__ */ q.jsx("strong", { children: ve.displayName }),
              ve.isVanity ? /* @__PURE__ */ q.jsxs("span", { className: "cep-muted-inline", children: [
                " ",
                "·",
                " ",
                ve.vanityProgramLabel ? `${ve.vanityProgramLabel} · ` : "",
                Th({
                  materialGroup: ve.materialGroup,
                  colorLabel: ve.colorLabel,
                  projectColorTbd: ge.colorTbd
                })
              ] }) : /* @__PURE__ */ q.jsxs("span", { className: "cep-muted-inline", children: [
                " ",
                "· ",
                ve.materialGroup,
                ve.colorLabel ? ` · ${ve.colorLabel}` : ge.colorTbd ? " · Color TBD" : ""
              ] })
            ] }),
            /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: es(ve.displayedMaterial) }),
            /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: ve.displayedAddOns > 0 ? es(ve.displayedAddOns) : "—" }),
            /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: /* @__PURE__ */ q.jsx("strong", { children: es(ve.displayedAreaTotal) }) })
          ] }),
          ve.addonLines.length > 0 ? /* @__PURE__ */ q.jsx("tr", { className: "cep-room-breakdown-detail-row", children: /* @__PURE__ */ q.jsxs("td", { colSpan: 4, className: "cep-room-includes", children: [
            "Includes: ",
            ve.addonLines.map((Se) => Se.label).join(", ")
          ] }) }) : null,
          ve.customerCustomLines.map((Se, nn) => /* @__PURE__ */ q.jsxs(
            "tr",
            {
              className: "cep-room-breakdown-detail-row",
              children: [
                /* @__PURE__ */ q.jsx("td", { colSpan: 3, className: "cep-room-custom-line", children: Se.name }),
                /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: vf(dh(Se.amountExact)) })
              ]
            },
            Se.lineKey || `${ve.roomId}-custom-${nn}-${Se.amountExact}`
          )),
          ve.customerNoteLines.length > 0 ? /* @__PURE__ */ q.jsx("tr", { className: "cep-room-breakdown-detail-row cep-room-note-row", children: /* @__PURE__ */ q.jsx("td", { colSpan: 4, className: "cep-room-note", children: ve.customerNoteLines.join(" ") }) }) : null
        ] }, ve.roomId)) }),
        Ae.unassignedExact !== 0 ? /* @__PURE__ */ q.jsx("tfoot", { children: /* @__PURE__ */ q.jsxs("tr", { children: [
          /* @__PURE__ */ q.jsx("td", { colSpan: 3, children: Ae.unassignedExact < 0 ? "Project discount / credit" : "Other project items (see Estimate summary)" }),
          /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: vf(Ae.unassignedDisplayTotal) })
        ] }) }) : null
      ] })
    ] }) : null,
    Ae.roomComparisonTable ? /* @__PURE__ */ q.jsxs("section", { className: "cep-section cep-section-compact cep-comparison cep-comparison-print", children: [
      /* @__PURE__ */ q.jsx("h2", { className: "cep-h2 cep-h2-muted", children: Ae.roomComparisonTable.isPerRoomMode ? "Optional material comparison by room" : "Optional material group comparison" }),
      /* @__PURE__ */ q.jsx("p", { className: "cep-muted cep-comparison-note", children: Ae.roomComparisonTable.isPerRoomMode ? "Illustrative only — alternate material tier pricing for the rooms shown. Other rooms use the selected material above." : "Illustrative only — shows estimated area totals at alternate material tiers with the same scope and add-ons." }),
      Ae.roomComparisonTable.roomBlocks.map((ve) => /* @__PURE__ */ q.jsxs("div", { className: "cep-comparison-room-block", children: [
        /* @__PURE__ */ q.jsx("h3", { className: "cep-h3", children: ve.roomDisplayName }),
        ve.groupBlocks.map((Se) => /* @__PURE__ */ q.jsxs("div", { className: "cep-comparison-group-block", children: [
          /* @__PURE__ */ q.jsxs("p", { className: "cep-comparison-group-heading", children: [
            /* @__PURE__ */ q.jsx("strong", { children: Se.group }),
            Se.colorLabel ? /* @__PURE__ */ q.jsxs("span", { className: "cep-muted-inline", children: [
              " · ",
              Se.colorLabel
            ] }) : null
          ] }),
          /* @__PURE__ */ q.jsx("table", { className: "cep-table cep-table-compact cep-table-amounts cep-comparison-detail-table", children: /* @__PURE__ */ q.jsxs("tbody", { children: [
            Se.countertopDisplay > 0 ? /* @__PURE__ */ q.jsxs("tr", { children: [
              /* @__PURE__ */ q.jsx("td", { children: "Countertop material" }),
              /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: es(Se.countertopDisplay) })
            ] }) : null,
            Se.backsplashDisplay > 0 ? /* @__PURE__ */ q.jsxs("tr", { children: [
              /* @__PURE__ */ q.jsx("td", { children: "4-inch backsplash material" }),
              /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: es(Se.backsplashDisplay) })
            ] }) : null,
            Se.fhbDisplay > 0 ? /* @__PURE__ */ q.jsxs("tr", { children: [
              /* @__PURE__ */ q.jsx("td", { children: "Full-height backsplash material" }),
              /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: es(Se.fhbDisplay) })
            ] }) : null,
            Se.extraLines?.length ? Se.extraLines.map((nn) => /* @__PURE__ */ q.jsxs("tr", { children: [
              /* @__PURE__ */ q.jsx("td", { children: nn.label }),
              /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: es(nn.displayAmount) })
            ] }, `${Se.group}-${nn.key}`)) : Se.addonsDisplay > 0 ? /* @__PURE__ */ q.jsxs("tr", { children: [
              /* @__PURE__ */ q.jsx("td", { children: "Add-ons / fixtures" }),
              /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: es(Se.addonsDisplay) })
            ] }) : null,
            /* @__PURE__ */ q.jsxs("tr", { className: "cep-comparison-room-total-row", children: [
              /* @__PURE__ */ q.jsx("td", { children: /* @__PURE__ */ q.jsx("strong", { children: "Room total" }) }),
              /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: /* @__PURE__ */ q.jsx("strong", { children: es(Se.roomTotalDisplay) }) })
            ] })
          ] }) })
        ] }, `${ve.roomId}-${Se.group}`))
      ] }, ve.roomId)),
      /* @__PURE__ */ q.jsxs("div", { className: "cep-comparison-project-totals", children: [
        /* @__PURE__ */ q.jsx("p", { className: "cep-comparison-project-totals-label", children: /* @__PURE__ */ q.jsx("strong", { children: Ae.roomComparisonTable.isPerRoomMode ? "Subtotal (shown rooms)" : "Estimated project total" }) }),
        Ae.roomComparisonTable.selectedGroups.map((ve) => /* @__PURE__ */ q.jsxs("p", { className: "cep-comparison-project-total-line", children: [
          ve.group,
          ve.colorLabel ? ` · ${ve.colorLabel}` : "",
          ":",
          " ",
          /* @__PURE__ */ q.jsx("strong", { children: es(Ae.roomComparisonTable.projectDisplayTotals[ve.group] ?? 0) })
        ] }, ve.group))
      ] })
    ] }) : null,
    Ae.customerFacingNoteLines.length > 0 ? /* @__PURE__ */ q.jsxs("section", { className: "cep-section cep-section-compact cep-project-notes", children: [
      /* @__PURE__ */ q.jsx("h2", { className: "cep-h2", children: "Project Notes" }),
      /* @__PURE__ */ q.jsx("ul", { className: "cep-project-notes-list", children: Ae.customerFacingNoteLines.map((ve, Se) => /* @__PURE__ */ q.jsx("li", { children: ve }, `note-${Se}-${ve.slice(0, 24)}`)) })
    ] }) : null,
    /* @__PURE__ */ q.jsxs("footer", { className: "cep-closing", children: [
      /* @__PURE__ */ q.jsxs("div", { className: "cep-footer-terms-sig", children: [
        /* @__PURE__ */ q.jsxs("div", { className: "cep-terms-box", children: [
          /* @__PURE__ */ q.jsx("h2", { className: "cep-terms-title", children: "Terms & conditions" }),
          /* @__PURE__ */ q.jsx("ul", { className: "cep-terms-list", children: ph.map((ve) => /* @__PURE__ */ q.jsx("li", { children: ve }, ve)) })
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
      /* @__PURE__ */ q.jsx("div", { className: "cep-branches", children: wh.map((ve) => /* @__PURE__ */ q.jsxs("address", { className: "cep-branch", children: [
        /* @__PURE__ */ q.jsx("strong", { children: ve.city }),
        ve.lines.map((Se) => /* @__PURE__ */ q.jsx("span", { children: Se }, Se))
      ] }, ve.city)) }),
      /* @__PURE__ */ q.jsx("p", { className: "cep-website", children: bh })
    ] })
  ] });
}
const Eh = ".cep-header{display:flex;align-items:center;gap:14px;margin-bottom:10px;padding-bottom:10px;border-bottom:2px solid #b91c1c}.cep-header-text{flex:1;min-width:0}.cep-comparison-room-block{margin-bottom:8px}.cep-comparison-group-block{margin-bottom:6px}.cep-comparison-group-heading{margin:0 0 4px;font-size:.72rem}.cep-comparison-detail-table{margin-bottom:4px}.cep-comparison-project-totals{margin-top:6px}.cep-comparison-project-totals-label{margin:0 0 4px;font-size:.66rem}.cep-comparison-project-total-line{margin:2px 0;font-size:.66rem}.cep-logo{width:108px;height:auto;flex-shrink:0;display:block}.cep-title{margin:0;font-size:1.2rem;font-weight:700;letter-spacing:-.01em;line-height:1.2;color:#0f172a}.cep-date{margin:4px 0 0;font-size:.8rem;font-weight:500;color:#475569}.cep-section{margin-bottom:8px}.cep-section-compact{margin-bottom:6px}.cep-muted-inline{font-weight:500;color:#64748b;font-size:.66rem}.cep-h2{margin:0 0 5px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#64748b}.cep-h2-muted{color:#94a3b8;font-weight:600}.cep-h3{margin:0 0 4px;font-size:.8rem;font-weight:700;color:#0f172a}.cep-muted{margin:0 0 5px;font-size:.72rem;line-height:1.35;color:#64748b}.cep-overview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 12px;margin:0;padding:8px 10px;border:1px solid #e2e8f0;border-radius:4px;background:#fafbfc}.cep-overview-item{margin:0;min-width:0}.cep-overview-item dt{margin:0;font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748b;line-height:1.2}.cep-overview-item dd{margin:1px 0 0;font-size:.74rem;font-weight:600;color:#0f172a;line-height:1.25}.cep-overview-span-2{grid-column:span 2}.cep-overview-span-3{grid-column:1 / -1}.cep-material-group{margin-bottom:5px}.cep-material-group:last-of-type{margin-bottom:4px}.cep-table-scope tfoot th,.cep-table-scope tfoot td{font-size:.68rem}.cep-material-scope-foot td{font-weight:600;font-size:.68rem;background:#f8fafc;border-top:1px solid #cbd5e1}.cep-material-group-amt{vertical-align:bottom;padding-left:10px!important;white-space:nowrap}.cep-group-material-label{display:block;font-weight:500;font-size:.58rem;color:#64748b;text-transform:none;letter-spacing:normal;line-height:1.2;margin-bottom:1px}.cep-group-material-value{display:block;font-weight:700;font-size:.72rem;color:#475569;font-variant-numeric:tabular-nums}.cep-vanity-group-amt{margin:2px 0 0;text-align:right;font-size:.66rem}.cep-scope-grand{margin:6px 0 0;padding-top:5px;border-top:1px solid #e2e8f0;font-size:.7rem;font-weight:600;color:#475569}.cep-room-breakdown-lead{margin:0 0 8px;max-width:52rem}.cep-room-breakdown-table{page-break-inside:auto}.cep-room-breakdown-main-row td{vertical-align:top;padding-top:6px;padding-bottom:4px}.cep-room-breakdown-detail-row td{padding-top:0;padding-bottom:6px;border-top:none;font-size:.62rem;color:#64748b}.cep-room-addon-list{margin:0;padding:0 0 0 14px;list-style:disc}.cep-room-custom-line{padding-left:14px!important}.cep-addon-room{color:#64748b;font-weight:500}.cep-subtotal-row td{border-top:1px solid #cbd5e1;background:#f8fafc}.cep-num{text-align:right;font-variant-numeric:tabular-nums}.cep-comparison{opacity:.92;padding:6px 8px;border:1px dashed #e2e8f0;border-radius:4px;background:#fafbfc}.cep-comparison-note{margin-bottom:4px;font-size:.66rem}.cep-comparison-table{font-size:.66rem}.cep-comparison-table th{background:#f1f5f9;font-weight:600}.cep-estimate-summary{border:1px solid #cbd5e1;border-radius:4px;padding:8px 10px 6px;background:#fff}.cep-summary-total-row td{border-top:2px solid #0f172a;padding-top:6px}.cep-summary-total-value{font-size:1rem;color:#b91c1c}.cep-round-note{margin-top:4px;font-size:.62rem}.cep-closing{margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0}.cep-footer-terms-sig{width:100%;max-width:100%;box-sizing:border-box}.cep-terms-box{padding:8px 10px;border:1px solid #cbd5e1;border-radius:4px;background:#fafbfc}.cep-terms-title{margin:0 0 4px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#334155}.cep-terms-list{margin:0;padding-left:1rem;font-size:.64rem;line-height:1.35;color:#334155}.cep-terms-list li{margin-bottom:2px}.cep-project-notes-list{margin:0;padding-left:1rem;font-size:.72rem;line-height:1.4;color:#334155}.cep-project-notes-list li{margin-bottom:3px}.cep-signature-block{margin:8px 0;padding:6px 0 4px}.cep-sig-line-inline{display:grid;grid-template-columns:auto minmax(2rem,1fr) auto 5rem;align-items:flex-end;column-gap:8px;row-gap:0;margin-bottom:9px}.cep-sig-line-inline:last-child{margin-bottom:0}.cep-sig-role{font-size:.66rem;font-weight:600;color:#374151;white-space:nowrap;padding-bottom:2px;line-height:1.2}.cep-sig-role-date{padding-left:4px}.cep-sig-under{border-bottom:1.5px solid #0f172a;min-height:.95em;margin-bottom:1px}.cep-sig-under-main{min-width:0}.cep-sig-under-date{width:100%;max-width:5rem}.cep-branches{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:6px;width:100%}.cep-branch{margin:0;font-style:normal;font-size:.62rem;line-height:1.35;color:#334155;text-align:center}.cep-branch strong{display:block;margin-bottom:2px;font-size:.66rem;color:#0f172a}.cep-branch span{display:block}.cep-website{margin:0;text-align:center;font-size:.7rem;font-weight:700;letter-spacing:.02em;color:#b91c1c}.cep-table-compact{font-size:.72rem}.cep-table-compact th,.cep-table-compact td{padding:3px 6px}.cep-meta{width:100%;border-collapse:collapse;font-size:.9rem}.cep-meta th{text-align:left;font-weight:600;color:var(--text-secondary);padding:6px 12px 6px 0;width:140px;vertical-align:top}.cep-meta td{padding:6px 0;color:var(--text)}.cep-table{width:100%;border-collapse:collapse;font-size:.86rem}.cep-table th,.cep-table td{border:1px solid var(--border);padding:8px 10px;text-align:left}.cep-table th{background:#f8fafc;font-weight:700;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em}.cep-summary-table tbody tr td{padding-top:3px;padding-bottom:3px}.cep-table-amounts .cep-amt{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}.cep-measure-notes ul{margin:0;padding-left:1.15rem;font-size:.84rem}.cep-round-note{margin:8px 0 0;font-size:.78rem;color:var(--text-secondary)}.cep-total-block{text-align:center;padding:16px;border:2px solid var(--elite-red);border-radius:var(--radius-sm);background:var(--elite-red-soft)}.cep-total-label{margin:0;font-size:.82rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary)}.cep-total-value{margin:6px 0 0;font-size:2rem;font-weight:800;color:var(--elite-red)}.cep-terms ul{margin:0;padding-left:1.2rem;font-size:.84rem;line-height:1.5}", Rh = "@media print{.cep-header{margin-bottom:5px;padding-bottom:5px}.cep-logo{width:88px}.cep-title{font-size:12pt;line-height:1.15}.cep-date{font-size:7.5pt}.cep-section{margin-bottom:3px;page-break-inside:auto;break-inside:auto}.cep-section-compact{margin-bottom:2px}.cep-h2{font-size:6.5pt;margin-bottom:2px}.cep-h3{font-size:7pt;margin-bottom:1px}.cep-overview-grid{padding:4px 6px;gap:2px 8px}.cep-overview-item dt{font-size:5.5pt}.cep-overview-item dd{font-size:6.5pt}.cep-table-compact{font-size:7pt}.cep-table-compact th,.cep-table-compact td{padding:1px 4px}.cep-breakdown{page-break-inside:auto!important;break-inside:auto}.cep-breakdown .cep-muted{margin-bottom:2px;font-size:6.5pt;line-height:1.25}.cep-material-group{margin-bottom:3px;page-break-inside:avoid;break-inside:avoid}.cep-material-scope-foot td{font-size:6pt}.cep-group-material-label{font-size:5.25pt;margin-bottom:0}.cep-group-material-value{font-size:7pt}.cep-vanity-group-amt{font-size:6pt;margin-top:1px}.cep-estimate-summary{page-break-inside:avoid;break-inside:avoid;padding:5px 7px 3px}.cep-summary-total-value{font-size:10pt}.cep-round-note{margin-top:2px;font-size:6pt;line-height:1.25}.cep-comparison-print{page-break-inside:auto;break-inside:auto;padding:2px 4px!important;margin-bottom:2px}.cep-comparison-table-print{font-size:6pt}.cep-comparison-table-print th,.cep-comparison-table-print td{padding:1px 3px!important;line-height:1.15}.cep-comparison-print .cep-comparison-note{margin-bottom:2px;font-size:6pt!important;line-height:1.2}.cep-closing{margin-top:4px;padding-top:4px;page-break-inside:auto;break-inside:auto}.cep-footer-terms-sig{page-break-inside:avoid;break-inside:avoid}.cep-terms-box{padding:4px 6px}.cep-terms-list{font-size:6.25pt;line-height:1.28}.cep-terms-list li{margin-bottom:0}.cep-signature-block{margin:4px 0;padding:3px 0 2px}.cep-sig-line-inline{grid-template-columns:auto minmax(1.5rem,1fr) auto 4.25rem;column-gap:6px;margin-bottom:5px}.cep-sig-role{font-size:6.25pt}.cep-sig-under{border-bottom-width:1.25px}.cep-sig-under-date{max-width:4.25rem}.cep-branches{gap:4px;margin-bottom:3px;margin-top:2px}.cep-branch{font-size:6pt;line-height:1.28}.cep-website{font-size:6.5pt;margin-top:2px}}", Ch = ".customer-estimate-print{width:100%;max-width:100%;box-sizing:border-box}.cep-logo{width:88px;height:auto;display:block;flex-shrink:0}.cep-closing{width:100%;max-width:100%}.cep-footer-terms-sig,.cep-signature-block,.cep-sig-line-inline{width:100%;max-width:100%;box-sizing:border-box}.cep-sig-role{white-space:nowrap;word-break:normal}.cep-branches{width:100%;max-width:100%;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;box-sizing:border-box}.cep-branch{min-width:0;white-space:normal;word-break:normal;overflow-wrap:normal}.cep-branch strong,.cep-branch span{display:block;white-space:normal;word-break:normal}.cep-website{width:100%;white-space:nowrap}.cep-table{width:100%;table-layout:auto}.cep-overview-grid{width:100%;box-sizing:border-box}";
function To(ge) {
  return ge && typeof ge == "object" ? ge : null;
}
function ft(ge, ue = "") {
  return String(ge ?? "").trim() || ue;
}
function af(ge) {
  return !!ge;
}
function aa(ge, ue = 0) {
  const W = Number(ge);
  return Number.isFinite(W) ? W : ue;
}
function mh(ge) {
  const ue = To(ge);
  if (!ue) return null;
  const W = To(ue.header), Ae = To(ue.display);
  if (!W || !Ae) return null;
  const ve = ft(W.quoteNumber);
  if (!ve) return null;
  const Se = Array.isArray(Ae.estimateSummaryRows) ? Ae.estimateSummaryRows.map((P) => {
    const N = To(P);
    return {
      key: ft(N?.key, "row"),
      label: ft(N?.label),
      displayAmount: aa(N?.displayAmount)
    };
  }) : [], nn = Array.isArray(Ae.roomAreaPrintRows) ? Ae.roomAreaPrintRows.map((P) => {
    const N = To(P), Fe = Array.isArray(N?.addonLines) ? N.addonLines.map((ht) => ({ label: ft(To(ht)?.label) })) : [], ee = Array.isArray(N?.customerCustomLines) ? N.customerCustomLines.map((ht) => {
      const rr = To(ht);
      return {
        lineKey: ft(rr?.lineKey) || void 0,
        name: ft(rr?.name),
        amountExact: aa(rr?.amountExact)
      };
    }) : [], X = Array.isArray(N?.customerNoteLines) ? N.customerNoteLines.map((ht) => ft(ht)).filter(Boolean) : [];
    return {
      roomId: ft(N?.roomId, "room"),
      displayName: ft(N?.displayName),
      isVanity: af(N?.isVanity),
      vanityProgramLabel: ft(N?.vanityProgramLabel) || void 0,
      materialGroup: ft(N?.materialGroup),
      colorLabel: ft(N?.colorLabel) || void 0,
      displayedMaterial: aa(N?.displayedMaterial),
      displayedAddOns: aa(N?.displayedAddOns),
      displayedAreaTotal: aa(N?.displayedAreaTotal),
      addonLines: Fe,
      customerCustomLines: ee,
      customerNoteLines: X
    };
  }) : [];
  let On = null;
  const Re = To(Ae.roomComparisonTable);
  if (Re && Array.isArray(Re.roomBlocks)) {
    const P = Re.roomBlocks.map((ee) => {
      const X = To(ee), ht = Array.isArray(X?.groupBlocks) ? X.groupBlocks.map((rr) => {
        const Ot = To(rr);
        return {
          group: ft(Ot?.group),
          colorLabel: ft(Ot?.colorLabel) || void 0,
          countertopDisplay: aa(Ot?.countertopDisplay),
          backsplashDisplay: aa(Ot?.backsplashDisplay),
          fhbDisplay: aa(Ot?.fhbDisplay),
          addonsDisplay: aa(Ot?.addonsDisplay),
          extraLines: Array.isArray(Ot?.extraLines) ? Ot.extraLines.map((vl) => {
            const Kt = To(vl);
            return {
              key: ft(Kt?.key, "extra"),
              label: ft(Kt?.label),
              displayAmount: aa(Kt?.displayAmount)
            };
          }) : void 0,
          roomTotalDisplay: aa(Ot?.roomTotalDisplay)
        };
      }) : [];
      return {
        roomId: ft(X?.roomId, "room"),
        roomDisplayName: ft(X?.roomDisplayName),
        isVanity: af(X?.isVanity),
        groupBlocks: ht
      };
    }), N = To(Re.projectDisplayTotals) != null ? Object.fromEntries(
      Object.entries(To(Re.projectDisplayTotals)).map(([ee, X]) => [ee, aa(X)])
    ) : {}, Fe = Array.isArray(Re.selectedGroups) ? Re.selectedGroups.map((ee) => {
      const X = To(ee);
      return {
        group: ft(X?.group),
        colorLabel: ft(X?.colorLabel) || void 0
      };
    }) : [];
    On = {
      roomBlocks: P,
      roomRows: Array.isArray(Re.roomRows) ? Re.roomRows : [],
      projectDisplayTotals: N,
      selectedGroups: Fe,
      isPerRoomMode: af(Re.isPerRoomMode)
    };
  }
  const ie = Array.isArray(Ae.customerFacingNoteLines) ? Ae.customerFacingNoteLines.map((P) => ft(P)).filter(Boolean) : [], He = {
    estimateSummaryRows: Se,
    finalRounded: aa(Ae.finalRounded),
    showRoomBreakdown: af(Ae.showRoomBreakdown),
    roomAreaPrintRows: nn,
    unassignedExact: aa(Ae.unassignedExact),
    unassignedDisplayTotal: aa(Ae.unassignedDisplayTotal),
    roomComparisonTable: On,
    customerFacingNoteLines: ie,
    preparedByDisplayName: ft(Ae.preparedByDisplayName)
  };
  return {
    accountName: ft(W.accountName),
    customerName: ft(W.customerName),
    projectName: ft(W.projectName),
    projectAddress: ft(W.projectAddress),
    city: ft(W.city),
    state: ft(W.state),
    branch: ft(W.branch),
    salesRep: ft(W.salesRep),
    preparedBy: He.preparedByDisplayName,
    quoteNumber: ve,
    primaryGroup: ft(W.primaryGroup),
    primaryColorLabel: ft(W.primaryColorLabel),
    colorTbd: af(W.colorTbd),
    estimateTotalExact: aa(ue.finalRounded),
    customerDisplay: He,
    estimateDate: ft(W.estimateDate)
  };
}
function Sh(ge) {
  const ue = mh(ge);
  return ue ? sh.renderToStaticMarkup(/* @__PURE__ */ q.jsx(xh, { ...ue })) : "";
}
function kh(ge) {
  const ue = Sh(ge);
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
<body>${ue}</body>
</html>`;
}
export {
  kh as buildCustomerEstimatePrintHtml,
  Sh as renderCustomerEstimateDocumentMarkup
};
