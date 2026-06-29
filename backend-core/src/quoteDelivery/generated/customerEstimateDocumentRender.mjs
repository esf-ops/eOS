function qf(fe) {
  return fe && fe.__esModule && Object.prototype.hasOwnProperty.call(fe, "default") ? fe.default : fe;
}
var hf = { exports: {} }, nf = {};
var Df;
function $f() {
  if (Df) return nf;
  Df = 1;
  var fe = /* @__PURE__ */ Symbol.for("react.transitional.element"), ce = /* @__PURE__ */ Symbol.for("react.fragment");
  function W(Se, nn, be) {
    var Oe = null;
    if (be !== void 0 && (Oe = "" + be), nn.key !== void 0 && (Oe = "" + nn.key), "key" in nn) {
      be = {};
      for (var pn in nn)
        pn !== "key" && (be[pn] = nn[pn]);
    } else be = nn;
    return nn = be.ref, {
      $$typeof: fe,
      type: Se,
      key: Oe,
      ref: nn !== void 0 ? nn : null,
      props: be
    };
  }
  return nf.Fragment = ce, nf.jsx = W, nf.jsxs = W, nf;
}
var tf = {}, df = { exports: {} }, gn = {};
var Lf;
function eh() {
  if (Lf) return gn;
  Lf = 1;
  var fe = /* @__PURE__ */ Symbol.for("react.transitional.element"), ce = /* @__PURE__ */ Symbol.for("react.portal"), W = /* @__PURE__ */ Symbol.for("react.fragment"), Se = /* @__PURE__ */ Symbol.for("react.strict_mode"), nn = /* @__PURE__ */ Symbol.for("react.profiler"), be = /* @__PURE__ */ Symbol.for("react.consumer"), Oe = /* @__PURE__ */ Symbol.for("react.context"), pn = /* @__PURE__ */ Symbol.for("react.forward_ref"), Re = /* @__PURE__ */ Symbol.for("react.suspense"), ie = /* @__PURE__ */ Symbol.for("react.memo"), Be = /* @__PURE__ */ Symbol.for("react.lazy"), A = /* @__PURE__ */ Symbol.for("react.activity"), D = Symbol.iterator;
  function Ae(p) {
    return p === null || typeof p != "object" ? null : (p = D && p[D] || p["@@iterator"], typeof p == "function" ? p : null);
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
  function tr(p, Y, we) {
    this.props = p, this.context = Y, this.refs = ft, this.updater = we || ee;
  }
  tr.prototype.isReactComponent = {}, tr.prototype.setState = function(p, Y) {
    if (typeof p != "object" && typeof p != "function" && p != null)
      throw Error(
        "takes an object of state variables to update or a function which returns an object of state variables."
      );
    this.updater.enqueueSetState(this, p, Y, "setState");
  }, tr.prototype.forceUpdate = function(p) {
    this.updater.enqueueForceUpdate(this, p, "forceUpdate");
  };
  function Yt() {
  }
  Yt.prototype = tr.prototype;
  function Gl(p, Y, we) {
    this.props = p, this.context = Y, this.refs = ft, this.updater = we || ee;
  }
  var Br = Gl.prototype = new Yt();
  Br.constructor = Gl, X(Br, tr.prototype), Br.isPureReactComponent = !0;
  var Jn = Array.isArray;
  function Me() {
  }
  var Je = { H: null, A: null, T: null, S: null }, Et = Object.prototype.hasOwnProperty;
  function rn(p, Y, we) {
    var pe = we.ref;
    return {
      $$typeof: fe,
      type: p,
      key: Y,
      ref: pe !== void 0 ? pe : null,
      props: we
    };
  }
  function Kn(p, Y) {
    return rn(p.type, Y, p.props);
  }
  function si(p) {
    return typeof p == "object" && p !== null && p.$$typeof === fe;
  }
  function Ln(p) {
    var Y = { "=": "=0", ":": "=2" };
    return "$" + p.replace(/[=:]/g, function(we) {
      return Y[we];
    });
  }
  var qr = /\/+/g;
  function nt(p, Y) {
    return typeof p == "object" && p !== null && p.key != null ? Ln("" + p.key) : Y.toString(36);
  }
  function Pe(p) {
    switch (p.status) {
      case "fulfilled":
        return p.value;
      case "rejected":
        throw p.reason;
      default:
        switch (typeof p.status == "string" ? p.then(Me, Me) : (p.status = "pending", p.then(
          function(Y) {
            p.status === "pending" && (p.status = "fulfilled", p.value = Y);
          },
          function(Y) {
            p.status === "pending" && (p.status = "rejected", p.reason = Y);
          }
        )), p.status) {
          case "fulfilled":
            return p.value;
          case "rejected":
            throw p.reason;
        }
    }
    throw p;
  }
  function Q(p, Y, we, pe, ke) {
    var Ne = typeof p;
    (Ne === "undefined" || Ne === "boolean") && (p = null);
    var me = !1;
    if (p === null) me = !0;
    else
      switch (Ne) {
        case "bigint":
        case "string":
        case "number":
          me = !0;
          break;
        case "object":
          switch (p.$$typeof) {
            case fe:
            case ce:
              me = !0;
              break;
            case Be:
              return me = p._init, Q(
                me(p._payload),
                Y,
                we,
                pe,
                ke
              );
          }
      }
    if (me)
      return ke = ke(p), me = pe === "" ? "." + nt(p, 0) : pe, Jn(ke) ? (we = "", me != null && (we = me.replace(qr, "$&/") + "/"), Q(ke, Y, we, "", function(tt) {
        return tt;
      })) : ke != null && (si(ke) && (ke = Kn(
        ke,
        we + (ke.key == null || p && p.key === ke.key ? "" : ("" + ke.key).replace(
          qr,
          "$&/"
        ) + "/") + me
      )), Y.push(ke)), 1;
    me = 0;
    var Rt = pe === "" ? "." : pe + ":";
    if (Jn(p))
      for (var Rn = 0; Rn < p.length; Rn++)
        pe = p[Rn], Ne = Rt + nt(pe, Rn), me += Q(
          pe,
          Y,
          we,
          Ne,
          ke
        );
    else if (Rn = Ae(p), typeof Rn == "function")
      for (p = Rn.call(p), Rn = 0; !(pe = p.next()).done; )
        pe = pe.value, Ne = Rt + nt(pe, Rn++), me += Q(
          pe,
          Y,
          we,
          Ne,
          ke
        );
    else if (Ne === "object") {
      if (typeof p.then == "function")
        return Q(
          Pe(p),
          Y,
          we,
          pe,
          ke
        );
      throw Y = String(p), Error(
        "Objects are not valid as a React child (found: " + (Y === "[object Object]" ? "object with keys {" + Object.keys(p).join(", ") + "}" : Y) + "). If you meant to render a collection of children, use an array instead."
      );
    }
    return me;
  }
  function de(p, Y, we) {
    if (p == null) return p;
    var pe = [], ke = 0;
    return Q(p, pe, "", "", function(Ne) {
      return Y.call(we, Ne, ke++);
    }), pe;
  }
  function pr(p) {
    if (p._status === -1) {
      var Y = p._result;
      Y = Y(), Y.then(
        function(we) {
          (p._status === 0 || p._status === -1) && (p._status = 1, p._result = we);
        },
        function(we) {
          (p._status === 0 || p._status === -1) && (p._status = 2, p._result = we);
        }
      ), p._status === -1 && (p._status = 0, p._result = Y);
    }
    if (p._status === 1) return p._result.default;
    throw p._result;
  }
  var vl = typeof reportError == "function" ? reportError : function(p) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var Y = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof p == "object" && p !== null && typeof p.message == "string" ? String(p.message) : String(p),
        error: p
      });
      if (!window.dispatchEvent(Y)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", p);
      return;
    }
    console.error(p);
  }, he = {
    map: de,
    forEach: function(p, Y, we) {
      de(
        p,
        function() {
          Y.apply(this, arguments);
        },
        we
      );
    },
    count: function(p) {
      var Y = 0;
      return de(p, function() {
        Y++;
      }), Y;
    },
    toArray: function(p) {
      return de(p, function(Y) {
        return Y;
      }) || [];
    },
    only: function(p) {
      if (!si(p))
        throw Error(
          "React.Children.only expected to receive a single React element child."
        );
      return p;
    }
  };
  return gn.Activity = A, gn.Children = he, gn.Component = tr, gn.Fragment = W, gn.Profiler = nn, gn.PureComponent = Gl, gn.StrictMode = Se, gn.Suspense = Re, gn.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = Je, gn.__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(p) {
      return Je.H.useMemoCache(p);
    }
  }, gn.cache = function(p) {
    return function() {
      return p.apply(null, arguments);
    };
  }, gn.cacheSignal = function() {
    return null;
  }, gn.cloneElement = function(p, Y, we) {
    if (p == null)
      throw Error(
        "The argument must be a React element, but you passed " + p + "."
      );
    var pe = X({}, p.props), ke = p.key;
    if (Y != null)
      for (Ne in Y.key !== void 0 && (ke = "" + Y.key), Y)
        !Et.call(Y, Ne) || Ne === "key" || Ne === "__self" || Ne === "__source" || Ne === "ref" && Y.ref === void 0 || (pe[Ne] = Y[Ne]);
    var Ne = arguments.length - 2;
    if (Ne === 1) pe.children = we;
    else if (1 < Ne) {
      for (var me = Array(Ne), Rt = 0; Rt < Ne; Rt++)
        me[Rt] = arguments[Rt + 2];
      pe.children = me;
    }
    return rn(p.type, ke, pe);
  }, gn.createContext = function(p) {
    return p = {
      $$typeof: Oe,
      _currentValue: p,
      _currentValue2: p,
      _threadCount: 0,
      Provider: null,
      Consumer: null
    }, p.Provider = p, p.Consumer = {
      $$typeof: be,
      _context: p
    }, p;
  }, gn.createElement = function(p, Y, we) {
    var pe, ke = {}, Ne = null;
    if (Y != null)
      for (pe in Y.key !== void 0 && (Ne = "" + Y.key), Y)
        Et.call(Y, pe) && pe !== "key" && pe !== "__self" && pe !== "__source" && (ke[pe] = Y[pe]);
    var me = arguments.length - 2;
    if (me === 1) ke.children = we;
    else if (1 < me) {
      for (var Rt = Array(me), Rn = 0; Rn < me; Rn++)
        Rt[Rn] = arguments[Rn + 2];
      ke.children = Rt;
    }
    if (p && p.defaultProps)
      for (pe in me = p.defaultProps, me)
        ke[pe] === void 0 && (ke[pe] = me[pe]);
    return rn(p, Ne, ke);
  }, gn.createRef = function() {
    return { current: null };
  }, gn.forwardRef = function(p) {
    return { $$typeof: pn, render: p };
  }, gn.isValidElement = si, gn.lazy = function(p) {
    return {
      $$typeof: Be,
      _payload: { _status: -1, _result: p },
      _init: pr
    };
  }, gn.memo = function(p, Y) {
    return {
      $$typeof: ie,
      type: p,
      compare: Y === void 0 ? null : Y
    };
  }, gn.startTransition = function(p) {
    var Y = Je.T, we = {};
    Je.T = we;
    try {
      var pe = p(), ke = Je.S;
      ke !== null && ke(we, pe), typeof pe == "object" && pe !== null && typeof pe.then == "function" && pe.then(Me, vl);
    } catch (Ne) {
      vl(Ne);
    } finally {
      Y !== null && we.types !== null && (Y.types = we.types), Je.T = Y;
    }
  }, gn.unstable_useCacheRefresh = function() {
    return Je.H.useCacheRefresh();
  }, gn.use = function(p) {
    return Je.H.use(p);
  }, gn.useActionState = function(p, Y, we) {
    return Je.H.useActionState(p, Y, we);
  }, gn.useCallback = function(p, Y) {
    return Je.H.useCallback(p, Y);
  }, gn.useContext = function(p) {
    return Je.H.useContext(p);
  }, gn.useDebugValue = function() {
  }, gn.useDeferredValue = function(p, Y) {
    return Je.H.useDeferredValue(p, Y);
  }, gn.useEffect = function(p, Y) {
    return Je.H.useEffect(p, Y);
  }, gn.useEffectEvent = function(p) {
    return Je.H.useEffectEvent(p);
  }, gn.useId = function() {
    return Je.H.useId();
  }, gn.useImperativeHandle = function(p, Y, we) {
    return Je.H.useImperativeHandle(p, Y, we);
  }, gn.useInsertionEffect = function(p, Y) {
    return Je.H.useInsertionEffect(p, Y);
  }, gn.useLayoutEffect = function(p, Y) {
    return Je.H.useLayoutEffect(p, Y);
  }, gn.useMemo = function(p, Y) {
    return Je.H.useMemo(p, Y);
  }, gn.useOptimistic = function(p, Y) {
    return Je.H.useOptimistic(p, Y);
  }, gn.useReducer = function(p, Y, we) {
    return Je.H.useReducer(p, Y, we);
  }, gn.useRef = function(p) {
    return Je.H.useRef(p);
  }, gn.useState = function(p) {
    return Je.H.useState(p);
  }, gn.useSyncExternalStore = function(p, Y, we) {
    return Je.H.useSyncExternalStore(
      p,
      Y,
      we
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
      function Se(R) {
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
      function be(R, L, ne) {
        this.props = R, this.context = L, this.refs = mt, this.updater = ne || kt;
      }
      function Oe() {
      }
      function pn(R, L, ne) {
        this.props = R, this.context = L, this.refs = mt, this.updater = ne || kt;
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
          case p:
            return "Fragment";
          case we:
            return "Profiler";
          case Y:
            return "StrictMode";
          case me:
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
            case ke:
              return R.displayName || "Context";
            case pe:
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
        if (R === p) return "<>";
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
        else if (We = Se(R), typeof We == "function")
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
              pr(Ee), nt(function() {
                return de(R, L, ne);
              });
              return;
            } catch (Fe) {
              Ie.thrownErrors.push(Fe);
            }
          else Ie.actQueue = null;
        0 < Ie.thrownErrors.length ? (Ee = Pe(Ie.thrownErrors), Ie.thrownErrors.length = 0, ne(Ee)) : L(R);
      }
      function pr(R) {
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
      var vl = /* @__PURE__ */ Symbol.for("react.transitional.element"), he = /* @__PURE__ */ Symbol.for("react.portal"), p = /* @__PURE__ */ Symbol.for("react.fragment"), Y = /* @__PURE__ */ Symbol.for("react.strict_mode"), we = /* @__PURE__ */ Symbol.for("react.profiler"), pe = /* @__PURE__ */ Symbol.for("react.consumer"), ke = /* @__PURE__ */ Symbol.for("react.context"), Ne = /* @__PURE__ */ Symbol.for("react.forward_ref"), me = /* @__PURE__ */ Symbol.for("react.suspense"), Rt = /* @__PURE__ */ Symbol.for("react.suspense_list"), Rn = /* @__PURE__ */ Symbol.for("react.memo"), tt = /* @__PURE__ */ Symbol.for("react.lazy"), Ct = /* @__PURE__ */ Symbol.for("react.activity"), Ia = Symbol.iterator, Ge = {}, kt = {
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
      }, xn = Object.assign, mt = {};
      Object.freeze(mt), be.prototype.isReactComponent = {}, be.prototype.setState = function(R, L) {
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
      Oe.prototype = be.prototype, Gt = pn.prototype = new Oe(), Gt.constructor = pn, xn(Gt, be.prototype), Gt.isPureReactComponent = !0;
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
      )(), Nn = Pt(D(ee)), rc = !1, ht = /\/+/g, po = typeof reportError == "function" ? reportError : function(R) {
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
          if (!Jn(R))
            throw Error(
              "React.Children.only expected to receive a single React element child."
            );
          return R;
        }
      };
      ce.Activity = Ct, ce.Children = yl, ce.Component = be, ce.Fragment = p, ce.Profiler = we, ce.PureComponent = pn, ce.StrictMode = Y, ce.Suspense = me, ce.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = Ie, ce.__COMPILER_RUNTIME = Gt, ce.act = function(R) {
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
                      pr(Ee), nt(function() {
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
        if (Q(L, ne), ne === 0 && (pr(Ee), Ee.length !== 0 && Vl(function() {
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
          $$typeof: ke,
          _currentValue: R,
          _currentValue2: R,
          _threadCount: 0,
          Provider: null,
          Consumer: null
        }, R.Provider = R, R.Consumer = {
          $$typeof: pe,
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
          Fe !== null && Fe(ne, Ee), typeof Ee == "object" && Ee !== null && typeof Ee.then == "function" && (Ie.asyncTransitions++, Ee.then(qr, qr), Ee.then(Re, po));
        } catch (ln) {
          po(ln);
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
        return R.$$typeof === pe && console.error(
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
    function fe(p) {
      if (p == null) return null;
      if (typeof p == "function")
        return p.$$typeof === si ? null : p.displayName || p.name || null;
      if (typeof p == "string") return p;
      switch (p) {
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
      if (typeof p == "object")
        switch (typeof p.tag == "number" && console.error(
          "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
        ), p.$$typeof) {
          case X:
            return "Portal";
          case Br:
            return p.displayName || "Context";
          case Gl:
            return (p._context.displayName || "Context") + ".Consumer";
          case Jn:
            var Y = p.render;
            return p = p.displayName, p || (p = Y.displayName || Y.name || "", p = p !== "" ? "ForwardRef(" + p + ")" : "ForwardRef"), p;
          case Et:
            return Y = p.displayName || null, Y !== null ? Y : fe(p.type) || "Memo";
          case rn:
            Y = p._payload, p = p._init;
            try {
              return fe(p(Y));
            } catch {
            }
        }
      return null;
    }
    function ce(p) {
      return "" + p;
    }
    function W(p) {
      try {
        ce(p);
        var Y = !1;
      } catch {
        Y = !0;
      }
      if (Y) {
        Y = console;
        var we = Y.error, pe = typeof Symbol == "function" && Symbol.toStringTag && p[Symbol.toStringTag] || p.constructor.name || "Object";
        return we.call(
          Y,
          "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
          pe
        ), ce(p);
      }
    }
    function Se(p) {
      if (p === ft) return "<>";
      if (typeof p == "object" && p !== null && p.$$typeof === rn)
        return "<...>";
      try {
        var Y = fe(p);
        return Y ? "<" + Y + ">" : "<...>";
      } catch {
        return "<...>";
      }
    }
    function nn() {
      var p = Ln.A;
      return p === null ? null : p.getOwner();
    }
    function be() {
      return Error("react-stack-top-frame");
    }
    function Oe(p) {
      if (qr.call(p, "key")) {
        var Y = Object.getOwnPropertyDescriptor(p, "key").get;
        if (Y && Y.isReactWarning) return !1;
      }
      return p.key !== void 0;
    }
    function pn(p, Y) {
      function we() {
        Q || (Q = !0, console.error(
          "%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)",
          Y
        ));
      }
      we.isReactWarning = !0, Object.defineProperty(p, "key", {
        get: we,
        configurable: !0
      });
    }
    function Re() {
      var p = fe(this.type);
      return de[p] || (de[p] = !0, console.error(
        "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
      )), p = this.props.ref, p !== void 0 ? p : null;
    }
    function ie(p, Y, we, pe, ke, Ne) {
      var me = we.ref;
      return p = {
        $$typeof: ee,
        type: p,
        key: Y,
        props: we,
        _owner: pe
      }, (me !== void 0 ? me : null) !== null ? Object.defineProperty(p, "ref", {
        enumerable: !1,
        get: Re
      }) : Object.defineProperty(p, "ref", { enumerable: !1, value: null }), p._store = {}, Object.defineProperty(p._store, "validated", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: 0
      }), Object.defineProperty(p, "_debugInfo", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: null
      }), Object.defineProperty(p, "_debugStack", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: ke
      }), Object.defineProperty(p, "_debugTask", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: Ne
      }), Object.freeze && (Object.freeze(p.props), Object.freeze(p)), p;
    }
    function Be(p, Y, we, pe, ke, Ne) {
      var me = Y.children;
      if (me !== void 0)
        if (pe)
          if (nt(me)) {
            for (pe = 0; pe < me.length; pe++)
              A(me[pe]);
            Object.freeze && Object.freeze(me);
          } else
            console.error(
              "React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead."
            );
        else A(me);
      if (qr.call(Y, "key")) {
        me = fe(p);
        var Rt = Object.keys(Y).filter(function(tt) {
          return tt !== "key";
        });
        pe = 0 < Rt.length ? "{key: someKey, " + Rt.join(": ..., ") + ": ...}" : "{key: someKey}", he[me + pe] || (Rt = 0 < Rt.length ? "{" + Rt.join(": ..., ") + ": ...}" : "{}", console.error(
          `A props object containing a "key" prop is being spread into JSX:
  let props = %s;
  <%s {...props} />
React keys must be passed directly to JSX without using spread:
  let props = %s;
  <%s key={someKey} {...props} />`,
          pe,
          me,
          Rt,
          me
        ), he[me + pe] = !0);
      }
      if (me = null, we !== void 0 && (W(we), me = "" + we), Oe(Y) && (W(Y.key), me = "" + Y.key), "key" in Y) {
        we = {};
        for (var Rn in Y)
          Rn !== "key" && (we[Rn] = Y[Rn]);
      } else we = Y;
      return me && pn(
        we,
        typeof p == "function" ? p.displayName || p.name || "Unknown" : p
      ), ie(
        p,
        me,
        we,
        nn(),
        ke,
        Ne
      );
    }
    function A(p) {
      D(p) ? p._store && (p._store.validated = 1) : typeof p == "object" && p !== null && p.$$typeof === rn && (p._payload.status === "fulfilled" ? D(p._payload.value) && p._payload.value._store && (p._payload.value._store.validated = 1) : p._store && (p._store.validated = 1));
    }
    function D(p) {
      return typeof p == "object" && p !== null && p.$$typeof === ee;
    }
    var Ae = _s(), ee = /* @__PURE__ */ Symbol.for("react.transitional.element"), X = /* @__PURE__ */ Symbol.for("react.portal"), ft = /* @__PURE__ */ Symbol.for("react.fragment"), tr = /* @__PURE__ */ Symbol.for("react.strict_mode"), Yt = /* @__PURE__ */ Symbol.for("react.profiler"), Gl = /* @__PURE__ */ Symbol.for("react.consumer"), Br = /* @__PURE__ */ Symbol.for("react.context"), Jn = /* @__PURE__ */ Symbol.for("react.forward_ref"), Me = /* @__PURE__ */ Symbol.for("react.suspense"), Je = /* @__PURE__ */ Symbol.for("react.suspense_list"), Et = /* @__PURE__ */ Symbol.for("react.memo"), rn = /* @__PURE__ */ Symbol.for("react.lazy"), Kn = /* @__PURE__ */ Symbol.for("react.activity"), si = /* @__PURE__ */ Symbol.for("react.client.reference"), Ln = Ae.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, qr = Object.prototype.hasOwnProperty, nt = Array.isArray, Pe = console.createTask ? console.createTask : function() {
      return null;
    };
    Ae = {
      react_stack_bottom_frame: function(p) {
        return p();
      }
    };
    var Q, de = {}, pr = Ae.react_stack_bottom_frame.bind(
      Ae,
      be
    )(), vl = Pe(Se(be)), he = {};
    tf.Fragment = ft, tf.jsx = function(p, Y, we) {
      var pe = 1e4 > Ln.recentlyCreatedOwnerStacks++;
      return Be(
        p,
        Y,
        we,
        !1,
        pe ? Error("react-stack-top-frame") : pr,
        pe ? Pe(Se(p)) : vl
      );
    }, tf.jsxs = function(p, Y, we) {
      var pe = 1e4 > Ln.recentlyCreatedOwnerStacks++;
      return Be(
        p,
        Y,
        we,
        !0,
        pe ? Error("react-stack-top-frame") : pr,
        pe ? Pe(Se(p)) : vl
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
  var Se = {
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
  function be(Re, ie, Be) {
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
  function pn(Re, ie) {
    if (Re === "font") return "";
    if (typeof ie == "string")
      return ie === "use-credentials" ? ie : "";
  }
  return la.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = Se, la.createPortal = function(Re, ie) {
    var Be = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
    if (!ie || ie.nodeType !== 1 && ie.nodeType !== 9 && ie.nodeType !== 11)
      throw Error(ce(299));
    return be(Re, ie, null, Be);
  }, la.flushSync = function(Re) {
    var ie = Oe.T, Be = Se.p;
    try {
      if (Oe.T = null, Se.p = 2, Re) return Re();
    } finally {
      Oe.T = ie, Se.p = Be, Se.d.f();
    }
  }, la.preconnect = function(Re, ie) {
    typeof Re == "string" && (ie ? (ie = ie.crossOrigin, ie = typeof ie == "string" ? ie === "use-credentials" ? ie : "" : void 0) : ie = null, Se.d.C(Re, ie));
  }, la.prefetchDNS = function(Re) {
    typeof Re == "string" && Se.d.D(Re);
  }, la.preinit = function(Re, ie) {
    if (typeof Re == "string" && ie && typeof ie.as == "string") {
      var Be = ie.as, A = pn(Be, ie.crossOrigin), D = typeof ie.integrity == "string" ? ie.integrity : void 0, Ae = typeof ie.fetchPriority == "string" ? ie.fetchPriority : void 0;
      Be === "style" ? Se.d.S(
        Re,
        typeof ie.precedence == "string" ? ie.precedence : void 0,
        {
          crossOrigin: A,
          integrity: D,
          fetchPriority: Ae
        }
      ) : Be === "script" && Se.d.X(Re, {
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
          var Be = pn(
            ie.as,
            ie.crossOrigin
          );
          Se.d.M(Re, {
            crossOrigin: Be,
            integrity: typeof ie.integrity == "string" ? ie.integrity : void 0,
            nonce: typeof ie.nonce == "string" ? ie.nonce : void 0
          });
        }
      } else ie == null && Se.d.M(Re);
  }, la.preload = function(Re, ie) {
    if (typeof Re == "string" && typeof ie == "object" && ie !== null && typeof ie.as == "string") {
      var Be = ie.as, A = pn(Be, ie.crossOrigin);
      Se.d.L(Re, Be, {
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
        var Be = pn(ie.as, ie.crossOrigin);
        Se.d.m(Re, {
          as: typeof ie.as == "string" && ie.as !== "script" ? ie.as : void 0,
          crossOrigin: Be,
          integrity: typeof ie.integrity == "string" ? ie.integrity : void 0
        });
      } else Se.d.m(Re);
  }, la.requestFormReset = function(Re) {
    Se.d.r(Re);
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
    function Se(A, D) {
      if (A === "font") return "";
      if (typeof D == "string")
        return D === "use-credentials" ? D : "";
    }
    function nn(A) {
      return A === null ? "`null`" : A === void 0 ? "`undefined`" : A === "" ? "an empty string" : 'something with type "' + typeof A + '"';
    }
    function be(A) {
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
    var pn = _s(), Re = {
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
    }, ie = /* @__PURE__ */ Symbol.for("react.portal"), Be = pn.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
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
        be(D)
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
          be(D)
        ) : console.error(
          "ReactDOM.prefetchDNS(): Expected only one argument, `href`, but encountered %s as a second argument instead. This argument is reserved for future options and is currently disallowed. Try calling ReactDOM.prefetchDNS() with just a single string argument, `href`.",
          be(D)
        );
      }
      typeof A == "string" && Re.d.D(A);
    }, ia.preinit = function(A, D) {
      if (typeof A == "string" && A ? D == null || typeof D != "object" ? console.error(
        "ReactDOM.preinit(): Expected the `options` argument (second) to be an object with an `as` property describing the type of resource to be preinitialized but encountered %s instead.",
        be(D)
      ) : D.as !== "style" && D.as !== "script" && console.error(
        'ReactDOM.preinit(): Expected the `as` property in the `options` argument (second) to contain a valid value describing the type of resource to be preinitialized but encountered %s instead. Valid values for `as` are "style" and "script".',
        be(D.as)
      ) : console.error(
        "ReactDOM.preinit(): Expected the `href` argument (first) to be a non-empty string but encountered %s instead.",
        nn(A)
      ), typeof A == "string" && D && typeof D.as == "string") {
        var Ae = D.as, ee = Se(Ae, D.crossOrigin), X = typeof D.integrity == "string" ? D.integrity : void 0, ft = typeof D.fetchPriority == "string" ? D.fetchPriority : void 0;
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
      typeof A == "string" && A || (Ae += " The `href` argument encountered was " + nn(A) + "."), D !== void 0 && typeof D != "object" ? Ae += " The `options` argument encountered was " + nn(D) + "." : D && "as" in D && D.as !== "script" && (Ae += " The `as` option encountered was " + be(D.as) + "."), Ae ? console.error(
        "ReactDOM.preinitModule(): Expected up to two arguments, a non-empty `href` string and, optionally, an `options` object with a valid `as` property.%s",
        Ae
      ) : (Ae = D && typeof D.as == "string" ? D.as : "script", Ae) === "script" || (Ae = be(Ae), console.error(
        'ReactDOM.preinitModule(): Currently the only supported "as" type for this function is "script" but received "%s" instead. This warning was generated for `href` "%s". In the future other module types will be supported, aligning with the import-attributes proposal. Learn more here: (https://github.com/tc39/proposal-import-attributes)',
        Ae,
        A
      )), typeof A == "string" && (typeof D == "object" && D !== null ? (D.as == null || D.as === "script") && (Ae = Se(
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
        var ee = Se(
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
      ), typeof A == "string" && (D ? (Ae = Se(
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
function yf() {
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
  var fe = _s(), ce = yf();
  function W(i) {
    var o = "https://react.dev/errors/" + i;
    if (1 < arguments.length) {
      o += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var f = 2; f < arguments.length; f++)
        o += "&args[]=" + encodeURIComponent(arguments[f]);
    }
    return "Minified React error #" + i + "; visit " + o + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  var Se = /* @__PURE__ */ Symbol.for("react.transitional.element"), nn = /* @__PURE__ */ Symbol.for("react.portal"), be = /* @__PURE__ */ Symbol.for("react.fragment"), Oe = /* @__PURE__ */ Symbol.for("react.strict_mode"), pn = /* @__PURE__ */ Symbol.for("react.profiler"), Re = /* @__PURE__ */ Symbol.for("react.consumer"), ie = /* @__PURE__ */ Symbol.for("react.context"), Be = /* @__PURE__ */ Symbol.for("react.forward_ref"), A = /* @__PURE__ */ Symbol.for("react.suspense"), D = /* @__PURE__ */ Symbol.for("react.suspense_list"), Ae = /* @__PURE__ */ Symbol.for("react.memo"), ee = /* @__PURE__ */ Symbol.for("react.lazy"), X = /* @__PURE__ */ Symbol.for("react.scope"), ft = /* @__PURE__ */ Symbol.for("react.activity"), tr = /* @__PURE__ */ Symbol.for("react.legacy_hidden"), Yt = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), Gl = /* @__PURE__ */ Symbol.for("react.view_transition"), Br = Symbol.iterator;
  function Jn(i) {
    return i === null || typeof i != "object" ? null : (i = Br && i[Br] || i["@@iterator"], typeof i == "function" ? i : null);
  }
  var Me = Array.isArray;
  function Je(i, o) {
    var f = i.length & 3, g = i.length - f, T = o;
    for (o = 0; o < g; ) {
      var k = i.charCodeAt(o) & 255 | (i.charCodeAt(++o) & 255) << 8 | (i.charCodeAt(++o) & 255) << 16 | (i.charCodeAt(++o) & 255) << 24;
      ++o, k = 3432918353 * (k & 65535) + ((3432918353 * (k >>> 16) & 65535) << 16) & 4294967295, k = k << 15 | k >>> 17, k = 461845907 * (k & 65535) + ((461845907 * (k >>> 16) & 65535) << 16) & 4294967295, T ^= k, T = T << 13 | T >>> 19, T = 5 * (T & 65535) + ((5 * (T >>> 16) & 65535) << 16) & 4294967295, T = (T & 65535) + 27492 + (((T >>> 16) + 58964 & 65535) << 16);
    }
    switch (k = 0, f) {
      case 3:
        k ^= (i.charCodeAt(o + 2) & 255) << 16;
      case 2:
        k ^= (i.charCodeAt(o + 1) & 255) << 8;
      case 1:
        k ^= i.charCodeAt(o) & 255, k = 3432918353 * (k & 65535) + ((3432918353 * (k >>> 16) & 65535) << 16) & 4294967295, k = k << 15 | k >>> 17, T ^= 461845907 * (k & 65535) + ((461845907 * (k >>> 16) & 65535) << 16) & 4294967295;
    }
    return T ^= i.length, T ^= T >>> 16, T = 2246822507 * (T & 65535) + ((2246822507 * (T >>> 16) & 65535) << 16) & 4294967295, T ^= T >>> 13, T = 3266489909 * (T & 65535) + ((3266489909 * (T >>> 16) & 65535) << 16) & 4294967295, (T ^ T >>> 16) >>> 0;
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
      var f = "", g, T = 0;
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
        T !== g && (f += i.slice(T, g)), T = g + 1, f += o;
      }
      i = T !== g ? f + i.slice(T, g) : f;
    }
    return i;
  }
  var pr = /([A-Z])/g, vl = /^ms-/, he = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function p(i) {
    return he.test("" + i) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : i;
  }
  var Y = fe.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, we = ce.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, pe = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, ke = we.d;
  we.d = {
    f: ke.f,
    r: ke.r,
    D: Jl,
    C: sr,
    L: Na,
    m: Wc,
    X: ns,
    S: Er,
    M: Su
  };
  var Ne = [], me = null, Rt = /(<\/|<)(s)(cript)/gi;
  function Rn(i, o, f, g) {
    return "" + o + (f === "s" ? "\\u0073" : "\\u0053") + g;
  }
  function tt(i, o, f, g, T) {
    return {
      idPrefix: i === void 0 ? "" : i,
      nextFormID: 0,
      streamingFormat: 0,
      bootstrapScriptContent: f,
      bootstrapScripts: g,
      bootstrapModules: T,
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
  function kt(i, o) {
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
  var mt = /* @__PURE__ */ new Map();
  function Gt(i, o) {
    if (typeof o != "object") throw Error(W(62));
    var f = !0, g;
    for (g in o)
      if (rn.call(o, g)) {
        var T = o[g];
        if (T != null && typeof T != "boolean" && T !== "") {
          if (g.indexOf("--") === 0) {
            var k = de(g);
            T = de(("" + T).trim());
          } else
            k = mt.get(g), k === void 0 && (k = de(
              g.replace(pr, "-$1").toLowerCase().replace(vl, "-ms-")
            ), mt.set(g, k)), T = typeof T == "number" ? T === 0 || nt.has(g) ? "" + T : T + "px" : de(("" + T).trim());
          f ? (f = !1, i.push(' style="', k, ":", T)) : i.push(";", k, ":", T);
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
          var T = g.data;
          T?.forEach(Pt);
        }
        return g;
      } catch (k) {
        if (typeof k == "object" && k !== null && typeof k.then == "function")
          throw k;
      }
    }
    return null;
  }
  function Da(i, o, f, g, T, k, P, V) {
    var M = null;
    if (typeof g == "function") {
      var G = $r(o, g);
      G !== null ? (V = G.name, g = G.action || "", T = G.encType, k = G.method, P = G.target, M = G.data) : (i.push(" ", "formAction", '="', Ie, '"'), P = k = T = g = V = null, rc(o, f));
    }
    return V != null && vn(i, "name", V), g != null && vn(i, "formAction", g), T != null && vn(i, "formEncType", T), k != null && vn(i, "formMethod", k), P != null && vn(i, "formTarget", P), M;
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
        f = p("" + f), i.push(" ", o, '="', de(f), '"');
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
        f = p("" + f), i.push(" ", "xlink:href", '="', de(f), '"');
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
  var po = /(<\/|<)(s)(tyle)/gi;
  function xo(i, o, f, g) {
    return "" + o + (f === "s" ? "\\73 " : "\\53 ") + g;
  }
  function el(i, o, f) {
    i.push(L(f));
    for (var g in o)
      if (rn.call(o, g)) {
        var T = o[g];
        if (T != null)
          switch (g) {
            case "children":
            case "dangerouslySetInnerHTML":
              throw Error(W(399, f));
            default:
              vn(i, g, T);
          }
      }
    return i.push("/>"), null;
  }
  function aa(i, o) {
    i.push(L("title"));
    var f = null, g = null, T;
    for (T in o)
      if (rn.call(o, T)) {
        var k = o[T];
        if (k != null)
          switch (T) {
            case "children":
              f = k;
              break;
            case "dangerouslySetInnerHTML":
              g = k;
              break;
            default:
              vn(i, T, k);
          }
      }
    return i.push(">"), o = Array.isArray(f) ? 2 > f.length ? f[0] : null : f, typeof o != "function" && typeof o != "symbol" && o !== null && o !== void 0 && i.push(de("" + o)), rr(i, g, f), i.push(Fe("title")), null;
  }
  function fi(i, o) {
    i.push(L("script"));
    var f = null, g = null, T;
    for (T in o)
      if (rn.call(o, T)) {
        var k = o[T];
        if (k != null)
          switch (T) {
            case "children":
              f = k;
              break;
            case "dangerouslySetInnerHTML":
              g = k;
              break;
            default:
              vn(i, T, k);
          }
      }
    return i.push(">"), rr(i, g, f), typeof f == "string" && i.push(("" + f).replace(Rt, Rn)), i.push(Fe("script")), null;
  }
  function Zl(i, o, f) {
    i.push(L(f));
    var g = f = null, T;
    for (T in o)
      if (rn.call(o, T)) {
        var k = o[T];
        if (k != null)
          switch (T) {
            case "children":
              f = k;
              break;
            case "dangerouslySetInnerHTML":
              g = k;
              break;
            default:
              vn(i, T, k);
          }
      }
    return i.push(">"), rr(i, g, f), f;
  }
  function Vl(i, o, f) {
    i.push(L(f));
    var g = f = null, T;
    for (T in o)
      if (rn.call(o, T)) {
        var k = o[T];
        if (k != null)
          switch (T) {
            case "children":
              f = k;
              break;
            case "dangerouslySetInnerHTML":
              g = k;
              break;
            default:
              vn(i, T, k);
          }
      }
    return i.push(">"), rr(i, g, f), typeof f == "string" ? (i.push(de(f)), null) : f;
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
  function ne(i, o, f, g, T, k, P, V, M) {
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
        var at = null, cn = null, wn = null, _n = null, en;
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
          var mn = cn !== null ? "" + cn : Nn(at);
          if (Me(Xe)) {
            for (var Rr = 0; Rr < Xe.length; Rr++)
              if ("" + Xe[Rr] === mn) {
                i.push(' selected=""');
                break;
              }
          } else
            "" + Xe === mn && i.push(' selected=""');
        } else wn && i.push(' selected=""');
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
        var qt = null, sn = null, wa = null, Zi = null, Cr = null, Pl = null, Al = null, Fl = null, Ei = null, Vi;
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
                  wa = Qt;
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
          T,
          sn,
          wa,
          Zi,
          Cr,
          qt
        );
        return Fl !== null ? Xl(i, "checked", Fl) : Ei !== null && Xl(i, "checked", Ei), Pl !== null ? vn(i, "value", Pl) : Al !== null && vn(i, "value", Al), i.push("/>"), Ja?.forEach(xr, i), null;
      case "button":
        i.push(L("button"));
        var Ka = null, xc = null, eu = null, Do = null, Ta = null, kr = null, Ec = null, Sr;
        for (Sr in f)
          if (rn.call(f, Sr)) {
            var Rl = f[Sr];
            if (Rl != null)
              switch (Sr) {
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
                  Ta = Rl;
                  break;
                case "formMethod":
                  kr = Rl;
                  break;
                case "formTarget":
                  Ec = Rl;
                  break;
                default:
                  vn(
                    i,
                    Sr,
                    Rl
                  );
              }
          }
        var Qi = Da(
          i,
          g,
          T,
          Do,
          Ta,
          kr,
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
        var Ji = null, nu = null, Lt = null, Cc = null, pa = null, Lo = null, ja;
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
                  pa = Ot;
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
          Ki !== null ? (Lt = Ki.action || "", Cc = Ki.encType, pa = Ki.method, Lo = Ki.target, Cl = Ki.data, un = Ki.name) : (i.push(
            " ",
            "action",
            '="',
            Ie,
            '"'
          ), Lo = pa = Cc = Lt = null, rc(g, T));
        }
        if (Lt != null && vn(i, "action", Lt), Cc != null && vn(i, "encType", Cc), pa != null && vn(i, "method", pa), Lo != null && vn(i, "target", Lo), i.push(">"), un !== null && (i.push('<input type="hidden"'), Xt(i, "name", un), i.push("/>"), Cl?.forEach(xr, i)), rr(i, nu, Ji), typeof Ji == "string") {
          i.push(de(Ji));
          var No = null;
        } else No = Ji;
        return No;
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
                  var dr = p("" + Ol);
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
        var mr = V.tagScope & 1, Nu = V.tagScope & 4;
        if (V.insertionMode === 4 || mr || f.itemProp != null)
          var $a = aa(
            i,
            f
          );
        else
          Nu ? $a = null : (aa(T.hoistableChunks, f), $a = void 0);
        return $a;
      case "link":
        var kc = V.tagScope & 1, tu = V.tagScope & 4, ru = f.rel, Ri = f.href, eo = f.precedence;
        if (V.insertionMode === 4 || kc || f.itemProp != null || typeof ru != "string" || typeof Ri != "string" || Ri === "") {
          ht(i, f);
          var no = null;
        } else if (f.rel === "stylesheet")
          if (typeof eo != "string" || f.disabled != null || f.onLoad || f.onError)
            no = ht(
              i,
              f
            );
          else {
            var Pr = T.styles.get(eo), Sc = g.styleResources.hasOwnProperty(Ri) ? g.styleResources[Ri] : void 0;
            if (Sc !== null) {
              g.styleResources[Ri] = null, Pr || (Pr = {
                precedence: de(eo),
                rules: [],
                hrefs: [],
                sheets: /* @__PURE__ */ new Map()
              }, T.styles.set(eo, Pr));
              var mc = {
                state: 0,
                props: Et({}, f, {
                  "data-precedence": f.precedence,
                  precedence: null
                })
              };
              if (Sc) {
                Sc.length === 2 && Yc(mc.props, Sc);
                var zu = T.preloads.stylesheets.get(Ri);
                zu && 0 < zu.length ? zu.length = 0 : mc.state = 1;
              }
              Pr.sheets.set(Ri, mc), P && P.stylesheets.add(mc);
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
          ) : (M && i.push("<!-- -->"), no = tu ? null : ht(T.hoistableChunks, f));
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
            var iu = g.moduleScriptResources, Pc = T.preloads.moduleScripts;
          else
            iu = g.scriptResources, Pc = T.preloads.scripts;
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
            T.scripts.add(ou), fi(ou, au);
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
          typeof Ca != "function" && typeof Ca != "symbol" && Ca !== null && Ca !== void 0 && i.push(("" + Ca).replace(po, xo)), rr(i, Fc, to), i.push(Fe("style"));
          var Oc = null;
        } else {
          var ka = T.styles.get(Ra);
          if ((g.styleResources.hasOwnProperty(_l) ? g.styleResources[_l] : void 0) !== null) {
            g.styleResources[_l] = null, ka || (ka = {
              precedence: de(Ra),
              rules: [],
              hrefs: [],
              sheets: /* @__PURE__ */ new Map()
            }, T.styles.set(Ra, ka));
            var us = T.nonce.style;
            if (!us || us === cs) {
              ka.hrefs.push(de(_l));
              var ss = ka.rules, li = null, Bo = null, kl;
              for (kl in f)
                if (rn.call(f, kl)) {
                  var Sa = f[kl];
                  if (Sa != null)
                    switch (kl) {
                      case "children":
                        li = Sa;
                        break;
                      case "dangerouslySetInnerHTML":
                        Bo = Sa;
                    }
                }
              var ro = Array.isArray(li) ? 2 > li.length ? li[0] : null : li;
              typeof ro != "function" && typeof ro != "symbol" && ro !== null && ro !== void 0 && ss.push(
                ("" + ro).replace(po, xo)
              ), rr(ss, Bo, li);
            }
          }
          ka && P && P.styles.add(ka), M && i.push("<!-- -->"), Oc = void 0;
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
          M && i.push("<!-- -->"), fs = Yu ? null : typeof f.charSet == "string" ? el(T.charsetChunks, f, "meta") : f.name === "viewport" ? el(T.viewportChunks, f, "meta") : el(T.hoistableChunks, f, "meta");
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
        var w = V.tagScope & 3, C = f.src, S = f.srcSet;
        if (!(f.loading === "lazy" || !C && !S || typeof C != "string" && C != null || typeof S != "string" && S != null || f.fetchPriority === "low" || w) && (typeof C != "string" || C[4] !== ":" || C[0] !== "d" && C[0] !== "D" || C[1] !== "a" && C[1] !== "A" || C[2] !== "t" && C[2] !== "T" || C[3] !== "a" && C[3] !== "A") && (typeof S != "string" || S[4] !== ":" || S[0] !== "d" && S[0] !== "D" || S[1] !== "a" && S[1] !== "A" || S[2] !== "t" && S[2] !== "T" || S[3] !== "a" && S[3] !== "A")) {
          P !== null && V.tagScope & 64 && (P.suspenseyImages = !0);
          var z = typeof f.sizes == "string" ? f.sizes : void 0, O = S ? S + `
` + (z || "") : C, H = T.preloads.images, Z = H.get(O);
          if (Z)
            (f.fetchPriority === "high" || 10 > T.highImagePreloads.size) && (H.delete(O), T.highImagePreloads.add(Z));
          else if (!g.imageResources.hasOwnProperty(O)) {
            g.imageResources[O] = Ne;
            var K = f.crossOrigin, xe = typeof K == "string" ? K === "use-credentials" ? K : "" : void 0, Te = T.headers, yn;
            Te && 0 < Te.remainingCapacity && typeof f.srcSet != "string" && (f.fetchPriority === "high" || 500 > Te.highImagePreloads.length) && (yn = rt(C, "image", {
              imageSrcSet: f.srcSet,
              imageSizes: f.sizes,
              crossOrigin: xe,
              integrity: f.integrity,
              nonce: f.nonce,
              type: f.type,
              fetchPriority: f.fetchPriority,
              referrerPolicy: f.refererPolicy
            }), 0 <= (Te.remainingCapacity -= yn.length + 2)) ? (T.resets.image[O] = Ne, Te.highImagePreloads && (Te.highImagePreloads += ", "), Te.highImagePreloads += yn) : (Z = [], ht(Z, {
              rel: "preload",
              as: "image",
              href: S ? void 0 : C,
              imageSrcSet: S,
              imageSizes: z,
              crossOrigin: xe,
              integrity: f.integrity,
              type: f.type,
              fetchPriority: f.fetchPriority,
              referrerPolicy: f.referrerPolicy
            }), f.fetchPriority === "high" || 10 > T.highImagePreloads.size ? T.highImagePreloads.add(Z) : (T.bulkPreloads.add(Z), H.set(O, Z)));
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
          var Ve = k || T.preamble;
          if (Ve.headChunks)
            throw Error(W(545, "`<head>`"));
          k !== null && i.push("<!--head-->"), Ve.headChunks = [];
          var bn = Zl(
            Ve.headChunks,
            f,
            "head"
          );
        } else
          bn = Vl(
            i,
            f,
            "head"
          );
        return bn;
      case "body":
        if (2 > V.insertionMode) {
          var bt = k || T.preamble;
          if (bt.bodyChunks)
            throw Error(W(545, "`<body>`"));
          k !== null && i.push("<!--body-->"), bt.bodyChunks = [];
          var $n = Zl(
            bt.bodyChunks,
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
          var gr = k || T.preamble;
          if (gr.htmlChunks)
            throw Error(W(545, "`<html>`"));
          k !== null && i.push("<!--html-->"), gr.htmlChunks = [""];
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
      for (this.push(me.startInlineStyle), this.push(' media="not all" data-precedence="'), this.push(i.precedence), this.push('" data-href="'); g < f.length - 1; g++)
        this.push(f[g]), this.push(" ");
      for (this.push(f[g]), this.push('">'), g = 0; g < o.length; g++) this.push(o[g]);
      ur = this.push("</style>"), La = !0, o.length = 0, f.length = 0;
    }
  }
  function Yn(i) {
    return i.state !== 2 ? La = !0 : !1;
  }
  function lc(i, o, f) {
    return La = !1, ur = !0, me = f, o.styles.forEach(tl, i), me = null, o.stylesheets.forEach(Yn), La && (f.stylesToHoist = !0), ur;
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
      if (this.push(me.startInlineStyle), this.push(' data-precedence="'), this.push(i.precedence), i = 0, g.length) {
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
          var T = g.props["data-precedence"], k = g.props, P = p("" + g.props.href);
          P = oa(P), i.push(P), T = "" + T, i.push(","), T = oa(T), i.push(T);
          for (var V in k)
            if (rn.call(k, V) && (T = k[V], T != null))
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
                    T
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
        f = p(f), o = "" + f;
        break;
      default:
        if (2 < o.length && (o[0] === "o" || o[0] === "O") && (o[1] === "n" || o[1] === "N") || !qr(o))
          return;
        o = "" + f;
    }
    i.push(","), g = oa(g), i.push(g), i.push(","), g = oa(o), i.push(g);
  }
  function kn() {
    return { styles: /* @__PURE__ */ new Set(), stylesheets: /* @__PURE__ */ new Set(), suspenseyImages: !1 };
  }
  function Jl(i) {
    var o = Dt || null;
    if (o) {
      var f = o.resumableState, g = o.renderState;
      if (typeof i == "string" && i) {
        if (!f.dnsResources.hasOwnProperty(i)) {
          f.dnsResources[i] = null, f = g.headers;
          var T, k;
          (k = f && 0 < f.remainingCapacity) && (k = (T = "<" + ("" + i).replace(
            Gc,
            Eo
          ) + ">; rel=dns-prefetch", 0 <= (f.remainingCapacity -= T.length + 2))), k ? (g.resets.dns[i] = null, f.preconnects && (f.preconnects += ", "), f.preconnects += T) : (T = [], ht(T, { href: i, rel: "dns-prefetch" }), g.preconnects.add(T));
        }
        Io(o);
      }
    } else ke.D(i);
  }
  function sr(i, o) {
    var f = Dt || null;
    if (f) {
      var g = f.resumableState, T = f.renderState;
      if (typeof i == "string" && i) {
        var k = o === "use-credentials" ? "credentials" : typeof o == "string" ? "anonymous" : "default";
        if (!g.connectResources[k].hasOwnProperty(i)) {
          g.connectResources[k][i] = null, g = T.headers;
          var P, V;
          if (V = g && 0 < g.remainingCapacity) {
            if (V = "<" + ("" + i).replace(
              Gc,
              Eo
            ) + ">; rel=preconnect", typeof o == "string") {
              var M = ("" + o).replace(
                wl,
                za
              );
              V += '; crossorigin="' + M + '"';
            }
            V = (P = V, 0 <= (g.remainingCapacity -= P.length + 2));
          }
          V ? (T.resets.connect[k][i] = null, g.preconnects && (g.preconnects += ", "), g.preconnects += P) : (k = [], ht(k, {
            rel: "preconnect",
            href: i,
            crossOrigin: o
          }), T.preconnects.add(k));
        }
        Io(f);
      }
    } else ke.C(i, o);
  }
  function Na(i, o, f) {
    var g = Dt || null;
    if (g) {
      var T = g.resumableState, k = g.renderState;
      if (o && i) {
        switch (o) {
          case "image":
            if (f)
              var P = f.imageSrcSet, V = f.imageSizes, M = f.fetchPriority;
            var G = P ? P + `
` + (V || "") : i;
            if (T.imageResources.hasOwnProperty(G)) return;
            T.imageResources[G] = Ne, T = k.headers;
            var re;
            T && 0 < T.remainingCapacity && typeof P != "string" && M === "high" && (re = rt(i, o, f), 0 <= (T.remainingCapacity -= re.length + 2)) ? (k.resets.image[G] = Ne, T.highImagePreloads && (T.highImagePreloads += ", "), T.highImagePreloads += re) : (T = [], ht(
              T,
              Et(
                { rel: "preload", href: P ? void 0 : i, as: o },
                f
              )
            ), M === "high" ? k.highImagePreloads.add(T) : (k.bulkPreloads.add(T), k.preloads.images.set(G, T)));
            break;
          case "style":
            if (T.styleResources.hasOwnProperty(i)) return;
            P = [], ht(
              P,
              Et({ rel: "preload", href: i, as: o }, f)
            ), T.styleResources[i] = !f || typeof f.crossOrigin != "string" && typeof f.integrity != "string" ? Ne : [f.crossOrigin, f.integrity], k.preloads.stylesheets.set(i, P), k.bulkPreloads.add(P);
            break;
          case "script":
            if (T.scriptResources.hasOwnProperty(i)) return;
            P = [], k.preloads.scripts.set(i, P), k.bulkPreloads.add(P), ht(
              P,
              Et({ rel: "preload", href: i, as: o }, f)
            ), T.scriptResources[i] = !f || typeof f.crossOrigin != "string" && typeof f.integrity != "string" ? Ne : [f.crossOrigin, f.integrity];
            break;
          default:
            if (T.unknownResources.hasOwnProperty(o)) {
              if (P = T.unknownResources[o], P.hasOwnProperty(i))
                return;
            } else
              P = {}, T.unknownResources[o] = P;
            P[i] = Ne, (T = k.headers) && 0 < T.remainingCapacity && o === "font" && (G = rt(i, o, f), 0 <= (T.remainingCapacity -= G.length + 2)) ? (k.resets.font[i] = Ne, T.fontPreloads && (T.fontPreloads += ", "), T.fontPreloads += G) : (T = [], i = Et({ rel: "preload", href: i, as: o }, f), ht(T, i), o) === "font" ? k.fontPreloads.add(T) : k.bulkPreloads.add(T);
        }
        Io(g);
      }
    } else ke.L(i, o, f);
  }
  function Wc(i, o) {
    var f = Dt || null;
    if (f) {
      var g = f.resumableState, T = f.renderState;
      if (i) {
        var k = o && typeof o.as == "string" ? o.as : "script";
        switch (k) {
          case "script":
            if (g.moduleScriptResources.hasOwnProperty(i)) return;
            k = [], g.moduleScriptResources[i] = !o || typeof o.crossOrigin != "string" && typeof o.integrity != "string" ? Ne : [o.crossOrigin, o.integrity], T.preloads.moduleScripts.set(i, k);
            break;
          default:
            if (g.moduleUnknownResources.hasOwnProperty(k)) {
              var P = g.unknownResources[k];
              if (P.hasOwnProperty(i)) return;
            } else
              P = {}, g.moduleUnknownResources[k] = P;
            k = [], P[i] = Ne;
        }
        ht(k, Et({ rel: "modulepreload", href: i }, o)), T.bulkPreloads.add(k), Io(f);
      }
    } else ke.m(i, o);
  }
  function Er(i, o, f) {
    var g = Dt || null;
    if (g) {
      var T = g.resumableState, k = g.renderState;
      if (i) {
        o = o || "default";
        var P = k.styles.get(o), V = T.styleResources.hasOwnProperty(i) ? T.styleResources[i] : void 0;
        V !== null && (T.styleResources[i] = null, P || (P = {
          precedence: de(o),
          rules: [],
          hrefs: [],
          sheets: /* @__PURE__ */ new Map()
        }, k.styles.set(o, P)), o = {
          state: 0,
          props: Et(
            { rel: "stylesheet", href: i, "data-precedence": o },
            f
          )
        }, V && (V.length === 2 && Yc(o.props, V), (k = k.preloads.stylesheets.get(i)) && 0 < k.length ? k.length = 0 : o.state = 1), P.sheets.set(i, o), Io(g));
      }
    } else ke.S(i, o, f);
  }
  function ns(i, o) {
    var f = Dt || null;
    if (f) {
      var g = f.resumableState, T = f.renderState;
      if (i) {
        var k = g.scriptResources.hasOwnProperty(i) ? g.scriptResources[i] : void 0;
        k !== null && (g.scriptResources[i] = null, o = Et({ src: i, async: !0 }, o), k && (k.length === 2 && Yc(o, k), i = T.preloads.scripts.get(i)) && (i.length = 0), i = [], T.scripts.add(i), fi(i, o), Io(f));
      }
    } else ke.X(i, o);
  }
  function Su(i, o) {
    var f = Dt || null;
    if (f) {
      var g = f.resumableState, T = f.renderState;
      if (i) {
        var k = g.moduleScriptResources.hasOwnProperty(
          i
        ) ? g.moduleScriptResources[i] : void 0;
        k !== null && (g.moduleScriptResources[i] = null, o = Et({ src: i, type: "module", async: !0 }, o), k && (k.length === 2 && Yc(o, k), i = T.preloads.moduleScripts.get(i)) && (i.length = 0), i = [], T.scripts.add(i), fi(i, o), Io(f));
      }
    } else ke.M(i, o);
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
      za
    ), o = "<" + i + '>; rel=preload; as="' + o + '"';
    for (var g in f)
      rn.call(f, g) && (i = f[g], typeof i == "string" && (o += "; " + g.toLowerCase() + '="' + ("" + i).replace(
        wl,
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
  var wl = /["';,\r\n]/g;
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
    var f = i.idPrefix, g = [], T = i.bootstrapScriptContent, k = i.bootstrapScripts, P = i.bootstrapModules;
    T !== void 0 && (g.push("<script"), oc(g, i), g.push(
      ">",
      ("" + T).replace(Rt, Rn),
      "<\/script>"
    )), T = f + "P:";
    var V = f + "S:";
    f += "B:";
    var M = /* @__PURE__ */ new Set(), G = /* @__PURE__ */ new Set(), re = /* @__PURE__ */ new Set(), $ = /* @__PURE__ */ new Map(), ve = /* @__PURE__ */ new Set(), De = /* @__PURE__ */ new Set(), on = /* @__PURE__ */ new Set(), Ze = {
      images: /* @__PURE__ */ new Map(),
      stylesheets: /* @__PURE__ */ new Map(),
      scripts: /* @__PURE__ */ new Map(),
      moduleScripts: /* @__PURE__ */ new Map()
    };
    if (k !== void 0)
      for (var He = 0; He < k.length; He++) {
        var je = k[He], Xe, at = void 0, cn = void 0, wn = {
          rel: "preload",
          as: "script",
          fetchPriority: "low",
          nonce: void 0
        };
        typeof je == "string" ? wn.href = Xe = je : (wn.href = Xe = je.src, wn.integrity = cn = typeof je.integrity == "string" ? je.integrity : void 0, wn.crossOrigin = at = typeof je == "string" || je.crossOrigin == null ? void 0 : je.crossOrigin === "use-credentials" ? "use-credentials" : ""), je = i;
        var _n = Xe;
        je.scriptResources[_n] = null, je.moduleScriptResources[_n] = null, je = [], ht(je, wn), ve.add(je), g.push('<script src="', de(Xe), '"'), typeof cn == "string" && g.push(
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
      for (k = 0; k < P.length; k++)
        wn = P[k], at = Xe = void 0, cn = {
          rel: "modulepreload",
          fetchPriority: "low",
          nonce: void 0
        }, typeof wn == "string" ? cn.href = He = wn : (cn.href = He = wn.src, cn.integrity = at = typeof wn.integrity == "string" ? wn.integrity : void 0, cn.crossOrigin = Xe = typeof wn == "string" || wn.crossOrigin == null ? void 0 : wn.crossOrigin === "use-credentials" ? "use-credentials" : ""), wn = i, je = He, wn.scriptResources[je] = null, wn.moduleScriptResources[je] = null, wn = [], ht(wn, cn), ve.add(wn), g.push(
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
      placeholderPrefix: T,
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
      case be:
        return "Fragment";
      case pn:
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
  var Zt = {}, ko = null;
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
    var o = ko;
    o !== i && (o === null ? yi(i) : i === null ? Zc(o) : o.depth === i.depth ? sc(o, i) : o.depth > i.depth ? fc(o, i) : Ur(o, i), ko = i);
  }
  var mu = {
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
    var T = 32 - dc(g) - 1;
    g &= ~(1 << T), f += 1;
    var k = 32 - dc(o) + T;
    if (30 < k) {
      var P = T - T % 5;
      return k = (g & (1 << P) - 1).toString(32), g >>= P, T -= P, {
        id: 1 << 32 - dc(o) + T | f << T | g,
        overflow: k + i
      };
    }
    return {
      id: 1 << k | f << T | g,
      overflow: i
    };
  }
  var dc = Math.clz32 ? Math.clz32 : Yr, ca = Math.log, So = Math.LN2;
  function Yr(i) {
    return i >>>= 0, i === 0 ? 32 : 31 - (ca(i) / So | 0) | 0;
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
              var T = o;
              T.status = "fulfilled", T.value = g;
            }
          },
          function(g) {
            if (o.status === "pending") {
              var T = o;
              T.status = "rejected", T.reason = g;
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
  var Li = typeof Object.is == "function" ? Object.is : Au, bi = null, mo = null, Ni = null, zi = null, Po = null, $e = null, ql = !1, Mt = !1, wi = 0, Vt = 0, ua = -1, Ha = 0, Ti = null, Hi = null, It = 0;
  function Bi() {
    if (bi === null)
      throw Error(W(321));
    return bi;
  }
  function Ui() {
    if (0 < It) throw Error(W(312));
    return { memoizedState: null, queue: null, next: null };
  }
  function Ba() {
    return $e === null ? Po === null ? (ql = !1, Po = $e = Ui()) : (ql = !0, $e = Po) : $e.next === null ? (ql = !1, $e = $e.next = Ui()) : (ql = !0, $e = $e.next), $e;
  }
  function sa() {
    var i = Ti;
    return Ti = null, i;
  }
  function Ua() {
    zi = Ni = mo = bi = null, Mt = !1, Po = null, It = 0, $e = Hi = null;
  }
  function Gr(i, o) {
    return typeof o == "function" ? o(i) : o;
  }
  function Wa(i, o, f) {
    if (bi = Bi(), $e = Ba(), ql) {
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
      bi,
      i
    ), [$e.memoizedState, i];
  }
  function $l(i, o) {
    if (bi = Bi(), $e = Ba(), o = o === void 0 ? null : o, $e !== null) {
      var f = $e.memoizedState;
      if (f !== null && o !== null) {
        var g = f[1];
        e: if (g === null) g = !1;
        else {
          for (var T = 0; T < g.length && T < o.length; T++)
            if (!Li(o[T], g[T])) {
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
    if (i === bi)
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
    var g = Vt++, T = Ni;
    if (typeof i.$$FORM_ACTION == "function") {
      var k = null, P = zi;
      T = T.formState;
      var V = i.$$IS_SIGNATURE_EQUAL;
      if (T !== null && typeof V == "function") {
        var M = T[1];
        V.call(i, T[2], T[3]) && (k = f !== void 0 ? "p" + f : "k" + Je(
          JSON.stringify([P, null, g]),
          0
        ), M === k && (ua = g, o = T[0]));
      }
      var G = i.bind(null, o);
      return i = function($) {
        G($);
      }, typeof G.$$FORM_ACTION == "function" && (i.$$FORM_ACTION = function($) {
        $ = G.$$FORM_ACTION($), f !== void 0 && (f += "", $.action = f);
        var ve = $.data;
        return ve && (k === null && (k = f !== void 0 ? "p" + f : "k" + Je(
          JSON.stringify([
            P,
            null,
            g
          ]),
          0
        )), ve.append("$ACTION_KEY", k)), $;
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
    return Ha += 1, Ti === null && (Ti = []), Pu(Ti, i, o);
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
      bi = Bi(), $e = Ba();
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
      var i = mo.treeContext, o = i.overflow;
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
      return Bi(), [i, Ao];
    },
    useActionState: Fo,
    useFormState: Fo,
    useHostTransitionStatus: function() {
      return Bi(), pe;
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
      var T = Object.getOwnPropertyDescriptor(
        g.DetermineComponentFrameRoot,
        "name"
      );
      T && T.configurable && Object.defineProperty(
        g.DetermineComponentFrameRoot,
        "name",
        { value: "DetermineComponentFrameRoot" }
      );
      var k = g.DetermineComponentFrameRoot(), P = k[0], V = k[1];
      if (P && V) {
        var M = P.split(`
`), G = V.split(`
`);
        for (T = g = 0; g < M.length && !M[g].includes("DetermineComponentFrameRoot"); )
          g++;
        for (; T < G.length && !G[T].includes(
          "DetermineComponentFrameRoot"
        ); )
          T++;
        if (g === M.length || T === G.length)
          for (g = M.length - 1, T = G.length - 1; 1 <= g && 0 <= T && M[g] !== G[T]; )
            T--;
        for (; 1 <= g && 0 <= T; g--, T--)
          if (M[g] !== G[T]) {
            if (g !== 1 || T !== 1)
              do
                if (g--, T--, 0 > T || M[g] !== G[T]) {
                  var re = `
` + M[g].replace(" at new ", " at ");
                  return i.displayName && re.includes("<anonymous>") && (re = re.replace("<anonymous>", i.displayName)), re;
                }
              while (1 <= g && 0 <= T);
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
  function Es(i, o, f, g, T, k, P, V, M, G, re) {
    var $ = /* @__PURE__ */ new Set();
    this.destination = null, this.flushScheduled = !1, this.resumableState = i, this.renderState = o, this.rootFormatContext = f, this.progressiveChunkSize = g === void 0 ? 12800 : g, this.status = 10, this.fatalError = null, this.pendingRootTasks = this.allPendingTasks = this.nextSegmentId = 0, this.completedPreambleSegments = this.completedRootSegment = null, this.byteSize = 0, this.abortableTasks = $, this.pingedTasks = [], this.clientRenderedBoundaries = [], this.completedBoundaries = [], this.partialBoundaries = [], this.trackedPostpones = null, this.onError = T === void 0 ? Mu : T, this.onPostpone = G === void 0 ? Kt : G, this.onAllReady = k === void 0 ? Kt : k, this.onShellReady = P === void 0 ? Kt : P, this.onShellError = V === void 0 ? Kt : V, this.onFatalError = M === void 0 ? Kt : M, this.formState = re === void 0 ? null : re;
  }
  function Ya(i, o, f, g, T, k, P, V, M, G, re, $) {
    return o = new Es(
      o,
      f,
      g,
      T,
      k,
      P,
      V,
      M,
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
    ), pl(i), o.pingedTasks.push(i), o;
  }
  var Dt = null;
  function pi(i, o) {
    i.pingedTasks.push(o), i.pingedTasks.length === 1 && (i.flushScheduled = i.destination !== null, as(i));
  }
  function vc(i, o, f, g, T) {
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
      contentState: kn(),
      fallbackState: kn(),
      contentPreamble: g,
      fallbackPreamble: T,
      trackedContentKeyPath: null,
      trackedFallbackNode: null
    }, o !== null && (o.pendingTasks++, g = o.boundaries, g !== null && (i.allPendingTasks++, f.pendingTasks++, g.push(f)), i = o.inheritedHoistables, i !== null && Ro(f.contentState, i)), f;
  }
  function yc(i, o, f, g, T, k, P, V, M, G, re, $, ve, De, on) {
    i.allPendingTasks++, T === null ? i.pendingRootTasks++ : T.pendingTasks++, De !== null && De.pendingTasks++;
    var Ze = {
      replay: null,
      node: f,
      childIndex: g,
      ping: function() {
        return pi(i, Ze);
      },
      blockedBoundary: T,
      blockedSegment: k,
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
  function Qc(i, o, f, g, T, k, P, V, M, G, re, $, ve, De) {
    i.allPendingTasks++, k === null ? i.pendingRootTasks++ : k.pendingTasks++, ve !== null && ve.pendingTasks++, f.pendingTasks++;
    var on = {
      replay: f,
      node: g,
      childIndex: T,
      ping: function() {
        return pi(i, on);
      },
      blockedBoundary: k,
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
  function Tl(i, o, f, g, T, k) {
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
      lastPushedText: T,
      textEmbedded: k
    };
  }
  function pl(i) {
    var o = i.node;
    typeof o == "object" && o !== null && o.$$typeof === Se && (i.componentStack = { parent: i.componentStack, type: o.type });
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
          var T = f;
        } catch (k) {
          T = `
Error generating stack: ` + k.message + `
` + k.stack;
        }
        return Object.defineProperty(o, "componentStack", {
          value: T
        }), T;
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
        for (var T = 0; T < g.length; T++) {
          var k = g[T];
          f !== null && Ro(k.contentState, f), Gi(i, k, null, null);
        }
      }
      if (o.pendingTasks--, 0 < o.pendingTasks) break;
      f = o.hoistables, o = o.next;
    }
  }
  function Jc(i, o) {
    var f = o.boundaries;
    if (f !== null && o.pendingTasks === f.length) {
      for (var g = !0, T = 0; T < f.length; T++) {
        var k = f[T];
        if (k.pendingTasks !== 1 || k.parentFlushed || ga(i, k)) {
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
      hoistables: kn(),
      inheritedHoistables: null,
      together: !1,
      next: null
    };
    return i !== null && 0 < i.pendingTasks && (o.pendingTasks++, o.boundaries = [], i.next = o), o;
  }
  function jc(i, o, f, g, T) {
    var k = o.keyPath, P = o.treeContext, V = o.row;
    o.keyPath = f, f = g.length;
    var M = null;
    if (o.replay !== null) {
      var G = o.replay.slots;
      if (G !== null && typeof G == "object")
        for (var re = 0; re < f; re++) {
          var $ = T !== "backwards" && T !== "unstable_legacy-backwards" ? re : f - 1 - re, ve = g[$];
          o.row = M = Kc(
            M
          ), o.treeContext = Wr(P, f, $);
          var De = G[$];
          typeof De == "number" ? (Tc(i, o, De, ve, $), delete G[$]) : lr(i, o, ve, $), --M.pendingTasks === 0 && lt(i, M);
        }
      else
        for (G = 0; G < f; G++)
          re = T !== "backwards" && T !== "unstable_legacy-backwards" ? G : f - 1 - G, $ = g[re], o.row = M = Kc(M), o.treeContext = Wr(P, f, re), lr(i, o, $, re), --M.pendingTasks === 0 && lt(i, M);
    } else if (T !== "backwards" && T !== "unstable_legacy-backwards")
      for (T = 0; T < f; T++)
        G = g[T], o.row = M = Kc(M), o.treeContext = Wr(
          P,
          f,
          T
        ), lr(i, o, G, T), --M.pendingTasks === 0 && lt(i, M);
    else {
      for (T = o.blockedSegment, G = T.children.length, re = T.chunks.length, $ = f - 1; 0 <= $; $--) {
        ve = g[$], o.row = M = Kc(
          M
        ), o.treeContext = Wr(P, f, $), De = Tl(
          i,
          re,
          null,
          o.formatContext,
          $ === 0 ? T.lastPushedText : !0,
          !0
        ), T.children.splice(G, 0, De), o.blockedSegment = De;
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
      o.blockedSegment = T, T.lastPushedText = !1;
    }
    V !== null && M !== null && 0 < M.pendingTasks && (V.pendingTasks++, M.next = V), o.treeContext = P, o.row = V, o.keyPath = k;
  }
  function bc(i, o, f, g, T, k) {
    var P = o.thenableState;
    for (o.thenableState = null, bi = {}, mo = o, Ni = i, zi = f, Vt = wi = 0, ua = -1, Ha = 0, Ti = P, i = g(T, k); Mt; )
      Mt = !1, Vt = wi = 0, ua = -1, Ha = 0, It += 1, $e = null, i = g(T, k);
    return Ua(), i;
  }
  function Yi(i, o, f, g, T, k, P) {
    var V = !1;
    if (k !== 0 && i.formState !== null) {
      var M = o.blockedSegment;
      if (M !== null) {
        V = !0, M = M.chunks;
        for (var G = 0; G < k; G++)
          G === P ? M.push("<!--F!-->") : M.push("<!--F-->");
      }
    }
    k = o.keyPath, o.keyPath = f, T ? (f = o.treeContext, o.treeContext = Wr(f, 1, 0), lr(i, o, g, -1), o.treeContext = f) : V ? lr(i, o, g, -1) : Xr(i, o, g, -1), o.keyPath = k;
  }
  function wc(i, o, f, g, T, k) {
    if (typeof g == "function")
      if (g.prototype && g.prototype.isReactComponent) {
        var P = T;
        if ("ref" in T) {
          P = {};
          for (var V in T)
            V !== "ref" && (P[V] = T[V]);
        }
        var M = g.defaultProps;
        if (M) {
          P === T && (P = Et({}, P, T));
          for (var G in M)
            P[G] === void 0 && (P[G] = M[G]);
        }
        T = P, P = Zt, M = g.contextType, typeof M == "object" && M !== null && (P = M._currentValue2), P = new g(T, P);
        var re = P.state !== void 0 ? P.state : null;
        if (P.updater = mu, P.props = T, P.state = re, M = { queue: [], replace: !1 }, P._reactInternals = M, k = g.contextType, P.context = typeof k == "object" && k !== null ? k._currentValue2 : Zt, k = g.getDerivedStateFromProps, typeof k == "function" && (k = k(T, re), re = k == null ? re : Et({}, re, k), P.state = re), typeof g.getDerivedStateFromProps != "function" && typeof P.getSnapshotBeforeUpdate != "function" && (typeof P.UNSAFE_componentWillMount == "function" || typeof P.componentWillMount == "function"))
          if (g = P.state, typeof P.componentWillMount == "function" && P.componentWillMount(), typeof P.UNSAFE_componentWillMount == "function" && P.UNSAFE_componentWillMount(), g !== P.state && mu.enqueueReplaceState(
            P,
            P.state,
            null
          ), M.queue !== null && 0 < M.queue.length)
            if (g = M.queue, k = M.replace, M.queue = null, M.replace = !1, k && g.length === 1)
              P.state = g[0];
            else {
              for (M = k ? g[0] : P.state, re = !0, k = k ? 1 : 0; k < g.length; k++)
                G = g[k], G = typeof G == "function" ? G.call(P, M, T, void 0) : G, G != null && (re ? (re = !1, M = Et({}, M, G)) : Et(M, G));
              P.state = M;
            }
          else M.queue = null;
        if (g = P.render(), i.status === 12) throw null;
        T = o.keyPath, o.keyPath = f, Xr(i, o, g, -1), o.keyPath = T;
      } else {
        if (g = bc(i, o, f, g, T, void 0), i.status === 12) throw null;
        Yi(
          i,
          o,
          f,
          g,
          wi !== 0,
          Vt,
          ua
        );
      }
    else if (typeof g == "string")
      if (P = o.blockedSegment, P === null)
        P = T.children, M = o.formatContext, re = o.keyPath, o.formatContext = Ia(M, g, T), o.keyPath = f, lr(i, o, P, -1), o.formatContext = M, o.keyPath = re;
      else {
        if (re = ne(
          P.chunks,
          g,
          T,
          i.resumableState,
          i.renderState,
          o.blockedPreamble,
          o.hoistableState,
          o.formatContext,
          P.lastPushedText
        ), P.lastPushedText = !1, M = o.formatContext, k = o.keyPath, o.keyPath = f, (o.formatContext = Ia(M, g, T)).insertionMode === 3) {
          f = Tl(
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
        o.formatContext = M, o.keyPath = k;
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
        case pn:
        case be:
          g = o.keyPath, o.keyPath = f, Xr(i, o, T.children, -1), o.keyPath = g;
          return;
        case ft:
          g = o.blockedSegment, g === null ? T.mode !== "hidden" && (g = o.keyPath, o.keyPath = f, lr(i, o, T.children, -1), o.keyPath = g) : T.mode !== "hidden" && (i.renderState.generateStaticMarkup || g.chunks.push("<!--&-->"), g.lastPushedText = !1, P = o.keyPath, o.keyPath = f, lr(i, o, T.children, -1), o.keyPath = P, i.renderState.generateStaticMarkup || g.chunks.push("<!--/&-->"), g.lastPushedText = !1);
          return;
        case D:
          e: {
            if (g = T.children, T = T.revealOrder, T === "forwards" || T === "backwards" || T === "unstable_legacy-backwards") {
              if (Me(g)) {
                jc(i, o, f, g, T);
                break e;
              }
              if ((P = Jn(g)) && (P = P.call(g))) {
                if (M = P.next(), !M.done) {
                  do
                    M = P.next();
                  while (!M.done);
                  jc(i, o, f, g, T);
                }
                break e;
              }
            }
            T === "together" ? (T = o.keyPath, P = o.row, M = o.row = Kc(null), M.boundaries = [], M.together = !0, o.keyPath = f, Xr(i, o, g, -1), --M.pendingTasks === 0 && lt(i, M), o.keyPath = T, o.row = P, P !== null && 0 < M.pendingTasks && (P.pendingTasks++, M.next = P)) : (T = o.keyPath, o.keyPath = f, Xr(i, o, g, -1), o.keyPath = T);
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
            ), o.row = null, f = T.children;
            try {
              lr(i, o, f, -1);
            } finally {
              o.keyPath = g, o.formatContext = P, o.row = M;
            }
          } else {
            g = o.keyPath, k = o.formatContext;
            var $ = o.row, ve = o.blockedBoundary;
            G = o.blockedPreamble;
            var De = o.hoistableState;
            V = o.blockedSegment;
            var on = T.fallback;
            T = T.children;
            var Ze = /* @__PURE__ */ new Set(), He = vc(
              i,
              o.row,
              Ze,
              null,
              null
            );
            i.trackedPostpones !== null && (He.trackedContentKeyPath = f);
            var je = Tl(
              i,
              V.chunks.length,
              He,
              o.formatContext,
              !1,
              !1
            );
            V.children.push(je), V.lastPushedText = !1;
            var Xe = Tl(
              i,
              0,
              null,
              o.formatContext,
              !1,
              !1
            );
            if (Xe.parentFlushed = !0, i.trackedPostpones !== null) {
              P = o.componentStack, M = [f[0], "Suspense Fallback", f[2]], re = [M[1], M[2], [], null], i.trackedPostpones.workingMap.set(M, re), He.trackedFallbackNode = re, o.blockedSegment = je, o.blockedPreamble = He.fallbackPreamble, o.keyPath = M, o.formatContext = kt(
                i.resumableState,
                k
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
                o.blockedSegment = V, o.blockedPreamble = G, o.keyPath = g, o.formatContext = k;
              }
              o = yc(
                i,
                null,
                T,
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
              ), pl(o), i.pingedTasks.push(o);
            } else {
              o.blockedBoundary = He, o.blockedPreamble = He.contentPreamble, o.hoistableState = He.contentState, o.blockedSegment = Xe, o.keyPath = f, o.formatContext = xn(
                i.resumableState,
                k
              ), o.row = null, Xe.status = 6;
              try {
                if (lr(i, o, T, -1), vi(
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
                o.blockedBoundary = ve, o.blockedPreamble = G, o.hoistableState = De, o.blockedSegment = V, o.keyPath = g, o.formatContext = k, o.row = $;
              }
              o = yc(
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
                kt(
                  i.resumableState,
                  o.formatContext
                ),
                o.context,
                o.treeContext,
                o.row,
                rl(
                  o.componentStack
                )
              ), pl(o), i.pingedTasks.push(o);
            }
          }
          return;
      }
      if (typeof g == "object" && g !== null)
        switch (g.$$typeof) {
          case Be:
            if ("ref" in T)
              for (on in P = {}, T)
                on !== "ref" && (P[on] = T[on]);
            else P = T;
            g = bc(
              i,
              o,
              f,
              g.render,
              P,
              k
            ), Yi(
              i,
              o,
              f,
              g,
              wi !== 0,
              Vt,
              ua
            );
            return;
          case Ae:
            wc(i, o, f, g.type, T, k);
            return;
          case ie:
            if (M = T.children, P = o.keyPath, T = T.value, re = g._currentValue2, g._currentValue2 = T, k = ko, ko = g = {
              parent: k,
              depth: k === null ? 0 : k.depth + 1,
              context: g,
              parentValue: re,
              value: T
            }, o.context = g, o.keyPath = f, Xr(i, o, M, -1), i = ko, i === null) throw Error(W(403));
            i.context._currentValue2 = i.parentValue, i = ko = i.parent, o.context = i, o.keyPath = P;
            return;
          case Re:
            T = T.children, g = T(g._context._currentValue2), T = o.keyPath, o.keyPath = f, Xr(i, o, g, -1), o.keyPath = T;
            return;
          case ee:
            if (P = g._init, g = P(g._payload), i.status === 12) throw null;
            wc(i, o, f, g, T, k);
            return;
        }
      throw Error(
        W(130, g == null ? g : typeof g, "")
      );
    }
  }
  function Tc(i, o, f, g, T) {
    var k = o.replay, P = o.blockedBoundary, V = Tl(
      i,
      0,
      null,
      o.formatContext,
      !1,
      !1
    );
    V.id = f, V.parentFlushed = !0;
    try {
      o.replay = null, o.blockedSegment = V, lr(i, o, g, T), V.status = 1, P === null ? i.completedRootSegment = V : (fr(P, V), P.parentFlushed && i.partialBoundaries.push(P));
    } finally {
      o.replay = k, o.blockedSegment = null;
    }
  }
  function Xr(i, o, f, g) {
    o.replay !== null && typeof o.replay.slots == "number" ? Tc(i, o, o.replay.slots, f, g) : (o.node = f, o.childIndex = g, f = o.componentStack, pl(o), it(i, o), o.componentStack = f);
  }
  function it(i, o) {
    var f = o.node, g = o.childIndex;
    if (f !== null) {
      if (typeof f == "object") {
        switch (f.$$typeof) {
          case Se:
            var T = f.type, k = f.key, P = f.props;
            f = P.ref;
            var V = f !== void 0 ? f : null, M = uc(T), G = k ?? (g === -1 ? 0 : g);
            if (k = [o.keyPath, M, G], o.replay !== null)
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
                        if (wc(i, o, k, T, P, V), o.replay.pendingTasks === 1 && 0 < o.replay.nodes.length)
                          throw Error(W(488));
                        o.replay.pendingTasks--;
                      } catch (_n) {
                        if (typeof _n == "object" && _n !== null && (_n === jn || typeof _n.then == "function"))
                          throw o.node === G ? o.replay = re : g.splice(f, 1), _n;
                        o.replay.pendingTasks--, P = xl(o.componentStack), k = i, i = o.blockedBoundary, T = _n, P = Gn(k, T, P), ti(
                          k,
                          i,
                          ve,
                          M,
                          T,
                          P
                        );
                      }
                      o.replay = re;
                    } else {
                      if (T !== A)
                        throw Error(
                          W(
                            490,
                            "Suspense",
                            uc(T) || "Unknown"
                          )
                        );
                      n: {
                        re = void 0, T = $[5], V = $[2], M = $[3], G = $[4] === null ? [] : $[4][2], $ = $[4] === null ? null : $[4][3];
                        var De = o.keyPath, on = o.formatContext, Ze = o.row, He = o.replay, je = o.blockedBoundary, Xe = o.hoistableState, at = P.children, cn = P.fallback, wn = /* @__PURE__ */ new Set();
                        P = vc(
                          i,
                          o.row,
                          wn,
                          null,
                          null
                        ), P.parentFlushed = !0, P.rootSegmentID = T, o.blockedBoundary = P, o.hoistableState = P.contentState, o.keyPath = k, o.formatContext = xn(
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
                          wn,
                          [k[0], "Suspense Fallback", k[2]],
                          kt(
                            i.resumableState,
                            o.formatContext
                          ),
                          o.context,
                          o.treeContext,
                          o.row,
                          rl(
                            o.componentStack
                          )
                        ), pl(ve), i.pingedTasks.push(ve);
                      }
                    }
                    g.splice(f, 1);
                    break e;
                  }
                }
              }
            else wc(i, o, k, T, P, V);
            return;
          case nn:
            throw Error(W(257));
          case ee:
            if (ve = f._init, f = ve(f._payload), i.status === 12) throw null;
            Xr(i, o, f, g);
            return;
        }
        if (Me(f)) {
          Sn(i, o, f, g);
          return;
        }
        if ((ve = Jn(f)) && (ve = ve.call(f))) {
          if (f = ve.next(), !f.done) {
            P = [];
            do
              P.push(f.value), f = ve.next();
            while (!f.done);
            Sn(i, o, P, g);
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
  function Sn(i, o, f, g) {
    var T = o.keyPath;
    if (g !== -1 && (o.keyPath = [o.keyPath, "Fragment", g], o.replay !== null)) {
      for (var k = o.replay, P = k.nodes, V = 0; V < P.length; V++) {
        var M = P[V];
        if (M[1] === g) {
          g = M[2], M = M[3], o.replay = { nodes: g, slots: M, pendingTasks: 1 };
          try {
            if (Sn(i, o, f, -1), o.replay.pendingTasks === 1 && 0 < o.replay.nodes.length)
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
          o.replay = k, P.splice(V, 1);
          break;
        }
      }
      o.keyPath = T;
      return;
    }
    if (k = o.treeContext, P = f.length, o.replay !== null && (V = o.replay.slots, V !== null && typeof V == "object")) {
      for (g = 0; g < P; g++)
        M = f[g], o.treeContext = Wr(k, P, g), G = V[g], typeof G == "number" ? (Tc(i, o, G, M, g), delete V[g]) : lr(i, o, M, g);
      o.treeContext = k, o.keyPath = T;
      return;
    }
    for (V = 0; V < P; V++)
      g = f[V], o.treeContext = Wr(k, P, V), lr(i, o, g, V);
    o.treeContext = k, o.keyPath = T;
  }
  function va(i, o, f) {
    if (f.status = 5, f.rootSegmentID = i.nextSegmentId++, i = f.trackedContentKeyPath, i === null) throw Error(W(486));
    var g = f.trackedFallbackNode, T = [], k = o.workingMap.get(i);
    return k === void 0 ? (f = [
      i[1],
      i[2],
      T,
      null,
      g,
      f.rootSegmentID
    ], o.workingMap.set(i, f), gt(f, i[0], o), f) : (k[4] = g, k[5] = f.rootSegmentID, k);
  }
  function Ga(i, o, f, g) {
    g.status = 5;
    var T = f.keyPath, k = f.blockedBoundary;
    if (k === null)
      g.id = i.nextSegmentId++, o.rootSlots = g.id, i.completedRootSegment !== null && (i.completedRootSegment.status = 5);
    else {
      if (k !== null && k.status === 0) {
        var P = va(
          i,
          o,
          k
        );
        if (k.trackedContentKeyPath === T && f.childIndex === -1) {
          g.id === -1 && (g.id = g.parentFlushed ? k.rootSegmentID : i.nextSegmentId++), P[3] = g.id;
          return;
        }
      }
      if (g.id === -1 && (g.id = g.parentFlushed && k !== null ? k.rootSegmentID : i.nextSegmentId++), f.childIndex === -1)
        T === null ? o.rootSlots = g.id : (f = o.workingMap.get(T), f === void 0 ? (f = [T[1], T[2], [], g.id], gt(f, T[0], o)) : f[3] = g.id);
      else {
        if (T === null) {
          if (i = o.rootSlots, i === null)
            i = o.rootSlots = {};
          else if (typeof i == "number")
            throw Error(W(491));
        } else if (k = o.workingMap, P = k.get(T), P === void 0)
          i = {}, P = [T[1], T[2], [], i], k.set(T, P), gt(P, T[0], o);
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
  function ya(i, o, f) {
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
    var g = o.blockedSegment, T = Tl(
      i,
      g.chunks.length,
      null,
      o.formatContext,
      g.lastPushedText,
      !0
    );
    return g.children.push(T), g.lastPushedText = !1, yc(
      i,
      f,
      o.node,
      o.childIndex,
      o.blockedBoundary,
      T,
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
    var T = o.formatContext, k = o.context, P = o.keyPath, V = o.treeContext, M = o.componentStack, G = o.blockedSegment;
    if (G === null) {
      G = o.replay;
      try {
        return Xr(i, o, f, g);
      } catch (ve) {
        if (Ua(), f = ve === jn ? jl() : ve, i.status !== 12 && typeof f == "object" && f !== null) {
          if (typeof f.then == "function") {
            g = ve === jn ? sa() : null, i = ya(i, o, g).ping, f.then(i, i), o.formatContext = T, o.context = k, o.keyPath = P, o.treeContext = V, o.componentStack = M, o.replay = G, Kl(k);
            return;
          }
          if (f.message === "Maximum call stack size exceeded") {
            f = ve === jn ? sa() : null, f = ya(i, o, f), i.pingedTasks.push(f), o.formatContext = T, o.context = k, o.keyPath = P, o.treeContext = V, o.componentStack = M, o.replay = G, Kl(k);
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
            G = f, f = ve === jn ? sa() : null, i = Iu(i, o, f).ping, G.then(i, i), o.formatContext = T, o.context = k, o.keyPath = P, o.treeContext = V, o.componentStack = M, Kl(k);
            return;
          }
          if (f.message === "Maximum call stack size exceeded") {
            G = ve === jn ? sa() : null, G = Iu(i, o, G), i.pingedTasks.push(G), o.formatContext = T, o.context = k, o.keyPath = P, o.treeContext = V, o.componentStack = M, Kl(k);
            return;
          }
        }
      }
    }
    throw o.formatContext = T, o.context = k, o.keyPath = P, o.treeContext = V, Kl(k), f;
  }
  function Rs(i) {
    var o = i.blockedBoundary, f = i.blockedSegment;
    f !== null && (f.status = 3, Gi(this, o, i.row, f));
  }
  function ti(i, o, f, g, T, k) {
    for (var P = 0; P < f.length; P++) {
      var V = f[P];
      if (V.length === 4)
        ti(
          i,
          o,
          V[2],
          V[3],
          T,
          k
        );
      else {
        V = V[5];
        var M = i, G = k, re = vc(
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
      if (o.status !== 4 && (o.status = 4, o.errorDigest = k, o.parentFlushed && i.clientRenderedBoundaries.push(o)), typeof g == "object") for (var $ in g) delete g[$];
    }
  }
  function is(i, o, f) {
    var g = i.blockedBoundary, T = i.blockedSegment;
    if (T !== null) {
      if (T.status === 6) return;
      T.status = 3;
    }
    var k = xl(i.componentStack);
    if (g === null) {
      if (o.status !== 13 && o.status !== 14) {
        if (g = i.replay, g === null) {
          o.trackedPostpones !== null && T !== null ? (g = o.trackedPostpones, Gn(o, f, k), Ga(o, g, i, T), Gi(o, null, i.row, T)) : (Gn(o, f, k), El(o, f));
          return;
        }
        g.pendingTasks--, g.pendingTasks === 0 && 0 < g.nodes.length && (T = Gn(o, f, k), ti(
          o,
          null,
          g.nodes,
          g.slots,
          f,
          T
        )), o.pendingRootTasks--, o.pendingRootTasks === 0 && xi(o);
      }
    } else {
      var P = o.trackedPostpones;
      if (g.status !== 4) {
        if (P !== null && T !== null)
          return Gn(o, f, k), Ga(o, P, i, T), g.fallbackAbortableTasks.forEach(function(V) {
            return is(V, o, f);
          }), g.fallbackAbortableTasks.clear(), Gi(o, g, i.row, T);
        g.status = 4, T = Gn(o, f, k), g.status = 4, g.errorDigest = T, Xa(o, g), g.parentFlushed && o.clientRenderedBoundaries.push(g);
      }
      g.pendingTasks--, T = g.row, T !== null && --T.pendingTasks === 0 && lt(o, T), g.fallbackAbortableTasks.forEach(function(V) {
        return is(V, o, f);
      }), g.fallbackAbortableTasks.clear();
    }
    i = i.row, i !== null && --i.pendingTasks === 0 && lt(o, i), o.allPendingTasks--, o.allPendingTasks === 0 && pc(o);
  }
  function Du(i, o) {
    try {
      var f = i.renderState, g = f.onHeaders;
      if (g) {
        var T = f.headers;
        if (T) {
          f.headers = null;
          var k = T.preconnects;
          if (T.fontPreloads && (k && (k += ", "), k += T.fontPreloads), T.highImagePreloads && (k && (k += ", "), k += T.highImagePreloads), !o) {
            var P = f.styles.values(), V = P.next();
            e: for (; 0 < T.remainingCapacity && !V.done; V = P.next())
              for (var M = V.value.sheets.values(), G = M.next(); 0 < T.remainingCapacity && !G.done; G = M.next()) {
                var re = G.value, $ = re.props, ve = $.href, De = re.props, on = rt(De.href, "style", {
                  crossOrigin: De.crossOrigin,
                  integrity: De.integrity,
                  nonce: De.nonce,
                  type: De.type,
                  fetchPriority: De.fetchPriority,
                  referrerPolicy: De.referrerPolicy,
                  media: De.media
                });
                if (0 <= (T.remainingCapacity -= on.length + 2))
                  f.resets.style[ve] = Ne, k && (k += ", "), k += on, f.resets.style[ve] = typeof $.crossOrigin == "string" || typeof $.integrity == "string" ? [$.crossOrigin, $.integrity] : Ne;
                else break e;
              }
          }
          g(k ? { Link: k } : {});
        }
      }
    } catch (Ze) {
      Gn(i, Ze, {});
    }
  }
  function xi(i) {
    i.trackedPostpones === null && Du(i, !0), i.trackedPostpones === null && Va(i), i.onShellError = Kt, i = i.onShellReady, i();
  }
  function pc(i) {
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
            var T = o.next;
            if (T !== null && (g = T.boundaries, g !== null))
              for (T.boundaries = null, T = 0; T < g.length; T++) {
                var k = g[T];
                va(i, f, k), Gi(i, k, null, null);
              }
          }
          --o.pendingTasks === 0 && lt(i, o);
        }
      } else
        g === null || !g.parentFlushed || g.status !== 1 && g.status !== 3 || (fr(o, g), o.completedSegments.length === 1 && o.parentFlushed && i.partialBoundaries.push(o)), o = o.row, o !== null && o.together && Jc(i, o);
    i.allPendingTasks === 0 && pc(i);
  }
  function as(i) {
    if (i.status !== 14 && i.status !== 13) {
      var o = ko, f = Y.H;
      Y.H = ls;
      var g = Y.A;
      Y.A = gc;
      var T = Dt;
      Dt = i;
      var k = fa;
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
                if (typeof M.replay.slots == "number" ? Tc(
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
                  ), $.pendingRootTasks--, $.pendingRootTasks === 0 && xi($), $.allPendingTasks--, $.allPendingTasks === 0 && pc($);
                }
              }
            }
          } else if ($ = void 0, Ze = re, Ze.status === 0) {
            Ze.status = 6, Kl(M.context);
            var cn = Ze.children.length, wn = Ze.chunks.length;
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
              Ua(), Ze.children.length = cn, Ze.chunks.length = wn;
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
                var mn = M.ping;
                _n.then(mn, mn);
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
                G.allPendingTasks === 0 && pc(G);
              }
            }
          }
        }
        P.splice(0, V), i.destination !== null && $c(i, i.destination);
      } catch (qe) {
        Gn(i, qe, {}), El(i, qe);
      } finally {
        fa = k, Y.H = f, Y.A = g, f === ls && Kl(o), Dt = T;
      }
    }
  }
  function Za(i, o, f) {
    o.preambleChildren.length && f.push(o.preambleChildren);
    for (var g = !1, T = 0; T < o.children.length; T++)
      g = qc(
        i,
        o.children[T],
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
    var T = g.contentPreamble, k = g.fallbackPreamble;
    if (T === null || k === null) return !1;
    switch (g.status) {
      case 1:
        if (ln(i.renderState, T), i.byteSize += g.byteSize, o = g.completedSegments[0], !o) throw Error(W(391));
        return Za(
          i,
          o,
          f
        );
      case 5:
        if (i.trackedPostpones !== null) return !0;
      case 4:
        if (o.status === 1)
          return ln(i.renderState, k), Za(
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
      ), T = i.renderState.preamble;
      g === !1 || T.headChunks && T.bodyChunks ? i.completedPreambleSegments = o : i.byteSize = f;
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
        var T = !0, k = f.chunks, P = 0;
        f = f.children;
        for (var V = 0; V < f.length; V++) {
          for (T = f[V]; P < T.index; P++)
            o.push(k[P]);
          T = ba(i, o, T, g);
        }
        for (; P < k.length - 1; P++)
          o.push(k[P]);
        return P < k.length && (T = o.push(k[P])), T;
      case 3:
        return !0;
      default:
        throw Error(W(390));
    }
  }
  var ir = 0;
  function ba(i, o, f, g) {
    var T = f.boundary;
    if (T === null)
      return hr(i, o, f, g);
    if (T.parentFlushed = !0, T.status === 4) {
      var k = T.row;
      return k !== null && --k.pendingTasks === 0 && lt(i, k), i.renderState.generateStaticMarkup || (T = T.errorDigest, o.push("<!--$!-->"), o.push("<template"), T && (o.push(' data-dgst="'), T = de(T), o.push(T), o.push('"')), o.push("></template>")), hr(i, o, f, g), i = i.renderState.generateStaticMarkup ? !0 : o.push("<!--/$-->"), i;
    }
    if (T.status !== 1)
      return T.status === 0 && (T.rootSegmentID = i.nextSegmentId++), 0 < T.completedSegments.length && i.partialBoundaries.push(T), an(
        o,
        i.renderState,
        T.rootSegmentID
      ), g && Ro(g, T.fallbackState), hr(i, o, f, g), o.push("<!--/$-->");
    if (!Mo && ga(i, T) && ir + T.byteSize > i.progressiveChunkSize)
      return T.rootSegmentID = i.nextSegmentId++, i.completedBoundaries.push(T), an(
        o,
        i.renderState,
        T.rootSegmentID
      ), hr(i, o, f, g), o.push("<!--/$-->");
    if (ir += T.byteSize, g && Ro(g, T.contentState), f = T.row, f !== null && ga(i, T) && --f.pendingTasks === 0 && lt(i, f), i.renderState.generateStaticMarkup || o.push("<!--$-->"), f = T.completedSegments, f.length !== 1) throw Error(W(391));
    return ba(i, o, f[0], g), i = i.renderState.generateStaticMarkup ? !0 : o.push("<!--/$-->"), i;
  }
  function qn(i, o, f, g) {
    return We(
      o,
      i.renderState,
      f.parentFormatContext,
      f.id
    ), ba(i, o, f, g), Ql(o, f.parentFormatContext);
  }
  function Hn(i, o, f) {
    ir = f.byteSize;
    for (var g = f.completedSegments, T = 0; T < g.length; T++)
      Qa(
        i,
        o,
        f,
        g[T]
      );
    g.length = 0, g = f.row, g !== null && ga(i, f) && --g.pendingTasks === 0 && lt(i, g), lc(
      o,
      f.contentState,
      i.renderState
    ), g = i.resumableState, i = i.renderState, T = f.rootSegmentID, f = f.contentState;
    var k = i.stylesToHoist;
    return i.stylesToHoist = !1, o.push(i.startInlineScript), o.push(">"), k ? ((g.instructions & 4) === 0 && (g.instructions |= 4, o.push(
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
    )), o.push('$RC("')), g = T.toString(16), o.push(i.boundaryPrefix), o.push(g), o.push('","'), o.push(i.segmentPrefix), o.push(g), k ? (o.push('",'), di(o, f)) : o.push('"'), f = o.push(")<\/script>"), Ke(o, i) && f;
  }
  function Qa(i, o, f, g) {
    if (g.status === 2) return !0;
    var T = f.contentState, k = g.id;
    if (k === -1) {
      if ((g.id = f.rootSegmentID) === -1)
        throw Error(W(392));
      return qn(i, o, g, T);
    }
    return k === f.rootSegmentID ? qn(i, o, g, T) : (qn(i, o, g, T), f = i.resumableState, i = i.renderState, o.push(i.startInlineScript), o.push(">"), (f.instructions & 1) === 0 ? (f.instructions |= 1, o.push(
      '$RS=function(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};$RS("'
    )) : o.push('$RS("'), o.push(i.segmentPrefix), k = k.toString(16), o.push(k), o.push('","'), o.push(i.placeholderPrefix), o.push(k), o = o.push('")<\/script>'), o);
  }
  var Mo = !1;
  function $c(i, o) {
    try {
      if (!(0 < i.pendingRootTasks)) {
        var f, g = i.completedRootSegment;
        if (g !== null) {
          if (g.status === 5) return;
          var T = i.completedPreambleSegments;
          if (T === null) return;
          ir = i.byteSize;
          var k = i.resumableState, P = i.renderState, V = P.preamble, M = V.htmlChunks, G = V.headChunks, re;
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
          ve.length = 0, P.preconnects.forEach(bl, o), P.preconnects.clear();
          var De = P.viewportChunks;
          for (re = 0; re < De.length; re++)
            o.push(De[re]);
          De.length = 0, P.fontPreloads.forEach(bl, o), P.fontPreloads.clear(), P.highImagePreloads.forEach(bl, o), P.highImagePreloads.clear(), me = P, P.styles.forEach(dn, o), me = null;
          var on = P.importMapChunks;
          for (re = 0; re < on.length; re++)
            o.push(on[re]);
          on.length = 0, P.bootstrapScripts.forEach(bl, o), P.scripts.forEach(bl, o), P.scripts.clear(), P.bulkPreloads.forEach(bl, o), P.bulkPreloads.clear(), k.instructions |= 32;
          var Ze = P.hoistableChunks;
          for (re = 0; re < Ze.length; re++)
            o.push(Ze[re]);
          for (k = Ze.length = 0; k < T.length; k++) {
            var He = T[k];
            for (P = 0; P < He.length; P++)
              ba(i, o, He[P], null);
          }
          var je = i.renderState.preamble, Xe = je.headChunks;
          if (je.htmlChunks || Xe) {
            var at = Fe("head");
            o.push(at);
          }
          var cn = je.bodyChunks;
          if (cn)
            for (T = 0; T < cn.length; T++)
              o.push(cn[T]);
          ba(i, o, g, null), i.completedRootSegment = null;
          var wn = i.renderState;
          if (i.allPendingTasks !== 0 || i.clientRenderedBoundaries.length !== 0 || i.completedBoundaries.length !== 0 || i.trackedPostpones !== null && (i.trackedPostpones.rootNodes.length !== 0 || i.trackedPostpones.rootSlots !== null)) {
            var _n = i.resumableState;
            if ((_n.instructions & 64) === 0) {
              if (_n.instructions |= 64, o.push(wn.startInlineScript), (_n.instructions & 32) === 0) {
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
          Ke(o, wn);
        }
        var mn = i.renderState;
        g = 0;
        var Rr = mn.viewportChunks;
        for (g = 0; g < Rr.length; g++)
          o.push(Rr[g]);
        Rr.length = 0, mn.preconnects.forEach(bl, o), mn.preconnects.clear(), mn.fontPreloads.forEach(bl, o), mn.fontPreloads.clear(), mn.highImagePreloads.forEach(
          bl,
          o
        ), mn.highImagePreloads.clear(), mn.styles.forEach(ac, o), mn.scripts.forEach(bl, o), mn.scripts.clear(), mn.bulkPreloads.forEach(bl, o), mn.bulkPreloads.clear();
        var In = mn.hoistableChunks;
        for (g = 0; g < In.length; g++)
          o.push(In[g]);
        In.length = 0;
        var En = i.clientRenderedBoundaries;
        for (f = 0; f < En.length; f++) {
          var Pn = En[f];
          mn = o;
          var qe = i.resumableState, An = i.renderState, qt = Pn.rootSegmentID, sn = Pn.errorDigest;
          mn.push(An.startInlineScript), mn.push(">"), (qe.instructions & 4) === 0 ? (qe.instructions |= 4, mn.push(
            '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};;$RX("'
          )) : mn.push('$RX("'), mn.push(An.boundaryPrefix);
          var wa = qt.toString(16);
          if (mn.push(wa), mn.push('"'), sn) {
            mn.push(",");
            var Zi = dt(
              sn || ""
            );
            mn.push(Zi);
          }
          var Cr = mn.push(")<\/script>");
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
        i.fatalError = g, f.forEach(function(T) {
          return is(T, i, g);
        }), f.clear();
      }
      i.destination !== null && $c(i, i.destination);
    } catch (T) {
      Gn(i, T, {}), El(i, T);
    }
  }
  function gt(i, o, f) {
    if (o === null) f.rootNodes.push(i);
    else {
      var g = f.workingMap, T = g.get(o);
      T === void 0 && (T = [o[1], o[2], [], null], g.set(o, T), gt(T, o[0], f)), T[2].push(i);
    }
  }
  function Xi() {
  }
  function os(i, o, f, g) {
    var T = !1, k = null, P = "", V = !1;
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
        T = !0, k = M;
      }
    }), T && k !== g) throw k;
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
  var fe = _s(), ce = yf();
  function W(l) {
    var a = "https://react.dev/errors/" + l;
    if (1 < arguments.length) {
      a += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var s = 2; s < arguments.length; s++)
        a += "&args[]=" + encodeURIComponent(arguments[s]);
    }
    return "Minified React error #" + l + "; visit " + a + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  var Se = /* @__PURE__ */ Symbol.for("react.transitional.element"), nn = /* @__PURE__ */ Symbol.for("react.portal"), be = /* @__PURE__ */ Symbol.for("react.fragment"), Oe = /* @__PURE__ */ Symbol.for("react.strict_mode"), pn = /* @__PURE__ */ Symbol.for("react.profiler"), Re = /* @__PURE__ */ Symbol.for("react.consumer"), ie = /* @__PURE__ */ Symbol.for("react.context"), Be = /* @__PURE__ */ Symbol.for("react.forward_ref"), A = /* @__PURE__ */ Symbol.for("react.suspense"), D = /* @__PURE__ */ Symbol.for("react.suspense_list"), Ae = /* @__PURE__ */ Symbol.for("react.memo"), ee = /* @__PURE__ */ Symbol.for("react.lazy"), X = /* @__PURE__ */ Symbol.for("react.scope"), ft = /* @__PURE__ */ Symbol.for("react.activity"), tr = /* @__PURE__ */ Symbol.for("react.legacy_hidden"), Yt = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), Gl = /* @__PURE__ */ Symbol.for("react.view_transition"), Br = Symbol.iterator;
  function Jn(l) {
    return l === null || typeof l != "object" ? null : (l = Br && l[Br] || l["@@iterator"], typeof l == "function" ? l : null);
  }
  var Me = Array.isArray;
  function Je(l, a) {
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
  function pr(l) {
    nt && 0 < Pe && (l.enqueue(new Uint8Array(nt.buffer, 0, Pe)), nt = null, Pe = 0);
  }
  var vl = new TextEncoder();
  function he(l) {
    return vl.encode(l);
  }
  function p(l) {
    return vl.encode(l);
  }
  function Y(l) {
    return l.byteLength;
  }
  function we(l, a) {
    typeof l.error == "function" ? l.error(a) : l.close();
  }
  var pe = Object.assign, ke = Object.prototype.hasOwnProperty, Ne = RegExp(
    "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
  ), me = {}, Rt = {};
  function Rn(l) {
    return ke.call(Rt, l) ? !0 : ke.call(me, l) ? !1 : Ne.test(l) ? Rt[l] = !0 : (me[l] = !0, !1);
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
  var kt = /([A-Z])/g, xn = /^ms-/, mt = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function Gt(l) {
    return mt.test("" + l) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : l;
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
    m: pc,
    X: Gi,
    S: fr,
    M: as
  };
  var Pt = [], $r = null;
  p('"></template>');
  var Da = p("<script"), vn = p("<\/script>"), rr = p('<script src="'), Nn = p('<script type="module" src="'), rc = p(' nonce="'), ht = p(' integrity="'), po = p(' crossorigin="'), xo = p(' async=""><\/script>'), el = p("<style"), aa = /(<\/|<)(s)(cript)/gi;
  function fi(l, a, s, v) {
    return "" + a + (s === "s" ? "\\u0073" : "\\u0053") + v;
  }
  var Zl = p(
    '<script type="importmap">'
  ), Vl = p("<\/script>");
  function yl(l, a, s, v, w, C) {
    s = typeof a == "string" ? a : a && a.script;
    var S = s === void 0 ? Da : p(
      '<script nonce="' + Ge(s) + '"'
    ), z = typeof a == "string" ? void 0 : a && a.style, O = z === void 0 ? el : p(
      '<style nonce="' + Ge(z) + '"'
    ), H = l.idPrefix, Z = [], K = l.bootstrapScriptContent, xe = l.bootstrapScripts, Te = l.bootstrapModules;
    if (K !== void 0 && (Z.push(S), va(Z, l), Z.push(
      kn,
      he(
        ("" + K).replace(aa, fi)
      ),
      vn
    )), K = [], v !== void 0 && (K.push(Zl), K.push(
      he(
        ("" + JSON.stringify(v)).replace(aa, fi)
      )
    ), K.push(Vl)), v = w ? {
      preconnects: "",
      fontPreloads: "",
      highImagePreloads: "",
      remainingCapacity: 2 + (typeof C == "number" ? C : 2e3)
    } : null, w = {
      placeholderPrefix: p(H + "P:"),
      segmentPrefix: p(H + "S:"),
      boundaryPrefix: p(H + "B:"),
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
      nonce: { script: s, style: z },
      hoistableState: null,
      stylesToHoist: !1
    }, xe !== void 0)
      for (v = 0; v < xe.length; v++)
        H = xe[v], z = S = void 0, O = {
          rel: "preload",
          as: "script",
          fetchPriority: "low",
          nonce: a
        }, typeof H == "string" ? O.href = C = H : (O.href = C = H.src, O.integrity = z = typeof H.integrity == "string" ? H.integrity : void 0, O.crossOrigin = S = typeof H == "string" || H.crossOrigin == null ? void 0 : H.crossOrigin === "use-credentials" ? "use-credentials" : ""), H = l, K = C, H.scriptResources[K] = null, H.moduleScriptResources[K] = null, H = [], rt(H, O), w.bootstrapScripts.add(H), Z.push(
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
        ), typeof S == "string" && Z.push(
          po,
          he(Ge(S)),
          Yn
        ), va(Z, l), Z.push(xo);
    if (Te !== void 0)
      for (a = 0; a < Te.length; a++)
        z = Te[a], C = v = void 0, S = {
          rel: "modulepreload",
          fetchPriority: "low",
          nonce: s
        }, typeof z == "string" ? S.href = xe = z : (S.href = xe = z.src, S.integrity = C = typeof z.integrity == "string" ? z.integrity : void 0, S.crossOrigin = v = typeof z == "string" || z.crossOrigin == null ? void 0 : z.crossOrigin === "use-credentials" ? "use-credentials" : ""), z = l, O = xe, z.scriptResources[O] = null, z.moduleScriptResources[O] = null, z = [], rt(z, S), w.bootstrapScripts.add(z), Z.push(
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
          po,
          he(Ge(v)),
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
  var We = p("<!-- -->");
  function Ql(l, a, s, v) {
    return a === "" ? v : (v && l.push(We), l.push(he(Ge(a))), !0);
  }
  var nl = /* @__PURE__ */ new Map(), dt = p(' style="'), hi = p(":"), oa = p(";");
  function La(l, a) {
    if (typeof a != "object") throw Error(W(62));
    var s = !0, v;
    for (v in a)
      if (ke.call(a, v)) {
        var w = a[v];
        if (w != null && typeof w != "boolean" && w !== "") {
          if (v.indexOf("--") === 0) {
            var C = he(Ge(v));
            w = he(
              Ge(("" + w).trim())
            );
          } else
            C = nl.get(v), C === void 0 && (C = p(
              Ge(
                v.replace(kt, "-$1").toLowerCase().replace(xn, "-ms-")
              )
            ), nl.set(v, C)), w = typeof w == "number" ? w === 0 || tt.has(v) ? he("" + w) : he(w + "px") : he(
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
  var ur = p(" "), tl = p('="'), Yn = p('"'), lc = p('=""');
  function bl(l, a, s) {
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
  var es = p(
    Ge(
      "javascript:throw new Error('React form unexpectedly submitted.')"
    )
  ), dn = p('<input type="hidden"');
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
  function di(l, a, s, v, w, C, S, z) {
    var O = null;
    if (typeof v == "function") {
      var H = oc(a, v);
      H !== null ? (z = H.name, v = H.action || "", w = H.encType, C = H.method, S = H.target, O = H.data) : (l.push(
        ur,
        he("formAction"),
        tl,
        es,
        Yn
      ), S = C = w = v = z = null, ns(a, s));
    }
    return z != null && zn(l, "name", z), v != null && zn(l, "formAction", v), w != null && zn(l, "formEncType", w), C != null && zn(l, "formMethod", C), S != null && zn(l, "formTarget", S), O;
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
        bl(l, a.toLowerCase(), s);
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
  var kn = p(">"), Jl = p("/>");
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
  var Wc = p(' selected=""'), Er = p(
    `addEventListener("submit",function(a){if(!a.defaultPrevented){var c=a.target,d=a.submitter,e=c.action,b=d;if(d){var f=d.getAttribute("formAction");null!=f&&(e=f,b=null)}"javascript:throw new Error('React form unexpectedly submitted.')"===e&&(a.preventDefault(),b?(a=document.createElement("input"),a.name=b.name,a.value=b.value,b.parentNode.insertBefore(a,b),b=new FormData(c),a.parentNode.removeChild(a)):b=new FormData(c),a=c.ownerDocument||c,(a.$$reactFormReplay=a.$$reactFormReplay||[]).push(c,d,b))}});`
  );
  function ns(l, a) {
    if ((l.instructions & 16) === 0) {
      l.instructions |= 16;
      var s = a.preamble, v = a.bootstrapChunks;
      (s.htmlChunks || s.headChunks) && v.length === 0 ? (v.push(a.startInlineScript), va(v, l), v.push(
        kn,
        Er,
        vn
      )) : v.unshift(
        a.startInlineScript,
        kn,
        Er,
        vn
      );
    }
  }
  var Su = p("<!--F!-->"), Yc = p("<!--F-->");
  function rt(l, a) {
    l.push(Zt("link"));
    for (var s in a)
      if (ke.call(a, s)) {
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
  function wl(l, a, s) {
    l.push(Zt(s));
    for (var v in a)
      if (ke.call(a, v)) {
        var w = a[v];
        if (w != null)
          switch (v) {
            case "children":
            case "dangerouslySetInnerHTML":
              throw Error(W(399, s));
            default:
              zn(l, v, w);
          }
      }
    return l.push(Jl), null;
  }
  function za(l, a) {
    l.push(Zt("title"));
    var s = null, v = null, w;
    for (w in a)
      if (ke.call(a, w)) {
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
              zn(l, w, C);
          }
      }
    return l.push(kn), a = Array.isArray(s) ? 2 > s.length ? s[0] : null : s, typeof a != "function" && typeof a != "symbol" && a !== null && a !== void 0 && l.push(he(Ge("" + a))), sr(l, v, s), l.push(yi("title")), null;
  }
  var ts = p("<!--head-->"), rs = p("<!--body-->"), Ro = p("<!--html-->");
  function Co(l, a) {
    l.push(Zt("script"));
    var s = null, v = null, w;
    for (w in a)
      if (ke.call(a, w)) {
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
              zn(l, w, C);
          }
      }
    return l.push(kn), sr(l, v, s), typeof s == "string" && l.push(
      he(("" + s).replace(aa, fi))
    ), l.push(yi("script")), null;
  }
  function gi(l, a, s) {
    l.push(Zt(s));
    var v = s = null, w;
    for (w in a)
      if (ke.call(a, w)) {
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
              zn(l, w, C);
          }
      }
    return l.push(kn), sr(l, v, s), s;
  }
  function vi(l, a, s) {
    l.push(Zt(s));
    var v = s = null, w;
    for (w in a)
      if (ke.call(a, w)) {
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
              zn(l, w, C);
          }
      }
    return l.push(kn), sr(l, v, s), typeof s == "string" ? (l.push(he(Ge(s))), null) : s;
  }
  var Xc = p(`
`), cc = /^[a-zA-Z][a-zA-Z:_\.\-\d]*$/, uc = /* @__PURE__ */ new Map();
  function Zt(l) {
    var a = uc.get(l);
    if (a === void 0) {
      if (!cc.test(l))
        throw Error(W(65, l));
      a = p("<" + l), uc.set(l, a);
    }
    return a;
  }
  var ko = p("<!DOCTYPE html>");
  function sc(l, a, s, v, w, C, S, z, O) {
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
          if (ke.call(s, K)) {
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
        if (l.push(kn), sr(l, Z, H), typeof H == "string") {
          l.push(he(Ge(H)));
          var Te = null;
        } else Te = H;
        return Te;
      case "g":
      case "p":
      case "li":
        break;
      case "select":
        l.push(Zt("select"));
        var yn = null, Ve = null, bn;
        for (bn in s)
          if (ke.call(s, bn)) {
            var bt = s[bn];
            if (bt != null)
              switch (bn) {
                case "children":
                  yn = bt;
                  break;
                case "dangerouslySetInnerHTML":
                  Ve = bt;
                  break;
                case "defaultValue":
                case "value":
                  break;
                default:
                  zn(
                    l,
                    bn,
                    bt
                  );
              }
          }
        return l.push(kn), sr(l, Ve, yn), yn;
      case "option":
        var $n = z.selectedValue;
        l.push(Zt("option"));
        var gr = null, ll = null, Il = null, Qe = null, Ar;
        for (Ar in s)
          if (ke.call(s, Ar)) {
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
        return l.push(kn), sr(l, Qe, gr), gr;
      case "textarea":
        l.push(Zt("textarea"));
        var wt = null, lo = null, Dl = null, Fr;
        for (Fr in s)
          if (ke.call(s, Fr)) {
            var ii = s[Fr];
            if (ii != null)
              switch (Fr) {
                case "children":
                  Dl = ii;
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
                  zn(
                    l,
                    Fr,
                    ii
                  );
              }
          }
        if (wt === null && lo !== null && (wt = lo), l.push(kn), Dl != null) {
          if (wt != null) throw Error(W(92));
          if (Me(Dl)) {
            if (1 < Dl.length)
              throw Error(W(93));
            wt = "" + Dl[0];
          }
          wt = "" + Dl;
        }
        return typeof wt == "string" && wt[0] === `
` && l.push(Xc), wt !== null && l.push(
          he(Ge("" + wt))
        ), null;
      case "input":
        l.push(Zt("input"));
        var Or = null, io = null, Wo = null, Qr = null, Yo = null, _r = null, ao = null, Gu = null, ot = null, Go;
        for (Go in s)
          if (ke.call(s, Go)) {
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
          w,
          io,
          Wo,
          Qr,
          Yo,
          Or
        );
        return Gu !== null ? bl(l, "checked", Gu) : ot !== null && bl(l, "checked", ot), _r !== null ? zn(l, "value", _r) : ao !== null && zn(l, "value", ao), l.push(Jl), uu?.forEach(ic, l), null;
      case "button":
        l.push(Zt("button"));
        var oo = null, su = null, fu = null, Xo = null, ma = null, hu = null, Ci = null, co;
        for (co in s)
          if (ke.call(s, co)) {
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
                  ma = uo;
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
          w,
          Xo,
          ma,
          hu,
          Ci,
          fu
        );
        if (l.push(kn), hs?.forEach(ic, l), sr(l, su, oo), typeof oo == "string") {
          l.push(
            he(Ge(oo))
          );
          var Ll = null;
        } else Ll = oo;
        return Ll;
      case "form":
        l.push(Zt("form"));
        var ds = null, Sl = null, Pa = null, qi = null, du = null, gu = null, vu;
        for (vu in s)
          if (ke.call(s, vu)) {
            var so = s[vu];
            if (so != null)
              switch (vu) {
                case "children":
                  ds = so;
                  break;
                case "dangerouslySetInnerHTML":
                  Sl = so;
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
          ), gu = du = qi = Pa = null, ns(v, w));
        }
        if (Pa != null && zn(l, "action", Pa), qi != null && zn(l, "encType", qi), du != null && zn(l, "method", du), gu != null && zn(l, "target", gu), l.push(kn), Xu !== null && (l.push(dn), Cn(l, "name", Xu), l.push(Jl), gs?.forEach(ic, l)), sr(l, Sl, ds), typeof ds == "string") {
          l.push(
            he(Ge(ds))
          );
          var vs = null;
        } else vs = ds;
        return vs;
      case "menuitem":
        l.push(Zt("menuitem"));
        for (var yu in s)
          if (ke.call(s, yu)) {
            var ks = s[yu];
            if (ks != null)
              switch (yu) {
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(W(400));
                default:
                  zn(
                    l,
                    yu,
                    ks
                  );
              }
          }
        return l.push(kn), null;
      case "object":
        l.push(Zt("object"));
        var Zu = null, Ss = null, bu;
        for (bu in s)
          if (ke.call(s, bu)) {
            var Vo = s[bu];
            if (Vo != null)
              switch (bu) {
                case "children":
                  Zu = Vo;
                  break;
                case "dangerouslySetInnerHTML":
                  Ss = Vo;
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
                    bu,
                    Vo
                  );
              }
          }
        if (l.push(kn), sr(l, Ss, Zu), typeof Zu == "string") {
          l.push(
            he(Ge(Zu))
          );
          var Is = null;
        } else Is = Zu;
        return Is;
      case "title":
        var ki = z.tagScope & 1, ys = z.tagScope & 4;
        if (z.insertionMode === 4 || ki || s.itemProp != null)
          var Ds = za(
            l,
            s
          );
        else
          ys ? Ds = null : (za(w.hoistableChunks, s), Ds = void 0);
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
            var il = w.styles.get(Nl), ea = v.styleResources.hasOwnProperty(Aa) ? v.styleResources[Aa] : void 0;
            if (ea !== null) {
              v.styleResources[Aa] = null, il || (il = {
                precedence: he(Ge(Nl)),
                rules: [],
                hrefs: [],
                sheets: /* @__PURE__ */ new Map()
              }, w.styles.set(Nl, il));
              var zt = {
                state: 0,
                props: pe({}, s, {
                  "data-precedence": s.precedence,
                  precedence: null
                })
              };
              if (ea) {
                ea.length === 2 && Za(zt.props, ea);
                var _c = w.preloads.stylesheets.get(Aa);
                _c && 0 < _c.length ? _c.length = 0 : zt.state = 1;
              }
              il.sheets.set(Aa, zt), S && S.stylesheets.add(zt);
            } else if (il) {
              var wu = il.sheets.get(Aa);
              wu && S && S.stylesheets.add(wu);
            }
            O && l.push(We), Dn = null;
          }
        else
          s.onLoad || s.onError ? Dn = rt(
            l,
            s
          ) : (O && l.push(We), Dn = $i ? null : rt(w.hoistableChunks, s));
        return Dn;
      case "script":
        var bs = z.tagScope & 1, Qo = s.async;
        if (typeof s.src != "string" || !s.src || !Qo || typeof Qo == "function" || typeof Qo == "symbol" || s.onLoad || s.onError || z.insertionMode === 4 || bs || s.itemProp != null)
          var fo = Co(
            l,
            s
          );
        else {
          var Mc = s.src;
          if (s.type === "module")
            var oi = v.moduleScriptResources, ho = w.preloads.moduleScripts;
          else
            oi = v.scriptResources, ho = w.preloads.scripts;
          var Ic = oi.hasOwnProperty(Mc) ? oi[Mc] : void 0;
          if (Ic !== null) {
            oi[Mc] = null;
            var n = s;
            if (Ic) {
              Ic.length === 2 && (n = pe({}, s), Za(n, Ic));
              var r = ho.get(Mc);
              r && (r.length = 0);
            }
            var u = [];
            w.scripts.add(u), Co(u, n);
          }
          O && l.push(We), fo = null;
        }
        return fo;
      case "style":
        var d = z.tagScope & 1, b = s.precedence, E = s.href, F = s.nonce;
        if (z.insertionMode === 4 || d || s.itemProp != null || typeof b != "string" || typeof E != "string" || E === "") {
          l.push(Zt("style"));
          var I = null, te = null, B;
          for (B in s)
            if (ke.call(s, B)) {
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
          l.push(kn);
          var ge = Array.isArray(I) ? 2 > I.length ? I[0] : null : I;
          typeof ge != "function" && typeof ge != "symbol" && ge !== null && ge !== void 0 && l.push(
            he(("" + ge).replace(Gc, Eo))
          ), sr(l, te, I), l.push(yi("style"));
          var Ce = null;
        } else {
          var ye = w.styles.get(b);
          if ((v.styleResources.hasOwnProperty(E) ? v.styleResources[E] : void 0) !== null) {
            v.styleResources[E] = null, ye || (ye = {
              precedence: he(
                Ge(b)
              ),
              rules: [],
              hrefs: [],
              sheets: /* @__PURE__ */ new Map()
            }, w.styles.set(b, ye));
            var ae = w.nonce.style;
            if (!ae || ae === F) {
              ye.hrefs.push(
                he(Ge(E))
              );
              var fn = ye.rules, Qn = null, Ye = null, Fn;
              for (Fn in s)
                if (ke.call(s, Fn)) {
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
              var yr = Array.isArray(Qn) ? 2 > Qn.length ? Qn[0] : null : Qn;
              typeof yr != "function" && typeof yr != "symbol" && yr !== null && yr !== void 0 && fn.push(
                he(
                  ("" + yr).replace(Gc, Eo)
                )
              ), sr(fn, Ye, Qn);
            }
          }
          ye && S && S.styles.add(ye), O && l.push(We), Ce = void 0;
        }
        return Ce;
      case "meta":
        var Mn = z.tagScope & 1, $t = z.tagScope & 4;
        if (z.insertionMode === 4 || Mn || s.itemProp != null)
          var Si = wl(
            l,
            s,
            "meta"
          );
        else
          O && l.push(We), Si = $t ? null : typeof s.charSet == "string" ? wl(w.charsetChunks, s, "meta") : s.name === "viewport" ? wl(w.viewportChunks, s, "meta") : wl(w.hoistableChunks, s, "meta");
        return Si;
      case "listing":
      case "pre":
        l.push(Zt(a));
        var Jr = null, _e = null, Bn;
        for (Bn in s)
          if (ke.call(s, Bn)) {
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
        if (l.push(kn), _e != null) {
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
        var Tt = z.tagScope & 3, Tn = s.src, tn = s.srcSet;
        if (!(s.loading === "lazy" || !Tn && !tn || typeof Tn != "string" && Tn != null || typeof tn != "string" && tn != null || s.fetchPriority === "low" || Tt) && (typeof Tn != "string" || Tn[4] !== ":" || Tn[0] !== "d" && Tn[0] !== "D" || Tn[1] !== "a" && Tn[1] !== "A" || Tn[2] !== "t" && Tn[2] !== "T" || Tn[3] !== "a" && Tn[3] !== "A") && (typeof tn != "string" || tn[4] !== ":" || tn[0] !== "d" && tn[0] !== "D" || tn[1] !== "a" && tn[1] !== "A" || tn[2] !== "t" && tn[2] !== "T" || tn[3] !== "a" && tn[3] !== "A")) {
          S !== null && z.tagScope & 64 && (S.suspenseyImages = !0);
          var Ir = typeof s.sizes == "string" ? s.sizes : void 0, Wn = tn ? tn + `
` + (Ir || "") : Tn, br = w.preloads.images, ct = br.get(Wn);
          if (ct)
            (s.fetchPriority === "high" || 10 > w.highImagePreloads.size) && (br.delete(Wn), w.highImagePreloads.add(ct));
          else if (!v.imageResources.hasOwnProperty(Wn)) {
            v.imageResources[Wn] = Pt;
            var al = s.crossOrigin, Jo = typeof al == "string" ? al === "use-credentials" ? al : "" : void 0, ol = w.headers, mi;
            ol && 0 < ol.remainingCapacity && typeof s.srcSet != "string" && (s.fetchPriority === "high" || 500 > ol.highImagePreloads.length) && (mi = qc(Tn, "image", {
              imageSrcSet: s.srcSet,
              imageSizes: s.sizes,
              crossOrigin: Jo,
              integrity: s.integrity,
              nonce: s.nonce,
              type: s.type,
              fetchPriority: s.fetchPriority,
              referrerPolicy: s.refererPolicy
            }), 0 <= (ol.remainingCapacity -= mi.length + 2)) ? (w.resets.image[Wn] = Pt, ol.highImagePreloads && (ol.highImagePreloads += ", "), ol.highImagePreloads += mi) : (ct = [], rt(ct, {
              rel: "preload",
              as: "image",
              href: tn ? void 0 : Tn,
              imageSrcSet: tn,
              imageSizes: Ir,
              crossOrigin: Jo,
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
        if (2 > z.insertionMode) {
          var Pi = C || w.preamble;
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
        if (z.insertionMode === 0) {
          var t = C || w.preamble;
          if (t.htmlChunks)
            throw Error(W(545, "`<html>`"));
          C !== null && l.push(Ro), t.htmlChunks = [ko];
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
            if (ke.call(s, x)) {
              var m = s[x];
              if (m != null) {
                var _ = x;
                switch (x) {
                  case "children":
                    h = m;
                    break;
                  case "dangerouslySetInnerHTML":
                    y = m;
                    break;
                  case "style":
                    La(l, m);
                    break;
                  case "suppressContentEditableWarning":
                  case "suppressHydrationWarning":
                  case "ref":
                    break;
                  case "className":
                    _ = "class";
                  default:
                    if (Rn(x) && typeof m != "function" && typeof m != "symbol" && m !== !1) {
                      if (m === !0) m = "";
                      else if (typeof m == "object") continue;
                      l.push(
                        ur,
                        he(_),
                        tl,
                        he(Ge(m)),
                        Yn
                      );
                    }
                }
              }
            }
          return l.push(kn), sr(l, y, h), h;
        }
    }
    return vi(l, s, a);
  }
  var Zc = /* @__PURE__ */ new Map();
  function yi(l) {
    var a = Zc.get(l);
    return a === void 0 && (a = p("</" + l + ">"), Zc.set(l, a)), a;
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
  var Kl = p(
    "requestAnimationFrame(function(){$RT=performance.now()});"
  ), mu = p('<template id="'), hc = p('"></template>'), Wr = p("<!--&-->"), dc = p("<!--/&-->"), ca = p("<!--$-->"), So = p(
    '<!--$?--><template id="'
  ), Yr = p('"></template>'), Kt = p("<!--$!-->"), jn = p("<!--/$-->"), Pu = p("<template"), Di = p('"'), jl = p(' data-dgst="');
  p(' data-msg="'), p(' data-stck="'), p(' data-cstck="');
  var Au = p("></template>");
  function Li(l, a, s) {
    if (Q(l, So), s === null) throw Error(W(395));
    return Q(l, a.boundaryPrefix), Q(l, he(s.toString(16))), de(l, Yr);
  }
  var bi = p('<div hidden id="'), mo = p('">'), Ni = p("</div>"), zi = p(
    '<svg aria-hidden="true" style="display:none" id="'
  ), Po = p('">'), $e = p("</svg>"), ql = p(
    '<math aria-hidden="true" style="display:none" id="'
  ), Mt = p('">'), wi = p("</math>"), Vt = p('<table hidden id="'), ua = p('">'), Ha = p("</table>"), Ti = p('<table hidden><tbody id="'), Hi = p('">'), It = p("</tbody></table>"), Bi = p('<table hidden><tr id="'), Ui = p('">'), Ba = p("</tr></table>"), sa = p(
    '<table hidden><colgroup id="'
  ), Ua = p('">'), Gr = p("</colgroup></table>");
  function Wa(l, a, s, v) {
    switch (s.insertionMode) {
      case 0:
      case 1:
      case 3:
      case 2:
        return Q(l, bi), Q(l, a.segmentPrefix), Q(l, he(v.toString(16))), de(l, mo);
      case 4:
        return Q(l, zi), Q(l, a.segmentPrefix), Q(l, he(v.toString(16))), de(l, Po);
      case 5:
        return Q(l, ql), Q(l, a.segmentPrefix), Q(l, he(v.toString(16))), de(l, Mt);
      case 6:
        return Q(l, Vt), Q(l, a.segmentPrefix), Q(l, he(v.toString(16))), de(l, ua);
      case 7:
        return Q(l, Ti), Q(l, a.segmentPrefix), Q(l, he(v.toString(16))), de(l, Hi);
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
        return de(l, wi);
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
  var Fu = p(
    '$RS=function(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};$RS("'
  ), Ou = p('$RS("'), _u = p('","'), Ao = p('")<\/script>');
  p('<template data-rsi="" data-sid="'), p('" data-pid="');
  var Fo = p(
    `$RB=[];$RV=function(a){$RT=performance.now();for(var b=0;b<a.length;b+=2){var c=a[b],e=a[b+1];null!==e.parentNode&&e.parentNode.removeChild(e);var f=c.parentNode;if(f){var g=c.previousSibling,h=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d||"/&"===d)if(0===h)break;else h--;else"$"!==d&&"$?"!==d&&"$~"!==d&&"$!"!==d&&"&"!==d||h++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;e.firstChild;)f.insertBefore(e.firstChild,c);g.data="$";g._reactRetry&&requestAnimationFrame(g._reactRetry)}}a.length=0};
$RC=function(a,b){if(b=document.getElementById(b))(a=document.getElementById(a))?(a.previousSibling.data="$~",$RB.push(a,b),2===$RB.length&&("number"!==typeof $RT?requestAnimationFrame($RV.bind(null,$RB)):(a=performance.now(),setTimeout($RV.bind(null,$RB),2300>a&&2E3<a?2300-a:$RT+300-a)))):b.parentNode.removeChild(b)};`
  );
  he(
    `$RV=function(A,g){function k(a,b){var e=a.getAttribute(b);e&&(b=a.style,l.push(a,b.viewTransitionName,b.viewTransitionClass),"auto"!==e&&(b.viewTransitionClass=e),(a=a.getAttribute("vt-name"))||(a="_T_"+K++ +"_"),b.viewTransitionName=a,B=!0)}var B=!1,K=0,l=[];try{var f=document.__reactViewTransition;if(f){f.finished.finally($RV.bind(null,g));return}var m=new Map;for(f=1;f<g.length;f+=2)for(var h=g[f].querySelectorAll("[vt-share]"),d=0;d<h.length;d++){var c=h[d];m.set(c.getAttribute("vt-name"),c)}var u=[];for(h=0;h<g.length;h+=2){var C=g[h],x=C.parentNode;if(x){var v=x.getBoundingClientRect();if(v.left||v.top||v.width||v.height){c=C;for(f=0;c;){if(8===c.nodeType){var r=c.data;if("/$"===r)if(0===f)break;else f--;else"$"!==r&&"$?"!==r&&"$~"!==r&&"$!"!==r||f++}else if(1===c.nodeType){d=c;var D=d.getAttribute("vt-name"),y=m.get(D);k(d,y?"vt-share":"vt-exit");y&&(k(y,"vt-share"),m.set(D,null));var E=d.querySelectorAll("[vt-share]");for(d=0;d<E.length;d++){var F=E[d],G=F.getAttribute("vt-name"),
H=m.get(G);H&&(k(F,"vt-share"),k(H,"vt-share"),m.set(G,null))}}c=c.nextSibling}for(var I=g[h+1],t=I.firstElementChild;t;)null!==m.get(t.getAttribute("vt-name"))&&k(t,"vt-enter"),t=t.nextElementSibling;c=x;do for(var n=c.firstElementChild;n;){var J=n.getAttribute("vt-update");J&&"none"!==J&&!l.includes(n)&&k(n,"vt-update");n=n.nextElementSibling}while((c=c.parentNode)&&1===c.nodeType&&"none"!==c.getAttribute("vt-update"));u.push.apply(u,I.querySelectorAll('img[src]:not([loading="lazy"])'))}}}if(B){var z=
document.__reactViewTransition=document.startViewTransition({update:function(){A(g);for(var a=[document.documentElement.clientHeight,document.fonts.ready],b={},e=0;e<u.length;b={g:b.g},e++)if(b.g=u[e],!b.g.complete){var p=b.g.getBoundingClientRect();0<p.bottom&&0<p.right&&p.top<window.innerHeight&&p.left<window.innerWidth&&(p=new Promise(function(w){return function(q){w.g.addEventListener("load",q);w.g.addEventListener("error",q)}}(b)),a.push(p))}return Promise.race([Promise.all(a),new Promise(function(w){var q=
performance.now();setTimeout(w,2300>q&&2E3<q?2300-q:500)})])},types:[]});z.ready.finally(function(){for(var a=l.length-3;0<=a;a-=3){var b=l[a],e=b.style;e.viewTransitionName=l[a+1];e.viewTransitionClass=l[a+1];""===b.getAttribute("style")&&b.removeAttribute("style")}});z.finished.finally(function(){document.__reactViewTransition===z&&(document.__reactViewTransition=null)});$RB=[];return}}catch(a){}A(g)}.bind(null,$RV);`
  );
  var Oo = p('$RC("'), jt = p(
    `$RM=new Map;$RR=function(n,w,p){function u(q){this._p=null;q()}for(var r=new Map,t=document,h,b,e=t.querySelectorAll("link[data-precedence],style[data-precedence]"),v=[],k=0;b=e[k++];)"not all"===b.getAttribute("media")?v.push(b):("LINK"===b.tagName&&$RM.set(b.getAttribute("href"),b),r.set(b.dataset.precedence,h=b));e=0;b=[];var l,a;for(k=!0;;){if(k){var f=p[e++];if(!f){k=!1;e=0;continue}var c=!1,m=0;var d=f[m++];if(a=$RM.get(d)){var g=a._p;c=!0}else{a=t.createElement("link");a.href=d;a.rel=
"stylesheet";for(a.dataset.precedence=l=f[m++];g=f[m++];)a.setAttribute(g,f[m++]);g=a._p=new Promise(function(q,x){a.onload=u.bind(a,q);a.onerror=u.bind(a,x)});$RM.set(d,a)}d=a.getAttribute("media");!g||d&&!matchMedia(d).matches||b.push(g);if(c)continue}else{a=v[e++];if(!a)break;l=a.getAttribute("data-precedence");a.removeAttribute("media")}c=r.get(l)||h;c===h&&(h=a);r.set(l,a);c?c.parentNode.insertBefore(a,c.nextSibling):(c=t.head,c.insertBefore(a,c.firstChild))}if(p=document.getElementById(n))p.previousSibling.data=
"$~";Promise.all(b).then($RC.bind(null,n,w),$RX.bind(null,n,"CSS failed to load"))};$RR("`
  ), ls = p('$RR("'), fa = p('","'), gc = p('",'), Vc = p('"'), Wi = p(")<\/script>");
  p('<template data-rci="" data-bid="'), p('<template data-rri="" data-bid="'), p('" data-sid="'), p('" data-sty="');
  var ha = p(
    '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};'
  ), _o = p(
    '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};;$RX("'
  ), ei = p('$RX("'), da = p('"'), ga = p(","), Mu = p(")<\/script>");
  p('<template data-rxi="" data-bid="'), p('" data-dgst="'), p('" data-msg="'), p('" data-stck="'), p('" data-cstck="');
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
  function pi(l) {
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
  var vc = p(
    ' media="not all" data-precedence="'
  ), yc = p('" data-href="'), Qc = p('">'), Tl = p("</style>"), pl = !1, rl = !0;
  function xl(l) {
    var a = l.rules, s = l.hrefs, v = 0;
    if (s.length) {
      for (Q(this, $r.startInlineStyle), Q(this, vc), Q(this, l.precedence), Q(this, yc); v < s.length - 1; v++)
        Q(this, s[v]), Q(this, bc);
      for (Q(this, s[v]), Q(this, Qc), v = 0; v < a.length; v++) Q(this, a[v]);
      rl = de(
        this,
        Tl
      ), pl = !0, a.length = 0, s.length = 0;
    }
  }
  function Gn(l) {
    return l.state !== 2 ? pl = !0 : !1;
  }
  function El(l, a, s) {
    return pl = !1, rl = !0, $r = s, a.styles.forEach(xl, l), $r = null, a.stylesheets.forEach(Gn), pl && (s.stylesToHoist = !0), rl;
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
  var Kc = p(' data-precedence="'), jc = p('" data-href="'), bc = p(" "), Yi = p('">'), wc = p("</style>");
  function Tc(l) {
    var a = 0 < l.sheets.size;
    l.sheets.forEach(Jc, this), l.sheets.clear();
    var s = l.rules, v = l.hrefs;
    if (!a || v.length) {
      if (Q(this, $r.startInlineStyle), Q(this, Kc), Q(this, l.precedence), l = 0, v.length) {
        for (Q(this, jc); l < v.length - 1; l++)
          Q(this, v[l]), Q(this, bc);
        Q(this, v[l]);
      }
      for (Q(this, Yi), l = 0; l < s.length; l++)
        Q(this, s[l]);
      Q(this, wc), s.length = 0, v.length = 0;
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
  p('<link rel="expect" href="#'), p('" blocking="render"/>');
  var Sn = p(' id="');
  function va(l, a) {
    (a.instructions & 32) === 0 && (a.instructions |= 32, l.push(
      Sn,
      he(Ge("_" + a.idPrefix + "R_")),
      Yn
    ));
  }
  var Ga = p("["), Xa = p(",["), ya = p(","), Iu = p("]");
  function lr(l, a) {
    Q(l, Ga);
    var s = Ga;
    a.stylesheets.forEach(function(v) {
      if (v.state !== 2)
        if (v.state === 3)
          Q(l, s), Q(
            l,
            he(
              pi("" + v.props.href)
            )
          ), Q(l, Iu), s = Xa;
        else {
          Q(l, s);
          var w = v.props["data-precedence"], C = v.props, S = Gt("" + v.props.href);
          Q(
            l,
            he(pi(S))
          ), w = "" + w, Q(l, ya), Q(
            l,
            he(pi(w))
          );
          for (var z in C)
            if (ke.call(C, z) && (w = C[z], w != null))
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
                    w
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
    Q(l, ya), Q(
      l,
      he(pi(v))
    ), Q(l, ya), Q(
      l,
      he(pi(a))
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
            Va,
            hr
          ) + ">; rel=dns-prefetch", 0 <= (s.remainingCapacity -= w.length + 2))), C ? (v.resets.dns[l] = null, s.preconnects && (s.preconnects += ", "), s.preconnects += w) : (w = [], rt(w, { href: l, rel: "dns-prefetch" }), v.preconnects.add(w));
        }
        Sa(a);
      }
    } else xr.D(l);
  }
  function Du(l, a) {
    var s = un || null;
    if (s) {
      var v = s.resumableState, w = s.renderState;
      if (typeof l == "string" && l) {
        var C = a === "use-credentials" ? "credentials" : typeof a == "string" ? "anonymous" : "default";
        if (!v.connectResources[C].hasOwnProperty(l)) {
          v.connectResources[C][l] = null, v = w.headers;
          var S, z;
          if (z = v && 0 < v.remainingCapacity) {
            if (z = "<" + ("" + l).replace(
              Va,
              hr
            ) + ">; rel=preconnect", typeof a == "string") {
              var O = ("" + a).replace(
                ir,
                ba
              );
              z += '; crossorigin="' + O + '"';
            }
            z = (S = z, 0 <= (v.remainingCapacity -= S.length + 2));
          }
          z ? (w.resets.connect[C][l] = null, v.preconnects && (v.preconnects += ", "), v.preconnects += S) : (C = [], rt(C, {
            rel: "preconnect",
            href: l,
            crossOrigin: a
          }), w.preconnects.add(C));
        }
        Sa(s);
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
              var S = s.imageSrcSet, z = s.imageSizes, O = s.fetchPriority;
            var H = S ? S + `
` + (z || "") : l;
            if (w.imageResources.hasOwnProperty(H)) return;
            w.imageResources[H] = Pt, w = C.headers;
            var Z;
            w && 0 < w.remainingCapacity && typeof S != "string" && O === "high" && (Z = qc(l, a, s), 0 <= (w.remainingCapacity -= Z.length + 2)) ? (C.resets.image[H] = Pt, w.highImagePreloads && (w.highImagePreloads += ", "), w.highImagePreloads += Z) : (w = [], rt(
              w,
              pe(
                { rel: "preload", href: S ? void 0 : l, as: a },
                s
              )
            ), O === "high" ? C.highImagePreloads.add(w) : (C.bulkPreloads.add(w), C.preloads.images.set(H, w)));
            break;
          case "style":
            if (w.styleResources.hasOwnProperty(l)) return;
            S = [], rt(
              S,
              pe({ rel: "preload", href: l, as: a }, s)
            ), w.styleResources[l] = !s || typeof s.crossOrigin != "string" && typeof s.integrity != "string" ? Pt : [s.crossOrigin, s.integrity], C.preloads.stylesheets.set(l, S), C.bulkPreloads.add(S);
            break;
          case "script":
            if (w.scriptResources.hasOwnProperty(l)) return;
            S = [], C.preloads.scripts.set(l, S), C.bulkPreloads.add(S), rt(
              S,
              pe({ rel: "preload", href: l, as: a }, s)
            ), w.scriptResources[l] = !s || typeof s.crossOrigin != "string" && typeof s.integrity != "string" ? Pt : [s.crossOrigin, s.integrity];
            break;
          default:
            if (w.unknownResources.hasOwnProperty(a)) {
              if (S = w.unknownResources[a], S.hasOwnProperty(l))
                return;
            } else
              S = {}, w.unknownResources[a] = S;
            S[l] = Pt, (w = C.headers) && 0 < w.remainingCapacity && a === "font" && (H = qc(l, a, s), 0 <= (w.remainingCapacity -= H.length + 2)) ? (C.resets.font[l] = Pt, w.fontPreloads && (w.fontPreloads += ", "), w.fontPreloads += H) : (w = [], l = pe({ rel: "preload", href: l, as: a }, s), rt(w, l), a) === "font" ? C.fontPreloads.add(w) : C.bulkPreloads.add(w);
        }
        Sa(v);
      }
    } else xr.L(l, a, s);
  }
  function pc(l, a) {
    var s = un || null;
    if (s) {
      var v = s.resumableState, w = s.renderState;
      if (l) {
        var C = a && typeof a.as == "string" ? a.as : "script";
        switch (C) {
          case "script":
            if (v.moduleScriptResources.hasOwnProperty(l)) return;
            C = [], v.moduleScriptResources[l] = !a || typeof a.crossOrigin != "string" && typeof a.integrity != "string" ? Pt : [a.crossOrigin, a.integrity], w.preloads.moduleScripts.set(l, C);
            break;
          default:
            if (v.moduleUnknownResources.hasOwnProperty(C)) {
              var S = v.unknownResources[C];
              if (S.hasOwnProperty(l)) return;
            } else
              S = {}, v.moduleUnknownResources[C] = S;
            C = [], S[l] = Pt;
        }
        rt(C, pe({ rel: "modulepreload", href: l }, a)), w.bulkPreloads.add(C), Sa(s);
      }
    } else xr.m(l, a);
  }
  function fr(l, a, s) {
    var v = un || null;
    if (v) {
      var w = v.resumableState, C = v.renderState;
      if (l) {
        a = a || "default";
        var S = C.styles.get(a), z = w.styleResources.hasOwnProperty(l) ? w.styleResources[l] : void 0;
        z !== null && (w.styleResources[l] = null, S || (S = {
          precedence: he(Ge(a)),
          rules: [],
          hrefs: [],
          sheets: /* @__PURE__ */ new Map()
        }, C.styles.set(a, S)), a = {
          state: 0,
          props: pe(
            { rel: "stylesheet", href: l, "data-precedence": a },
            s
          )
        }, z && (z.length === 2 && Za(a.props, z), (C = C.preloads.stylesheets.get(l)) && 0 < C.length ? C.length = 0 : a.state = 1), S.sheets.set(l, a), Sa(v));
      }
    } else xr.S(l, a, s);
  }
  function Gi(l, a) {
    var s = un || null;
    if (s) {
      var v = s.resumableState, w = s.renderState;
      if (l) {
        var C = v.scriptResources.hasOwnProperty(l) ? v.scriptResources[l] : void 0;
        C !== null && (v.scriptResources[l] = null, a = pe({ src: l, async: !0 }, a), C && (C.length === 2 && Za(a, C), l = w.preloads.scripts.get(l)) && (l.length = 0), l = [], w.scripts.add(l), Co(l, a), Sa(s));
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
        C !== null && (v.moduleScriptResources[l] = null, a = pe({ src: l, type: "module", async: !0 }, a), C && (C.length === 2 && Za(a, C), l = w.preloads.moduleScripts.get(l)) && (l.length = 0), l = [], w.scripts.add(l), Co(l, a), Sa(s));
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
      ba
    ), a = "<" + l + '>; rel=preload; as="' + a + '"';
    for (var v in s)
      ke.call(s, v) && (l = s[v], typeof l == "string" && (a += "; " + v.toLowerCase() + '="' + ("" + l).replace(
        ir,
        ba
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
      case be:
        return "Fragment";
      case pn:
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
  var T = {
    enqueueSetState: function(l, a) {
      l = l._reactInternals, l.queue !== null && l.queue.push(a);
    },
    enqueueReplaceState: function(l, a) {
      l = l._reactInternals, l.replace = !0, l.queue = [a];
    },
    enqueueForceUpdate: function() {
    }
  }, k = { id: 1, overflow: "" };
  function P(l, a, s) {
    var v = l.id;
    l = l.overflow;
    var w = 32 - V(v) - 1;
    v &= ~(1 << w), s += 1;
    var C = 32 - V(a) + w;
    if (30 < C) {
      var S = w - w % 5;
      return C = (v & (1 << S) - 1).toString(32), v >>= S, w -= S, {
        id: 1 << 32 - V(a) + w | s << w | v,
        overflow: C + l
      };
    }
    return {
      id: 1 << C | s << w | v,
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
  function He(l, a) {
    return l === a && (l !== 0 || 1 / l === 1 / a) || l !== l && a !== a;
  }
  var je = typeof Object.is == "function" ? Object.is : He, Xe = null, at = null, cn = null, wn = null, _n = null, en = null, vt = !1, mn = !1, Rr = 0, In = 0, En = -1, Pn = 0, qe = null, An = null, qt = 0;
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
    return en === null ? _n === null ? (vt = !1, _n = en = wa()) : (vt = !0, en = _n) : en.next === null ? (vt = !1, en = en.next = wa()) : (vt = !0, en = en.next), en;
  }
  function Cr() {
    var l = qe;
    return qe = null, l;
  }
  function Pl() {
    wn = cn = at = Xe = null, mn = !1, _n = null, qt = 0, en = An = null;
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
  function Vi(l, a, s) {
    if (25 <= qt) throw Error(W(301));
    if (l === Xe)
      if (mn = !0, l = { action: s, next: null }, An === null && (An = /* @__PURE__ */ new Map()), s = An.get(a), s === void 0)
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
    var v = In++, w = cn;
    if (typeof l.$$FORM_ACTION == "function") {
      var C = null, S = wn;
      w = w.formState;
      var z = l.$$IS_SIGNATURE_EQUAL;
      if (w !== null && typeof z == "function") {
        var O = w[1];
        z.call(l, w[2], w[3]) && (C = s !== void 0 ? "p" + s : "k" + Je(
          JSON.stringify([S, null, v]),
          0
        ), O === C && (En = v, a = w[0]));
      }
      var H = l.bind(null, a);
      return l = function(K) {
        H(K);
      }, typeof H.$$FORM_ACTION == "function" && (l.$$FORM_ACTION = function(K) {
        K = H.$$FORM_ACTION(K), s !== void 0 && (s += "", K.action = s);
        var xe = K.data;
        return xe && (C === null && (C = s !== void 0 ? "p" + s : "k" + Je(
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
    var a = Pn;
    return Pn += 1, qe === null && (qe = []), De(qe, l, a);
  }
  function Do() {
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
      var s = kr;
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
  }, kr = null, Ec = {
    getCacheForType: function() {
      throw Error(W(248));
    },
    cacheSignal: function() {
      throw Error(W(248));
    }
  }, Sr, Rl;
  function Qi(l) {
    if (Sr === void 0)
      try {
        throw Error();
      } catch (s) {
        var a = s.stack.trim().match(/\n( *(at )?)/);
        Sr = a && a[1] || "", Rl = -1 < s.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < s.stack.indexOf("@") ? "@unknown:0:0" : "";
      }
    return `
` + Sr + l + Rl;
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
                } catch (Te) {
                  var xe = Te;
                }
                Reflect.construct(l, [], K);
              } else {
                try {
                  K.call();
                } catch (Te) {
                  xe = Te;
                }
                l.call(K.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (Te) {
                xe = Te;
              }
              (K = l()) && typeof K.catch == "function" && K.catch(function() {
              });
            }
          } catch (Te) {
            if (Te && xe && typeof Te.stack == "string")
              return [Te.stack, xe.stack];
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
      var C = v.DetermineComponentFrameRoot(), S = C[0], z = C[1];
      if (S && z) {
        var O = S.split(`
`), H = z.split(`
`);
        for (w = v = 0; v < O.length && !O[v].includes("DetermineComponentFrameRoot"); )
          v++;
        for (; w < H.length && !H[w].includes(
          "DetermineComponentFrameRoot"
        ); )
          w++;
        if (v === O.length || w === H.length)
          for (v = O.length - 1, w = H.length - 1; 1 <= v && 0 <= w && O[v] !== H[w]; )
            w--;
        for (; 1 <= v && 0 <= w; v--, w--)
          if (O[v] !== H[w]) {
            if (v !== 1 || w !== 1)
              do
                if (v--, w--, 0 > w || O[v] !== H[w]) {
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
  function pa(l, a, s, v, w, C, S, z, O, H, Z) {
    var K = /* @__PURE__ */ new Set();
    this.destination = null, this.flushScheduled = !1, this.resumableState = l, this.renderState = a, this.rootFormatContext = s, this.progressiveChunkSize = v === void 0 ? 12800 : v, this.status = 10, this.fatalError = null, this.pendingRootTasks = this.allPendingTasks = this.nextSegmentId = 0, this.completedPreambleSegments = this.completedRootSegment = null, this.byteSize = 0, this.abortableTasks = K, this.pingedTasks = [], this.clientRenderedBoundaries = [], this.completedBoundaries = [], this.partialBoundaries = [], this.trackedPostpones = null, this.onError = w === void 0 ? Cc : w, this.onPostpone = H === void 0 ? $ : H, this.onAllReady = C === void 0 ? $ : C, this.onShellReady = S === void 0 ? $ : S, this.onShellError = z === void 0 ? $ : z, this.onFatalError = O === void 0 ? $ : O, this.formState = Z === void 0 ? null : Z;
  }
  function Lo(l, a, s, v, w, C, S, z, O, H, Z, K) {
    return a = new pa(
      a,
      s,
      v,
      w,
      C,
      S,
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
      k,
      null,
      null
    ), Ea(l), a.pingedTasks.push(l), a;
  }
  function ja(l, a, s, v, w, C, S, z, O, H, Z) {
    return l = Lo(
      l,
      a,
      s,
      v,
      w,
      C,
      S,
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
  function Ot(l, a, s, v, w, C, S, z, O) {
    return s = new pa(
      a.resumableState,
      s,
      a.rootFormatContext,
      a.progressiveChunkSize,
      v,
      w,
      C,
      S,
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
      k,
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
      k,
      null,
      null
    ), Ea(l), s.pingedTasks.push(l), s);
  }
  function Cl(l, a, s, v, w, C, S, z, O) {
    return l = Ot(
      l,
      a,
      s,
      v,
      w,
      C,
      S,
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
  function No(l, a, s, v, w) {
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
    }, a !== null && (a.pendingTasks++, v = a.boundaries, v !== null && (l.allPendingTasks++, s.pendingTasks++, v.push(s)), l = a.inheritedHoistables, l !== null && Qa(s.contentState, l)), s;
  }
  function xa(l, a, s, v, w, C, S, z, O, H, Z, K, xe, Te, yn) {
    l.allPendingTasks++, w === null ? l.pendingRootTasks++ : w.pendingTasks++, Te !== null && Te.pendingTasks++;
    var Ve = {
      replay: null,
      node: s,
      childIndex: v,
      ping: function() {
        return Ki(l, Ve);
      },
      blockedBoundary: w,
      blockedSegment: C,
      blockedPreamble: S,
      hoistableState: z,
      abortSet: O,
      keyPath: H,
      formatContext: Z,
      context: K,
      treeContext: xe,
      row: Te,
      componentStack: yn,
      thenableState: a
    };
    return O.add(Ve), Ve;
  }
  function yt(l, a, s, v, w, C, S, z, O, H, Z, K, xe, Te) {
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
      abortSet: z,
      keyPath: O,
      formatContext: H,
      context: Z,
      treeContext: K,
      row: xe,
      componentStack: Te,
      thenableState: a
    };
    return z.add(yn), yn;
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
    typeof a == "object" && a !== null && a.$$typeof === Se && (l.componentStack = { parent: l.componentStack, type: a.type });
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
  function zo(l, a) {
    var s = l.onShellError, v = l.onFatalError;
    s(a), v(a), l.destination !== null ? (l.status = 14, we(l.destination, a)) : (l.status = 13, l.fatalError = a);
  }
  function mr(l, a) {
    Nu(l, a.next, a.hoistables);
  }
  function Nu(l, a, s) {
    for (; a !== null; ) {
      s !== null && (Qa(a.hoistables, s), a.inheritedHoistables = s);
      var v = a.boundaries;
      if (v !== null) {
        a.boundaries = null;
        for (var w = 0; w < v.length; w++) {
          var C = v[w];
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
      for (var v = !0, w = 0; w < s.length; w++) {
        var C = s[w];
        if (C.pendingTasks !== 1 || C.parentFlushed || Lt(l, C)) {
          v = !1;
          break;
        }
      }
      v && Nu(l, a, a.hoistables);
    }
  }
  function kc(l) {
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
    var C = a.keyPath, S = a.treeContext, z = a.row;
    a.keyPath = s, s = v.length;
    var O = null;
    if (a.replay !== null) {
      var H = a.replay.slots;
      if (H !== null && typeof H == "object")
        for (var Z = 0; Z < s; Z++) {
          var K = w !== "backwards" && w !== "unstable_legacy-backwards" ? Z : s - 1 - Z, xe = v[K];
          a.row = O = kc(
            O
          ), a.treeContext = P(S, s, K);
          var Te = H[K];
          typeof Te == "number" ? (no(l, a, Te, xe, K), delete H[K]) : Nt(l, a, xe, K), --O.pendingTasks === 0 && mr(l, O);
        }
      else
        for (H = 0; H < s; H++)
          Z = w !== "backwards" && w !== "unstable_legacy-backwards" ? H : s - 1 - H, K = v[Z], a.row = O = kc(O), a.treeContext = P(S, s, Z), Nt(l, a, K, Z), --O.pendingTasks === 0 && mr(l, O);
    } else if (w !== "backwards" && w !== "unstable_legacy-backwards")
      for (w = 0; w < s; w++)
        H = v[w], a.row = O = kc(O), a.treeContext = P(
          S,
          s,
          w
        ), Nt(l, a, H, w), --O.pendingTasks === 0 && mr(l, O);
    else {
      for (w = a.blockedSegment, H = w.children.length, Z = w.chunks.length, K = s - 1; 0 <= K; K--) {
        xe = v[K], a.row = O = kc(
          O
        ), a.treeContext = P(S, s, K), Te = Zr(
          l,
          Z,
          null,
          a.formatContext,
          K === 0 ? w.lastPushedText : !0,
          !0
        ), w.children.splice(H, 0, Te), a.blockedSegment = Te;
        try {
          Nt(l, a, xe, K), Te.lastPushedText && Te.textEmbedded && Te.chunks.push(We), Te.status = 1, Ra(l, a.blockedBoundary, Te), --O.pendingTasks === 0 && mr(l, O);
        } catch (yn) {
          throw Te.status = l.status === 12 ? 3 : 4, yn;
        }
      }
      a.blockedSegment = w, w.lastPushedText = !1;
    }
    z !== null && O !== null && 0 < O.pendingTasks && (z.pendingTasks++, O.next = z), a.treeContext = S, a.row = z, a.keyPath = C;
  }
  function ru(l, a, s, v, w, C) {
    var S = a.thenableState;
    for (a.thenableState = null, Xe = {}, at = a, cn = l, wn = s, In = Rr = 0, En = -1, Pn = 0, qe = S, l = v(w, C); mn; )
      mn = !1, In = Rr = 0, En = -1, Pn = 0, qt += 1, en = null, l = v(w, C);
    return Pl(), l;
  }
  function Ri(l, a, s, v, w, C, S) {
    var z = !1;
    if (C !== 0 && l.formState !== null) {
      var O = a.blockedSegment;
      if (O !== null) {
        z = !0, O = O.chunks;
        for (var H = 0; H < C; H++)
          H === S ? O.push(Su) : O.push(Yc);
      }
    }
    C = a.keyPath, a.keyPath = s, w ? (s = a.treeContext, a.treeContext = P(s, 1, 0), Nt(l, a, v, -1), a.treeContext = s) : z ? Nt(l, a, v, -1) : Pr(l, a, v, -1), a.keyPath = C;
  }
  function eo(l, a, s, v, w, C) {
    if (typeof v == "function")
      if (v.prototype && v.prototype.isReactComponent) {
        var S = w;
        if ("ref" in w) {
          S = {};
          for (var z in w)
            z !== "ref" && (S[z] = w[z]);
        }
        var O = v.defaultProps;
        if (O) {
          S === w && (S = pe({}, S, w));
          for (var H in O)
            S[H] === void 0 && (S[H] = O[H]);
        }
        w = S, S = Cs, O = v.contextType, typeof O == "object" && O !== null && (S = O._currentValue), S = new v(w, S);
        var Z = S.state !== void 0 ? S.state : null;
        if (S.updater = T, S.props = w, S.state = Z, O = { queue: [], replace: !1 }, S._reactInternals = O, C = v.contextType, S.context = typeof C == "object" && C !== null ? C._currentValue : Cs, C = v.getDerivedStateFromProps, typeof C == "function" && (C = C(w, Z), Z = C == null ? Z : pe({}, Z, C), S.state = Z), typeof v.getDerivedStateFromProps != "function" && typeof S.getSnapshotBeforeUpdate != "function" && (typeof S.UNSAFE_componentWillMount == "function" || typeof S.componentWillMount == "function"))
          if (v = S.state, typeof S.componentWillMount == "function" && S.componentWillMount(), typeof S.UNSAFE_componentWillMount == "function" && S.UNSAFE_componentWillMount(), v !== S.state && T.enqueueReplaceState(
            S,
            S.state,
            null
          ), O.queue !== null && 0 < O.queue.length)
            if (v = O.queue, C = O.replace, O.queue = null, O.replace = !1, C && v.length === 1)
              S.state = v[0];
            else {
              for (O = C ? v[0] : S.state, Z = !0, C = C ? 1 : 0; C < v.length; C++)
                H = v[C], H = typeof H == "function" ? H.call(S, O, w, void 0) : H, H != null && (Z ? (Z = !1, O = pe({}, O, H)) : pe(O, H));
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
          Rr !== 0,
          In,
          En
        );
      }
    else if (typeof v == "string")
      if (S = a.blockedSegment, S === null)
        S = w.children, O = a.formatContext, Z = a.keyPath, a.formatContext = Fe(O, v, w), a.keyPath = s, Nt(l, a, S, -1), a.formatContext = O, a.keyPath = Z;
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
        ), S.lastPushedText = !1, O = a.formatContext, C = a.keyPath, a.keyPath = s, (a.formatContext = Fe(O, v, w)).insertionMode === 3) {
          s = Zr(
            l,
            0,
            null,
            a.formatContext,
            !1,
            !1
          ), S.preambleChildren.push(s), a.blockedSegment = s;
          try {
            s.status = 6, Nt(l, a, Z, -1), s.lastPushedText && s.textEmbedded && s.chunks.push(We), s.status = 1, Ra(l, a.blockedBoundary, s);
          } finally {
            a.blockedSegment = S;
          }
        } else Nt(l, a, Z, -1);
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
        case tr:
        case Oe:
        case pn:
        case be:
          v = a.keyPath, a.keyPath = s, Pr(l, a, w.children, -1), a.keyPath = v;
          return;
        case ft:
          v = a.blockedSegment, v === null ? w.mode !== "hidden" && (v = a.keyPath, a.keyPath = s, Nt(l, a, w.children, -1), a.keyPath = v) : w.mode !== "hidden" && (v.chunks.push(Wr), v.lastPushedText = !1, S = a.keyPath, a.keyPath = s, Nt(l, a, w.children, -1), a.keyPath = S, v.chunks.push(dc), v.lastPushedText = !1);
          return;
        case D:
          e: {
            if (v = w.children, w = w.revealOrder, w === "forwards" || w === "backwards" || w === "unstable_legacy-backwards") {
              if (Me(v)) {
                tu(l, a, s, v, w);
                break e;
              }
              if ((S = Jn(v)) && (S = S.call(v))) {
                if (O = S.next(), !O.done) {
                  do
                    O = S.next();
                  while (!O.done);
                  tu(l, a, s, v, w);
                }
                break e;
              }
            }
            w === "together" ? (w = a.keyPath, S = a.row, O = a.row = kc(null), O.boundaries = [], O.together = !0, a.keyPath = s, Pr(l, a, v, -1), --O.pendingTasks === 0 && mr(l, O), a.keyPath = w, a.row = S, S !== null && 0 < O.pendingTasks && (S.pendingTasks++, O.next = S)) : (w = a.keyPath, a.keyPath = s, Pr(l, a, v, -1), a.keyPath = w);
          }
          return;
        case Gl:
        case X:
          throw Error(W(343));
        case A:
          e: if (a.replay !== null) {
            v = a.keyPath, S = a.formatContext, O = a.row, a.keyPath = s, a.formatContext = an(
              l.resumableState,
              S
            ), a.row = null, s = w.children;
            try {
              Nt(l, a, s, -1);
            } finally {
              a.keyPath = v, a.formatContext = S, a.row = O;
            }
          } else {
            v = a.keyPath, C = a.formatContext;
            var K = a.row;
            H = a.blockedBoundary, z = a.blockedPreamble;
            var xe = a.hoistableState, Te = a.blockedSegment, yn = w.fallback;
            w = w.children;
            var Ve = /* @__PURE__ */ new Set(), bn = 2 > a.formatContext.insertionMode ? No(
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
            l.trackedPostpones !== null && (bn.trackedContentKeyPath = s);
            var bt = Zr(
              l,
              Te.chunks.length,
              bn,
              a.formatContext,
              !1,
              !1
            );
            Te.children.push(bt), Te.lastPushedText = !1;
            var $n = Zr(
              l,
              0,
              null,
              a.formatContext,
              !1,
              !1
            );
            if ($n.parentFlushed = !0, l.trackedPostpones !== null) {
              S = a.componentStack, O = [s[0], "Suspense Fallback", s[2]], Z = [O[1], O[2], [], null], l.trackedPostpones.workingMap.set(O, Z), bn.trackedFallbackNode = Z, a.blockedSegment = bt, a.blockedPreamble = bn.fallbackPreamble, a.keyPath = O, a.formatContext = Ke(
                l.resumableState,
                C
              ), a.componentStack = qa(S), bt.status = 6;
              try {
                Nt(l, a, yn, -1), bt.lastPushedText && bt.textEmbedded && bt.chunks.push(We), bt.status = 1, Ra(l, H, bt);
              } catch (gr) {
                throw bt.status = l.status === 12 ? 3 : 4, gr;
              } finally {
                a.blockedSegment = Te, a.blockedPreamble = z, a.keyPath = v, a.formatContext = C;
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
                S
              ), Ea(a), l.pingedTasks.push(a);
            } else {
              a.blockedBoundary = bn, a.blockedPreamble = bn.contentPreamble, a.hoistableState = bn.contentState, a.blockedSegment = $n, a.keyPath = s, a.formatContext = an(
                l.resumableState,
                C
              ), a.row = null, $n.status = 6;
              try {
                if (Nt(l, a, w, -1), $n.lastPushedText && $n.textEmbedded && $n.chunks.push(We), $n.status = 1, Ra(l, bn, $n), cu(bn, $n), bn.pendingTasks === 0 && bn.status === 0) {
                  if (bn.status = 1, !Lt(l, bn)) {
                    K !== null && --K.pendingTasks === 0 && mr(l, K), l.pendingRootTasks === 0 && a.blockedPreamble && ri(l);
                    break e;
                  }
                } else
                  K !== null && K.together && $a(l, K);
              } catch (gr) {
                bn.status = 4, l.status === 12 ? ($n.status = 3, S = l.fatalError) : ($n.status = 4, S = gr), O = Ol(a.componentStack), Z = dr(
                  l,
                  S,
                  O
                ), bn.errorDigest = Z, lu(l, bn);
              } finally {
                a.blockedBoundary = H, a.blockedPreamble = z, a.hoistableState = xe, a.blockedSegment = Te, a.keyPath = v, a.formatContext = C, a.row = K;
              }
              a = xa(
                l,
                null,
                yn,
                -1,
                H,
                bt,
                bn.fallbackPreamble,
                bn.fallbackState,
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
            if ("ref" in w)
              for (Te in S = {}, w)
                Te !== "ref" && (S[Te] = w[Te]);
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
              Rr !== 0,
              In,
              En
            );
            return;
          case Ae:
            eo(l, a, s, v.type, w, C);
            return;
          case ie:
            if (O = w.children, S = a.keyPath, w = w.value, Z = v._currentValue, v._currentValue = w, C = gt, gt = v = {
              parent: C,
              depth: C === null ? 0 : C.depth + 1,
              context: v,
              parentValue: Z,
              value: w
            }, a.context = v, a.keyPath = s, Pr(l, a, O, -1), l = gt, l === null) throw Error(W(403));
            l.context._currentValue = l.parentValue, l = gt = l.parent, a.context = l, a.keyPath = S;
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
    var C = a.replay, S = a.blockedBoundary, z = Zr(
      l,
      0,
      null,
      a.formatContext,
      !1,
      !1
    );
    z.id = s, z.parentFlushed = !0;
    try {
      a.replay = null, a.blockedSegment = z, Nt(l, a, v, w), z.status = 1, Ra(l, S, z), S === null ? l.completedRootSegment = z : (cu(S, z), S.parentFlushed && l.partialBoundaries.push(S));
    } finally {
      a.replay = C, a.blockedSegment = null;
    }
  }
  function Pr(l, a, s, v) {
    a.replay !== null && typeof a.replay.slots == "number" ? no(l, a, a.replay.slots, s, v) : (a.node = s, a.childIndex = v, s = a.componentStack, Ea(a), Sc(l, a), a.componentStack = s);
  }
  function Sc(l, a) {
    var s = a.node, v = a.childIndex;
    if (s !== null) {
      if (typeof s == "object") {
        switch (s.$$typeof) {
          case Se:
            var w = s.type, C = s.key, S = s.props;
            s = S.ref;
            var z = s !== void 0 ? s : null, O = Lu(w), H = C ?? (v === -1 ? 0 : v);
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
                        if (eo(l, a, C, w, S, z), a.replay.pendingTasks === 1 && 0 < a.replay.nodes.length)
                          throw Error(W(488));
                        a.replay.pendingTasks--;
                      } catch (Qe) {
                        if (typeof Qe == "object" && Qe !== null && (Qe === ve || typeof Qe.then == "function"))
                          throw a.node === H ? a.replay = Z : v.splice(s, 1), Qe;
                        a.replay.pendingTasks--, S = Ol(a.componentStack), C = l, l = a.blockedBoundary, w = Qe, S = dr(C, w, S), Pc(
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
                      if (w !== A)
                        throw Error(
                          W(
                            490,
                            "Suspense",
                            Lu(w) || "Unknown"
                          )
                        );
                      n: {
                        Z = void 0, w = K[5], z = K[2], O = K[3], H = K[4] === null ? [] : K[4][2], K = K[4] === null ? null : K[4][3];
                        var Te = a.keyPath, yn = a.formatContext, Ve = a.row, bn = a.replay, bt = a.blockedBoundary, $n = a.hoistableState, gr = S.children, ll = S.fallback, Il = /* @__PURE__ */ new Set();
                        S = 2 > a.formatContext.insertionMode ? No(
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
                        ), S.parentFlushed = !0, S.rootSegmentID = w, a.blockedBoundary = S, a.hoistableState = S.contentState, a.keyPath = C, a.formatContext = an(
                          l.resumableState,
                          yn
                        ), a.row = null, a.replay = {
                          nodes: z,
                          slots: O,
                          pendingTasks: 1
                        };
                        try {
                          if (Nt(l, a, gr, -1), a.replay.pendingTasks === 1 && 0 < a.replay.nodes.length)
                            throw Error(W(488));
                          if (a.replay.pendingTasks--, S.pendingTasks === 0 && S.status === 0) {
                            S.status = 1, l.completedBoundaries.push(S);
                            break n;
                          }
                        } catch (Qe) {
                          S.status = 4, xe = Ol(a.componentStack), Z = dr(
                            l,
                            Qe,
                            xe
                          ), S.errorDigest = Z, a.replay.pendingTasks--, l.clientRenderedBoundaries.push(S);
                        } finally {
                          a.blockedBoundary = bt, a.hoistableState = $n, a.replay = bn, a.keyPath = Te, a.formatContext = yn, a.row = Ve;
                        }
                        xe = yt(
                          l,
                          null,
                          {
                            nodes: H,
                            slots: K,
                            pendingTasks: 0
                          },
                          ll,
                          -1,
                          bt,
                          S.fallbackState,
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
            else eo(l, a, C, w, S, z);
            return;
          case nn:
            throw Error(W(257));
          case ee:
            if (xe = s._init, s = xe(s._payload), l.status === 12) throw null;
            Pr(l, a, s, v);
            return;
        }
        if (Me(s)) {
          mc(l, a, s, v);
          return;
        }
        if ((xe = Jn(s)) && (xe = xe.call(s))) {
          if (s = xe.next(), !s.done) {
            S = [];
            do
              S.push(s.value), s = xe.next();
            while (!s.done);
            mc(l, a, S, v);
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
  function mc(l, a, s, v) {
    var w = a.keyPath;
    if (v !== -1 && (a.keyPath = [a.keyPath, "Fragment", v], a.replay !== null)) {
      for (var C = a.replay, S = C.nodes, z = 0; z < S.length; z++) {
        var O = S[z];
        if (O[1] === v) {
          v = O[2], O = O[3], a.replay = { nodes: v, slots: O, pendingTasks: 1 };
          try {
            if (mc(l, a, s, -1), a.replay.pendingTasks === 1 && 0 < a.replay.nodes.length)
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
          a.replay = C, S.splice(z, 1);
          break;
        }
      }
      a.keyPath = w;
      return;
    }
    if (C = a.treeContext, S = s.length, a.replay !== null && (z = a.replay.slots, z !== null && typeof z == "object")) {
      for (v = 0; v < S; v++)
        O = s[v], a.treeContext = P(C, S, v), H = z[v], typeof H == "number" ? (no(l, a, H, O, v), delete z[v]) : Nt(l, a, O, v);
      a.treeContext = C, a.keyPath = w;
      return;
    }
    for (z = 0; z < S; z++)
      v = s[z], a.treeContext = P(C, S, z), Nt(l, a, v, z);
    a.treeContext = C, a.keyPath = w;
  }
  function zu(l, a, s) {
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
  function Hu(l, a, s, v) {
    v.status = 5;
    var w = s.keyPath, C = s.blockedBoundary;
    if (C === null)
      v.id = l.nextSegmentId++, a.rootSlots = v.id, l.completedRootSegment !== null && (l.completedRootSegment.status = 5);
    else {
      if (C !== null && C.status === 0) {
        var S = zu(
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
  function Bu(l, a, s) {
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
  function Nt(l, a, s, v) {
    var w = a.formatContext, C = a.context, S = a.keyPath, z = a.treeContext, O = a.componentStack, H = a.blockedSegment;
    if (H === null) {
      H = a.replay;
      try {
        return Pr(l, a, s, v);
      } catch (xe) {
        if (Pl(), s = xe === ve ? Ze() : xe, l.status !== 12 && typeof s == "object" && s !== null) {
          if (typeof s.then == "function") {
            v = xe === ve ? Cr() : null, l = Bu(l, a, v).ping, s.then(l, l), a.formatContext = w, a.context = C, a.keyPath = S, a.treeContext = z, a.componentStack = O, a.replay = H, g(C);
            return;
          }
          if (s.message === "Maximum call stack size exceeded") {
            s = xe === ve ? Cr() : null, s = Bu(l, a, s), l.pingedTasks.push(s), a.formatContext = w, a.context = C, a.keyPath = S, a.treeContext = z, a.componentStack = O, a.replay = H, g(C);
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
            H = s, s = xe === ve ? Cr() : null, l = Uu(l, a, s).ping, H.then(l, l), a.formatContext = w, a.context = C, a.keyPath = S, a.treeContext = z, a.componentStack = O, g(C);
            return;
          }
          if (s.message === "Maximum call stack size exceeded") {
            H = xe === ve ? Cr() : null, H = Uu(l, a, H), l.pingedTasks.push(H), a.formatContext = w, a.context = C, a.keyPath = S, a.treeContext = z, a.componentStack = O, g(C);
            return;
          }
        }
      }
    }
    throw a.formatContext = w, a.context = C, a.keyPath = S, a.treeContext = z, g(C), s;
  }
  function iu(l) {
    var a = l.blockedBoundary, s = l.blockedSegment;
    s !== null && (s.status = 3, _l(this, a, l.row, s));
  }
  function Pc(l, a, s, v, w, C) {
    for (var S = 0; S < s.length; S++) {
      var z = s[S];
      if (z.length === 4)
        Pc(
          l,
          a,
          z[2],
          z[3],
          w,
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
    var v = l.blockedBoundary, w = l.blockedSegment;
    if (w !== null) {
      if (w.status === 6) return;
      w.status = 3;
    }
    var C = Ol(l.componentStack);
    if (v === null) {
      if (a.status !== 13 && a.status !== 14) {
        if (v = l.replay, v === null) {
          a.trackedPostpones !== null && w !== null ? (v = a.trackedPostpones, dr(a, s, C), Hu(a, v, l, w), _l(a, null, l.row, w)) : (dr(a, s, C), zo(a, s));
          return;
        }
        v.pendingTasks--, v.pendingTasks === 0 && 0 < v.nodes.length && (w = dr(a, s, C), Pc(
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
          return dr(a, s, C), Hu(a, S, l, w), v.fallbackAbortableTasks.forEach(function(z) {
            return Ac(z, a, s);
          }), v.fallbackAbortableTasks.clear(), _l(a, v, l.row, w);
        v.status = 4, w = dr(a, s, C), v.status = 4, v.errorDigest = w, lu(a, v), v.parentFlushed && a.clientRenderedBoundaries.push(v);
      }
      v.pendingTasks--, w = v.row, w !== null && --w.pendingTasks === 0 && mr(a, w), v.fallbackAbortableTasks.forEach(function(z) {
        return Ac(z, a, s);
      }), v.fallbackAbortableTasks.clear();
    }
    l = l.row, l !== null && --l.pendingTasks === 0 && mr(a, l), a.allPendingTasks--, a.allPendingTasks === 0 && ou(a);
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
            var S = s.styles.values(), z = S.next();
            e: for (; 0 < w.remainingCapacity && !z.done; z = S.next())
              for (var O = z.value.sheets.values(), H = O.next(); 0 < w.remainingCapacity && !H.done; H = O.next()) {
                var Z = H.value, K = Z.props, xe = K.href, Te = Z.props, yn = qc(Te.href, "style", {
                  crossOrigin: Te.crossOrigin,
                  integrity: Te.integrity,
                  nonce: Te.nonce,
                  type: Te.type,
                  fetchPriority: Te.fetchPriority,
                  referrerPolicy: Te.referrerPolicy,
                  media: Te.media
                });
                if (0 <= (w.remainingCapacity -= yn.length + 2))
                  s.resets.style[xe] = Pt, C && (C += ", "), C += yn, s.resets.style[xe] = typeof K.crossOrigin == "string" || typeof K.integrity == "string" ? [K.crossOrigin, K.integrity] : Pt;
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
      for (var v = 0, w = 0; w < s.length; w++)
        v += s[w].byteLength;
      a === null ? l.byteSize += v : a.byteSize += v;
    }
  }
  function _l(l, a, s, v) {
    if (s !== null && (--s.pendingTasks === 0 ? mr(l, s) : s.together && $a(l, s)), l.allPendingTasks--, a === null) {
      if (v !== null && v.parentFlushed) {
        if (l.completedRootSegment !== null)
          throw Error(W(389));
        l.completedRootSegment = v;
      }
      l.pendingRootTasks--, l.pendingRootTasks === 0 && Wu(l);
    } else if (a.pendingTasks--, a.status !== 4)
      if (a.pendingTasks === 0) {
        if (a.status === 0 && (a.status = 1), v !== null && v.parentFlushed && (v.status === 1 || v.status === 3) && cu(a, v), a.parentFlushed && l.completedBoundaries.push(a), a.status === 1)
          s = a.row, s !== null && Qa(s.hoistables, a.contentState), Lt(l, a) || (a.fallbackAbortableTasks.forEach(iu, l), a.fallbackAbortableTasks.clear(), s !== null && --s.pendingTasks === 0 && mr(l, s)), l.pendingRootTasks === 0 && l.trackedPostpones === null && a.contentPreamble !== null && ri(l);
        else if (a.status === 5 && (a = a.row, a !== null)) {
          if (l.trackedPostpones !== null) {
            s = l.trackedPostpones;
            var w = a.next;
            if (w !== null && (v = w.boundaries, v !== null))
              for (w.boundaries = null, w = 0; w < v.length; w++) {
                var C = v[w];
                zu(l, s, C), _l(l, C, null, null);
              }
          }
          --a.pendingTasks === 0 && mr(l, a);
        }
      } else
        v === null || !v.parentFlushed || v.status !== 1 && v.status !== 3 || (cu(a, v), a.completedSegments.length === 1 && a.parentFlushed && l.partialBoundaries.push(a)), a = a.row, a !== null && a.together && $a(l, a);
    l.allPendingTasks === 0 && ou(l);
  }
  function cs(l) {
    if (l.status !== 14 && l.status !== 13) {
      var a = gt, s = Xl.H;
      Xl.H = Ta;
      var v = Xl.A;
      Xl.A = Ec;
      var w = un;
      un = l;
      var C = kr;
      kr = l.resumableState;
      try {
        var S = l.pingedTasks, z;
        for (z = 0; z < S.length; z++) {
          var O = S[z], H = l, Z = O.blockedSegment;
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
                ) : Sc(K, O), O.replay.pendingTasks === 1 && 0 < O.replay.nodes.length)
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
                  var Te = O.ping;
                  xe.then(Te, Te), O.thenableState = Fr === ve ? Cr() : null;
                } else {
                  O.replay.pendingTasks--, O.abortSet.delete(O);
                  var yn = Ol(O.componentStack);
                  H = void 0;
                  var Ve = K, bn = O.blockedBoundary, bt = K.status === 12 ? K.fatalError : xe, $n = O.replay.nodes, gr = O.replay.slots;
                  H = dr(
                    Ve,
                    bt,
                    yn
                  ), Pc(
                    Ve,
                    bn,
                    $n,
                    gr,
                    bt,
                    H
                  ), K.pendingRootTasks--, K.pendingRootTasks === 0 && Wu(K), K.allPendingTasks--, K.allPendingTasks === 0 && ou(K);
                }
              }
            }
          } else if (K = void 0, Ve = Z, Ve.status === 0) {
            Ve.status = 6, g(O.context);
            var ll = Ve.children.length, Il = Ve.chunks.length;
            try {
              Sc(H, O), Ve.lastPushedText && Ve.textEmbedded && Ve.chunks.push(We), O.abortSet.delete(O), Ve.status = 1, Ra(H, O.blockedBoundary, Ve), _l(
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
                var wt = O.blockedBoundary, lo = O.row;
                if (lo !== null && --lo.pendingTasks === 0 && mr(H, lo), H.allPendingTasks--, K = dr(
                  H,
                  Qe,
                  ji
                ), wt === null) zo(H, Qe);
                else if (wt.pendingTasks--, wt.status !== 4) {
                  wt.status = 4, wt.errorDigest = K, lu(H, wt);
                  var Dl = wt.row;
                  Dl !== null && --Dl.pendingTasks === 0 && mr(H, Dl), wt.parentFlushed && H.clientRenderedBoundaries.push(wt), H.pendingRootTasks === 0 && H.trackedPostpones === null && wt.contentPreamble !== null && ri(H);
                }
                H.allPendingTasks === 0 && ou(H);
              }
            }
          }
        }
        S.splice(0, z), l.destination !== null && Bo(l, l.destination);
      } catch (Fr) {
        dr(l, Fr, {}), zo(l, Fr);
      } finally {
        kr = C, Xl.H = s, Xl.A = v, s === Ta && g(a), un = w;
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
        return v = s.id, s.lastPushedText = !1, s.textEmbedded = !1, l = l.renderState, Q(a, mu), Q(a, l.placeholderPrefix), l = he(v.toString(16)), Q(a, l), de(a, hc);
      case 1:
        s.status = 2;
        var w = !0, C = s.chunks, S = 0;
        s = s.children;
        for (var z = 0; z < s.length; z++) {
          for (w = s[z]; S < w.index; S++)
            Q(a, C[S]);
          w = Oc(l, a, w, v);
        }
        for (; S < C.length - 1; S++)
          Q(a, C[S]);
        return S < C.length && (w = de(a, C[S])), w;
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
      return Ho(l, a, s, v);
    if (w.parentFlushed = !0, w.status === 4) {
      var C = w.row;
      C !== null && --C.pendingTasks === 0 && mr(l, C), w = w.errorDigest, de(a, Kt), Q(a, Pu), w && (Q(a, jl), Q(a, he(Ge(w))), Q(
        a,
        Di
      )), de(a, Au), Ho(l, a, s, v);
    } else if (w.status !== 1)
      w.status === 0 && (w.rootSegmentID = l.nextSegmentId++), 0 < w.completedSegments.length && l.partialBoundaries.push(w), Li(
        a,
        l.renderState,
        w.rootSegmentID
      ), v && Qa(v, w.fallbackState), Ho(l, a, s, v);
    else if (!li && Lt(l, w) && (Ca + w.byteSize > l.progressiveChunkSize || Mo(w.contentState)))
      w.rootSegmentID = l.nextSegmentId++, l.completedBoundaries.push(w), Li(
        a,
        l.renderState,
        w.rootSegmentID
      ), Ho(l, a, s, v);
    else {
      if (Ca += w.byteSize, v && Qa(v, w.contentState), s = w.row, s !== null && Lt(l, w) && --s.pendingTasks === 0 && mr(l, s), de(a, ca), s = w.completedSegments, s.length !== 1) throw Error(W(391));
      Oc(l, a, s[0], v);
    }
    return de(a, jn);
  }
  function ka(l, a, s, v) {
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
    v.length = 0, v = s.row, v !== null && Lt(l, s) && --v.pendingTasks === 0 && mr(l, v), El(
      a,
      s.contentState,
      l.renderState
    ), v = l.resumableState, l = l.renderState, w = s.rootSegmentID, s = s.contentState;
    var C = l.stylesToHoist;
    return l.stylesToHoist = !1, Q(a, l.startInlineScript), Q(a, kn), C ? ((v.instructions & 4) === 0 && (v.instructions |= 4, Q(a, ha)), (v.instructions & 2) === 0 && (v.instructions |= 2, Q(a, Fo)), (v.instructions & 8) === 0 ? (v.instructions |= 8, Q(a, jt)) : Q(a, ls)) : ((v.instructions & 2) === 0 && (v.instructions |= 2, Q(a, Fo)), Q(a, Oo)), v = he(w.toString(16)), Q(a, l.boundaryPrefix), Q(a, v), Q(a, fa), Q(a, l.segmentPrefix), Q(a, v), C ? (Q(a, gc), lr(a, s)) : Q(a, Vc), s = de(a, Wi), Ur(a, l) && s;
  }
  function ss(l, a, s, v) {
    if (v.status === 2) return !0;
    var w = s.contentState, C = v.id;
    if (C === -1) {
      if ((v.id = s.rootSegmentID) === -1)
        throw Error(W(392));
      return ka(l, a, v, w);
    }
    return C === s.rootSegmentID ? ka(l, a, v, w) : (ka(l, a, v, w), s = l.resumableState, l = l.renderState, Q(a, l.startInlineScript), Q(a, kn), (s.instructions & 1) === 0 ? (s.instructions |= 1, Q(a, Fu)) : Q(a, Ou), Q(a, l.segmentPrefix), C = he(C.toString(16)), Q(a, C), Q(a, _u), Q(a, l.placeholderPrefix), Q(a, C), a = de(a, Ao), a);
  }
  var li = !1;
  function Bo(l, a) {
    nt = new Uint8Array(2048), Pe = 0;
    try {
      if (!(0 < l.pendingRootTasks)) {
        var s, v = l.completedRootSegment;
        if (v !== null) {
          if (v.status === 5) return;
          var w = l.completedPreambleSegments;
          if (w === null) return;
          Ca = l.byteSize;
          var C = l.resumableState, S = l.renderState, z = S.preamble, O = z.htmlChunks, H = z.headChunks, Z;
          if (O) {
            for (Z = 0; Z < O.length; Z++)
              Q(a, O[Z]);
            if (H)
              for (Z = 0; Z < H.length; Z++)
                Q(a, H[Z]);
            else
              Q(a, Zt("head")), Q(a, kn);
          } else if (H)
            for (Z = 0; Z < H.length; Z++)
              Q(a, H[Z]);
          var K = S.charsetChunks;
          for (Z = 0; Z < K.length; Z++)
            Q(a, K[Z]);
          K.length = 0, S.preconnects.forEach(lt, a), S.preconnects.clear();
          var xe = S.viewportChunks;
          for (Z = 0; Z < xe.length; Z++)
            Q(a, xe[Z]);
          xe.length = 0, S.fontPreloads.forEach(lt, a), S.fontPreloads.clear(), S.highImagePreloads.forEach(lt, a), S.highImagePreloads.clear(), $r = S, S.styles.forEach(Tc, a), $r = null;
          var Te = S.importMapChunks;
          for (Z = 0; Z < Te.length; Z++)
            Q(a, Te[Z]);
          Te.length = 0, S.bootstrapScripts.forEach(lt, a), S.scripts.forEach(lt, a), S.scripts.clear(), S.bulkPreloads.forEach(lt, a), S.bulkPreloads.clear(), O || H || (C.instructions |= 32);
          var yn = S.hoistableChunks;
          for (Z = 0; Z < yn.length; Z++)
            Q(a, yn[Z]);
          for (C = yn.length = 0; C < w.length; C++) {
            var Ve = w[C];
            for (S = 0; S < Ve.length; S++)
              Oc(l, a, Ve[S], null);
          }
          var bn = l.renderState.preamble, bt = bn.headChunks;
          (bn.htmlChunks || bt) && Q(a, yi("head"));
          var $n = bn.bodyChunks;
          if ($n)
            for (w = 0; w < $n.length; w++)
              Q(a, $n[w]);
          Oc(l, a, v, null), l.completedRootSegment = null;
          var gr = l.renderState;
          if (l.allPendingTasks !== 0 || l.clientRenderedBoundaries.length !== 0 || l.completedBoundaries.length !== 0 || l.trackedPostpones !== null && (l.trackedPostpones.rootNodes.length !== 0 || l.trackedPostpones.rootSlots !== null)) {
            var ll = l.resumableState;
            if ((ll.instructions & 64) === 0) {
              if (ll.instructions |= 64, Q(a, gr.startInlineScript), (ll.instructions & 32) === 0) {
                ll.instructions |= 32;
                var Il = "_" + ll.idPrefix + "R_";
                Q(a, Sn), Q(
                  a,
                  he(Ge(Il))
                ), Q(a, Yn);
              }
              Q(a, kn), Q(a, Kl), de(a, vn);
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
          var wt = l.resumableState, lo = l.renderState, Dl = ji.rootSegmentID, Fr = ji.errorDigest;
          Q(
            Qe,
            lo.startInlineScript
          ), Q(Qe, kn), (wt.instructions & 4) === 0 ? (wt.instructions |= 4, Q(Qe, _o)) : Q(Qe, ei), Q(Qe, lo.boundaryPrefix), Q(Qe, he(Dl.toString(16))), Q(Qe, da), Fr && (Q(
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
        Or.splice(0, s), pr(a), nt = new Uint8Array(2048), Pe = 0, li = !0;
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
      li = !1, l.allPendingTasks === 0 && l.clientRenderedBoundaries.length === 0 && l.completedBoundaries.length === 0 ? (l.flushScheduled = !1, s = l.resumableState, s.hasBody && Q(a, yi("body")), s.hasHtml && Q(a, yi("html")), pr(a), l.status = 14, a.close(), l.destination = null) : pr(a);
    }
  }
  function kl(l) {
    l.flushScheduled = l.destination !== null, qr(function() {
      return cs(l);
    }), Kn(function() {
      l.status === 10 && (l.status = 11), l.trackedPostpones === null && au(l, l.pendingRootTasks === 0);
    });
  }
  function Sa(l) {
    l.flushScheduled === !1 && l.pingedTasks.length === 0 && l.destination !== null && (l.flushScheduled = !0, Kn(function() {
      var a = l.destination;
      a ? Bo(l, a) : l.flushScheduled = !1;
    }));
  }
  function ro(l, a) {
    if (l.status === 13)
      l.status = 14, we(a, l.fatalError);
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
        l.fatalError = v, s.forEach(function(w) {
          return Ac(w, l, v);
        }), s.clear();
      }
      l.destination !== null && Bo(l, l.destination);
    } catch (w) {
      dr(l, w, {}), zo(l, w);
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
      ), z = ja(
        l,
        S,
        yl(
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
      kl(z);
    });
  }, Ys.renderToReadableStream = function(l, a) {
    return new Promise(function(s, v) {
      var w, C, S = new Promise(function(Te, yn) {
        C = Te, w = yn;
      }), z = a ? a.onHeaders : void 0, O;
      z && (O = function(Te) {
        z(new Headers(Te));
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
        yl(
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
          var Te = new ReadableStream(
            {
              type: "bytes",
              pull: function(yn) {
                ro(Z, yn);
              },
              cancel: function(yn) {
                Z.destination = null, Ml(Z, yn);
              }
            },
            { highWaterMark: 0 }
          );
          Te.allReady = S, s(Te);
        },
        function(Te) {
          S.catch(function() {
          }), v(Te);
        },
        w,
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
      kl(Z);
    });
  }, Ys.resume = function(l, a, s) {
    return new Promise(function(v, w) {
      var C, S, z = new Promise(function(K, xe) {
        S = K, C = xe;
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
        S,
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
          }), w(K);
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
      kl(O);
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
        w,
        s ? s.onPostpone : void 0
      );
      if (s && s.signal) {
        var S = s.signal;
        if (S.aborted) Ml(C, S.reason);
        else {
          var z = function() {
            Ml(C, S.reason), S.removeEventListener("abort", z);
          };
          S.addEventListener("abort", z);
        }
      }
      kl(C);
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
      return n === null || typeof n != "object" ? null : (n = bc && n[bc] || n["@@iterator"], typeof n == "function" ? n : null);
    }
    function Se(n) {
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
          return Yi(n) ? "[...]" : n !== null && n.$$typeof === Xr ? "client" : (n = Se(n), n === "Object" ? "{...}" : n);
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
          case pl:
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
    function pn(n, r) {
      var u = Se(n);
      if (u !== "Object" && u !== "Array") return u;
      var d = -1, b = 0;
      if (Yi(n))
        if (Tc.has(n)) {
          var E = Tc.get(n);
          u = "<" + Oe(E) + ">";
          for (var F = 0; F < n.length; F++) {
            var I = n[F];
            I = typeof I == "string" ? I : typeof I == "object" && I !== null ? "{" + pn(I) + "}" : "{" + be(I) + "}", "" + F === r ? (d = u.length, b = I.length, u += I) : u = 15 > I.length && 40 > u.length + I.length ? u + I : u + "{...}";
          }
          u += "</" + Oe(E) + ">";
        } else {
          for (u = "[", E = 0; E < n.length; E++)
            0 < E && (u += ", "), F = n[E], F = typeof F == "object" && F !== null ? pn(F) : be(F), "" + E === r ? (d = u.length, b = F.length, u += F) : u = 10 > F.length && 40 > u.length + F.length ? u + F : u + "...";
          u += "]";
        }
      else if (n.$$typeof === Ya)
        u = "<" + Oe(n.type) + "/>";
      else {
        if (n.$$typeof === Xr) return "client";
        if (wc.has(n)) {
          for (u = wc.get(n), u = "<" + (Oe(u) || "..."), E = Object.keys(n), F = 0; F < E.length; F++) {
            u += " ", I = E[F], u += nn(I) + "=";
            var te = n[I], B = I === r && typeof te == "object" && te !== null ? pn(te) : be(te);
            typeof te != "string" && (B = "{" + B + "}"), I === r ? (d = u.length, b = B.length, u += B) : u = 10 > B.length && 40 > u.length + B.length ? u + B : u + "...";
          }
          u += ">";
        } else {
          for (u = "{", E = Object.keys(n), F = 0; F < E.length; F++)
            0 < F && (u += ", "), I = E[F], u += nn(I) + ": ", te = n[I], te = typeof te == "object" && te !== null ? pn(te) : be(te), I === r ? (d = u.length, b = te.length, u += te) : u = 10 > te.length && 40 > u.length + te.length ? u + te : u + "...";
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
      return Sn.call(Xa, n) ? !0 : Sn.call(Ga, n) ? !1 : va.test(n) ? Xa[n] = !0 : (Ga[n] = !0, console.error("Invalid attribute name: `%s`", n), !1);
    }
    function ft(n, r) {
      lr[r.type] || r.onChange || r.onInput || r.readOnly || r.disabled || r.value == null || console.error(
        n === "select" ? "You provided a `value` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultValue`. Otherwise, set `onChange`." : "You provided a `value` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultValue`. Otherwise, set either `onChange` or `readOnly`."
      ), r.onChange || r.readOnly || r.disabled || r.checked == null || console.error(
        "You provided a `checked` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultChecked`. Otherwise, set either `onChange` or `readOnly`."
      );
    }
    function tr(n, r) {
      if (Sn.call(ti, r) && ti[r])
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
      if (Sn.call(fr, r) && fr[r])
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
      if (pc.hasOwnProperty(b)) {
        if (b = pc[b], b !== r)
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
    function Br(n, r, u) {
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
    function Je(n) {
      return Cs.test("" + n) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : n;
    }
    function Et(n) {
      return ee(n), ("" + n).replace(ve, ce);
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
        if (Sn.call(r, d)) {
          var b = r[d];
          if (b != null && typeof b != "boolean" && b !== "") {
            if (d.indexOf("--") === 0) {
              var E = Me(d);
              Ae(b, d), b = Me(("" + b).trim());
            } else {
              E = d;
              var F = b;
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
              else if (ba.test(F)) {
                I = E;
                var te = F;
                Hn.hasOwnProperty(te) && Hn[te] || (Hn[te] = !0, console.error(
                  `Style property values shouldn't contain a semicolon. Try "%s: %s" instead.`,
                  I,
                  te.replace(
                    ba,
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
              ), vt.set(E, F)), E = F, typeof b == "number" ? b = b === 0 || ya.has(d) ? "" + b : b + "px" : (Ae(b, d), b = Me(
                ("" + b).trim()
              ));
            }
            u ? (u = !1, n.push(
              mn,
              E,
              Rr,
              b
            )) : n.push(In, E, Rr, b);
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
    function pr(n, r) {
      this.push('<input type="hidden"'), vl(n), de(this, "name", r), de(this, "value", n), this.push(wa);
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
    function p(n, r, u, d, b, E, F, I) {
      var te = null;
      if (typeof d == "function") {
        I === null || Ja || (Ja = !0, console.error(
          'Cannot specify a "name" prop for a button that specifies a function as a formAction. React needs it to encode which action should be invoked. It will get overridden.'
        )), b === null && E === null || xc || (xc = !0, console.error(
          "Cannot specify a formEncType or formMethod for a button that specifies a function as a formAction. React provides those automatically. They will get overridden."
        )), F === null || Ka || (Ka = !0, console.error(
          "Cannot specify a formTarget for a button that specifies a function as a formAction. The function will always be executed in the same window."
        ));
        var B = he(r, d);
        B !== null ? (I = B.name, d = B.action || "", b = B.encType, E = B.method, F = B.target, te = B.data) : (n.push(
          En,
          "formAction",
          Pn,
          qt,
          qe
        ), F = E = b = d = I = null, Ne(r, u));
      }
      return I != null && Y(n, "name", I), d != null && Y(n, "formAction", d), b != null && Y(n, "formEncType", b), E != null && Y(n, "formMethod", E), F != null && Y(n, "formTarget", F), te;
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
    function pe(n, r) {
      var u = n[r];
      u != null && (u = Yi(u), n.multiple && !u ? console.error(
        "The `%s` prop supplied to <select> must be an array if `multiple` is true.",
        r
      ) : !n.multiple && u && console.error(
        "The `%s` prop supplied to <select> must be a scalar value if `multiple` is false.",
        r
      ));
    }
    function ke(n) {
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
    function me(n, r) {
      n.push(kt("link"));
      for (var u in r)
        if (Sn.call(r, u)) {
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
      return ee(n), ("" + n).replace(Do, fe);
    }
    function Rn(n, r, u) {
      n.push(kt(u));
      for (var d in r)
        if (Sn.call(r, d)) {
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
      n.push(kt("title"));
      var u = null, d = null, b;
      for (b in r)
        if (Sn.call(r, b)) {
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
      return n.push(sn), r = Array.isArray(u) ? 2 > u.length ? u[0] : null : u, typeof r != "function" && typeof r != "symbol" && r !== null && r !== void 0 && n.push(Me("" + r)), we(n, d, u), n.push(mt("title")), null;
    }
    function Ct(n, r) {
      n.push(kt("script"));
      var u = null, d = null, b;
      for (b in r)
        if (Sn.call(r, b)) {
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
      )), we(n, d, u), typeof u == "string" && n.push(Et(u)), n.push(mt("script")), null;
    }
    function Ia(n, r, u) {
      n.push(kt(u));
      var d = u = null, b;
      for (b in r)
        if (Sn.call(r, b)) {
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
      n.push(kt(u));
      var d = u = null, b;
      for (b in r)
        if (Sn.call(r, b)) {
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
      return n.push(sn), we(n, d, u), typeof u == "string" ? (n.push(Me(u)), null) : u;
    }
    function kt(n) {
      var r = Ec.get(n);
      if (r === void 0) {
        if (!kr.test(n)) throw Error("Invalid tag: " + n);
        r = "<" + n, Ec.set(n, r);
      }
      return r;
    }
    function xn(n, r, u, d, b, E, F, I, te) {
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
          n.push(kt("a"));
          var j = null, ge = null, Ce;
          for (Ce in u)
            if (Sn.call(u, Ce)) {
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
                    ye === "" ? de(n, "href", "") : Y(n, Ce, ye);
                    break;
                  default:
                    Y(n, Ce, ye);
                }
            }
          if (n.push(sn), we(n, ge, j), typeof j == "string") {
            n.push(Me(j));
            var ae = null;
          } else ae = j;
          return ae;
        case "g":
        case "p":
        case "li":
          break;
        case "select":
          ft("select", u), pe(u, "value"), pe(u, "defaultValue"), u.value === void 0 || u.defaultValue === void 0 || Pl || (console.error(
            "Select elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled select element and remove one of these props. More info: https://react.dev/link/controlled-components"
          ), Pl = !0), n.push(kt("select"));
          var fn = null, Qn = null, Ye;
          for (Ye in u)
            if (Sn.call(u, Ye)) {
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
          return n.push(sn), we(n, Qn, fn), fn;
        case "option":
          var vr = I.selectedValue;
          n.push(kt("option"));
          var yr = null, Mn = null, $t = null, Si = null, Jr;
          for (Jr in u)
            if (Sn.call(u, Jr)) {
              var _e = u[Jr];
              if (_e != null)
                switch (Jr) {
                  case "children":
                    yr = _e;
                    break;
                  case "selected":
                    $t = _e, Vi || (console.error(
                      "Use the `defaultValue` or `value` props on <select> instead of setting `selected` on <option>."
                    ), Vi = !0);
                    break;
                  case "dangerouslySetInnerHTML":
                    Si = _e;
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
              Si === null || Ei || (Ei = !0, console.error(
                "Pass a `value` prop if you set dangerouslyInnerHTML so React knows which value should be selected."
              )), Bn = ke(yr);
            if (Yi(vr)) {
              for (var Un = 0; Un < vr.length; Un++)
                if (D(vr[Un], "value"), "" + vr[Un] === Bn) {
                  n.push(' selected=""');
                  break;
                }
            } else
              D(vr, "select.value"), "" + vr === Bn && n.push(' selected=""');
          } else $t && n.push(' selected=""');
          return n.push(sn), we(n, Si, yr), yr;
        case "textarea":
          ft("textarea", u), u.value === void 0 || u.defaultValue === void 0 || Al || (console.error(
            "Textarea elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled textarea and remove one of these props. More info: https://react.dev/link/controlled-components"
          ), Al = !0), n.push(kt("textarea"));
          var Xn = null, Tt = null, Tn = null, tn;
          for (tn in u)
            if (Sn.call(u, tn)) {
              var Ir = u[tn];
              if (Ir != null)
                switch (tn) {
                  case "children":
                    Tn = Ir;
                    break;
                  case "value":
                    Xn = Ir;
                    break;
                  case "defaultValue":
                    Tt = Ir;
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
          if (Xn === null && Tt !== null && (Xn = Tt), n.push(sn), Tn != null) {
            if (console.error(
              "Use the `defaultValue` or `value` props instead of setting children on <textarea>."
            ), Xn != null)
              throw Error(
                "If you supply `defaultValue` on a <textarea>, do not pass children."
              );
            if (Yi(Tn)) {
              if (1 < Tn.length)
                throw Error("<textarea> can only have at most one child.");
              ee(Tn[0]), Xn = "" + Tn[0];
            }
            ee(Tn), Xn = "" + Tn;
          }
          return typeof Xn == "string" && Xn[0] === `
` && n.push(Ta), Xn !== null && (D(Xn, "value"), n.push(Me("" + Xn))), null;
        case "input":
          ft("input", u), n.push(kt("input"));
          var Wn = null, br = null, ct = null, al = null, Jo = null, ol = null, mi = null, Pi = null, Ai = null, or;
          for (or in u)
            if (Sn.call(u, or)) {
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
                    Jo = e;
                    break;
                  case "defaultChecked":
                    Ai = e;
                    break;
                  case "defaultValue":
                    mi = e;
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
          br === null || u.type === "image" || u.type === "submit" || Qt || (Qt = !0, console.error(
            'An input can only specify a formAction along with type="submit" or type="image".'
          ));
          var t = p(
            n,
            d,
            b,
            br,
            ct,
            al,
            Jo,
            Wn
          );
          return Pi === null || Ai === null || Cr || (console.error(
            "%s contains an input of type %s with both checked and defaultChecked props. Input elements must be either controlled or uncontrolled (specify either the checked prop, or the defaultChecked prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://react.dev/link/controlled-components",
            "A component",
            u.type
          ), Cr = !0), ol === null || mi === null || Zi || (console.error(
            "%s contains an input of type %s with both value and defaultValue props. Input elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://react.dev/link/controlled-components",
            "A component",
            u.type
          ), Zi = !0), Pi !== null ? Q(n, "checked", Pi) : Ai !== null && Q(n, "checked", Ai), ol !== null ? Y(n, "value", ol) : mi !== null && Y(n, "value", mi), n.push(wa), t?.forEach(pr, n), null;
        case "button":
          n.push(kt("button"));
          var c = null, h = null, y = null, x = null, m = null, _ = null, J = null, N;
          for (N in u)
            if (Sn.call(u, N)) {
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
                    y = U;
                    break;
                  case "formAction":
                    x = U;
                    break;
                  case "formEncType":
                    m = U;
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
          var oe = p(
            n,
            d,
            b,
            x,
            m,
            _,
            J,
            y
          );
          if (n.push(sn), oe?.forEach(pr, n), we(n, h, c), typeof c == "string") {
            n.push(Me(c));
            var se = null;
          } else se = c;
          return se;
        case "form":
          n.push(kt("form"));
          var ue = null, le = null, Ue = null, Zn = null, ze = null, hn = null, At;
          for (At in u)
            if (Sn.call(u, At)) {
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
            ), hn = ze = Zn = Ue = null, Ne(d, b));
          }
          if (Ue != null && Y(n, "action", Ue), Zn != null && Y(n, "encType", Zn), ze != null && Y(n, "method", ze), hn != null && Y(n, "target", hn), n.push(sn), Le !== null && (n.push('<input type="hidden"'), de(n, "name", Le), n.push(wa), On?.forEach(
            pr,
            n
          )), we(n, le, ue), typeof ue == "string") {
            n.push(Me(ue));
            var Dr = null;
          } else Dr = ue;
          return Dr;
        case "menuitem":
          n.push(kt("menuitem"));
          for (var Vn in u)
            if (Sn.call(u, Vn)) {
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
          n.push(kt("object"));
          var cl = null, wr = null, er;
          for (er in u)
            if (Sn.call(u, er)) {
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
          if (n.push(sn), we(n, wr, cl), typeof cl == "string") {
            n.push(Me(cl));
            var ul = null;
          } else ul = cl;
          return ul;
        case "title":
          var ml = I.tagScope & 1, nr = I.tagScope & 4;
          if (Sn.call(u, "children")) {
            var pt = u.children, Lr = Array.isArray(pt) ? 2 > pt.length ? pt[0] : null : pt;
            Array.isArray(pt) && 1 < pt.length ? console.error(
              "React expects the `children` prop of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found an Array with length %s instead. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert `children` of <title> tags to a single string value which is why Arrays of length greater than 1 are not supported. When using JSX it can be common to combine text nodes and value nodes. For example: <title>hello {nameOfUser}</title>. While not immediately apparent, `children` in this case is an Array with length 2. If your `children` prop is using this form try rewriting it using a template string: <title>{`hello ${nameOfUser}`}</title>.",
              pt.length
            ) : typeof Lr == "function" || typeof Lr == "symbol" ? console.error(
              "React expect children of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found %s instead. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert children of <title> tags to a single string value.",
              typeof Lr == "function" ? "a Function" : "a Sybmol"
            ) : Lr && Lr.toString === {}.toString && (Lr.$$typeof != null ? console.error(
              "React expects the `children` prop of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found an object that appears to be a React element which never implements a suitable `toString` method. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert children of <title> tags to a single string value which is why rendering React elements is not supported. If the `children` of <title> is a React Component try moving the <title> tag into that component. If the `children` of <title> is some HTML markup change it to be Text only to be valid HTML."
            ) : console.error(
              "React expects the `children` prop of <title> tags to be a string, number, bigint, or object with a novel `toString` method but found an object that does not implement a suitable `toString` method. Browsers treat all child Nodes of <title> tags as Text content and React expects to be able to convert children of <title> tags to a single string value. Using the default `toString` method available on every object is almost certainly an error. Consider whether the `children` of this <title> is an object in error and change it to a string or number value if so. Otherwise implement a `toString` method that React can use to produce a valid <title>."
            ));
          }
          if (I.insertionMode === Xe || ml || u.itemProp != null)
            var sl = tt(
              n,
              u
            );
          else
            nr ? sl = null : (tt(b.hoistableChunks, u), sl = void 0);
          return sl;
        case "link":
          var Nr = I.tagScope & 1, na = I.tagScope & 4, fl = u.rel, Ut = u.href, zl = u.precedence;
          if (I.insertionMode === Xe || Nr || u.itemProp != null || typeof fl != "string" || typeof Ut != "string" || Ut === "") {
            fl === "stylesheet" && typeof u.precedence == "string" && (typeof Ut == "string" && Ut || console.error(
              'React encountered a `<link rel="stylesheet" .../>` with a `precedence` prop and expected the `href` prop to be a non-empty string but ecountered %s instead. If your intent was to have React hoist and deduplciate this stylesheet using the `precedence` prop ensure there is a non-empty string `href` prop as well, otherwise remove the `precedence` prop.',
              Ut === null ? "`null`" : Ut === void 0 ? "`undefined`" : Ut === "" ? "an empty string" : 'something with type "' + typeof Ut + '"'
            )), me(n, u);
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
              cr = me(
                n,
                u
              );
            } else {
              var Fi = b.styles.get(zl), Ft = d.styleResources.hasOwnProperty(
                Ut
              ) ? d.styleResources[Ut] : void 0;
              if (Ft !== M) {
                d.styleResources[Ut] = M, Fi || (Fi = {
                  precedence: Me(zl),
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
                  Ft.length === 2 && yl(Hl.props, Ft);
                  var zr = b.preloads.stylesheets.get(Ut);
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
            u.onLoad || u.onError ? cr = me(
              n,
              u
            ) : (te && n.push("<!-- -->"), cr = na ? null : me(b.hoistableChunks, u));
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
              var Lc = d.moduleScriptResources, Qu = b.preloads.moduleScripts;
            else
              Lc = d.scriptResources, Qu = b.preloads.scripts;
            var Bl = Lc.hasOwnProperty(hl) ? Lc[hl] : void 0;
            if (Bl !== M) {
              Lc[hl] = M;
              var Nc = u;
              if (Bl) {
                Bl.length === 2 && (Nc = it({}, u), yl(Nc, Bl));
                var Hr = Qu.get(hl);
                Hr && (Hr.length = 0);
              }
              var qo = [];
              b.scripts.add(qo), Ct(qo, Nc);
            }
            te && n.push("<!-- -->"), jo = null;
          }
          return jo;
        case "style":
          var go = I.tagScope & 1;
          if (Sn.call(u, "children")) {
            var Fa = u.children, Ul = Array.isArray(Fa) ? 2 > Fa.length ? Fa[0] : null : Fa;
            (typeof Ul == "function" || typeof Ul == "symbol" || Array.isArray(Ul)) && console.error(
              "React expect children of <style> tags to be a string, number, or object with a `toString` method but found %s instead. In browsers style Elements can only have `Text` Nodes as children.",
              typeof Ul == "function" ? "a Function" : typeof Ul == "symbol" ? "a Sybmol" : "an Array"
            );
          }
          var Wl = u.precedence, Oi = u.href, dl = u.nonce;
          if (I.insertionMode === Xe || go || u.itemProp != null || typeof Wl != "string" || typeof Oi != "string" || Oi === "") {
            n.push(kt("style"));
            var Tr = null, Oa = null, _i;
            for (_i in u)
              if (Sn.call(u, _i)) {
                var vo = u[_i];
                if (vo != null)
                  switch (_i) {
                    case "children":
                      Tr = vo;
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
            var ta = Array.isArray(Tr) ? 2 > Tr.length ? Tr[0] : null : Tr;
            typeof ta != "function" && typeof ta != "symbol" && ta !== null && ta !== void 0 && n.push(Rt(ta)), we(
              n,
              Oa,
              Tr
            ), n.push(mt("style"));
            var ws = null;
          } else {
            Oi.includes(" ") && console.error(
              'React expected the `href` prop for a <style> tag opting into hoisting semantics using the `precedence` prop to not have any spaces but ecountered spaces instead. using spaces in this prop will cause hydration of this style to fail on the client. The href for the <style> where this ocurred is "%s".',
              Oi
            );
            var Kr = b.styles.get(Wl), ui = d.styleResources.hasOwnProperty(Oi) ? d.styleResources[Oi] : void 0;
            if (ui !== M) {
              d.styleResources[Oi] = M, ui && console.error(
                'React encountered a hoistable style tag for the same href as a preload: "%s". When using a style tag to inline styles you should not also preload it as a stylsheet.',
                Oi
              ), Kr || (Kr = {
                precedence: Me(Wl),
                rules: [],
                hrefs: [],
                sheets: /* @__PURE__ */ new Map()
              }, b.styles.set(
                Wl,
                Kr
              ));
              var zc = b.nonce.style;
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
                var Tu = Kr.rules, pu = null, Xs = null, yo;
                for (yo in u)
                  if (Sn.call(u, yo)) {
                    var $o = u[yo];
                    if ($o != null)
                      switch (yo) {
                        case "children":
                          pu = $o;
                          break;
                        case "dangerouslySetInnerHTML":
                          Xs = $o;
                      }
                  }
                var bo = Array.isArray(pu) ? 2 > pu.length ? pu[0] : null : pu;
                typeof bo != "function" && typeof bo != "symbol" && bo !== null && bo !== void 0 && Tu.push(Rt(bo)), we(Tu, Xs, pu);
              }
            }
            Kr && F && F.styles.add(Kr), te && n.push("<!-- -->"), ws = void 0;
          }
          return ws;
        case "meta":
          var xu = I.tagScope & 1, Ls = I.tagScope & 4;
          if (I.insertionMode === Xe || xu || u.itemProp != null)
            var ms = Rn(
              n,
              u,
              "meta"
            );
          else
            te && n.push("<!-- -->"), ms = Ls ? null : typeof u.charSet == "string" ? Rn(b.charsetChunks, u, "meta") : u.name === "viewport" ? Rn(b.viewportChunks, u, "meta") : Rn(
              b.hoistableChunks,
              u,
              "meta"
            );
          return ms;
        case "listing":
        case "pre":
          n.push(kt(r));
          var jr = null, Mi = null, wo;
          for (wo in u)
            if (Sn.call(u, wo)) {
              var Ju = u[wo];
              if (Ju != null)
                switch (wo) {
                  case "children":
                    jr = Ju;
                    break;
                  case "dangerouslySetInnerHTML":
                    Mi = Ju;
                    break;
                  default:
                    Y(
                      n,
                      wo,
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
` ? n.push(Ta, Yl) : (ee(Yl), n.push("" + Yl)));
          }
          return typeof jr == "string" && jr[0] === `
` && n.push(Ta), jr;
        case "img":
          var Wt = I.tagScope & 3, xt = u.src, et = u.srcSet;
          if (!(u.loading === "lazy" || !xt && !et || typeof xt != "string" && xt != null || typeof et != "string" && et != null || u.fetchPriority === "low" || Wt) && (typeof xt != "string" || xt[4] !== ":" || xt[0] !== "d" && xt[0] !== "D" || xt[1] !== "a" && xt[1] !== "A" || xt[2] !== "t" && xt[2] !== "T" || xt[3] !== "a" && xt[3] !== "A") && (typeof et != "string" || et[4] !== ":" || et[0] !== "d" && et[0] !== "D" || et[1] !== "a" && et[1] !== "A" || et[2] !== "t" && et[2] !== "T" || et[3] !== "a" && et[3] !== "A")) {
            F !== null && I.tagScope & 64 && (F.suspenseyImages = !0);
            var Ps = typeof u.sizes == "string" ? u.sizes : void 0, ec = et ? et + `
` + (Ps || "") : xt, Ku = b.preloads.images, nc = Ku.get(ec);
            if (nc)
              (u.fetchPriority === "high" || 10 > b.highImagePreloads.size) && (Ku.delete(ec), b.highImagePreloads.add(nc));
            else if (!d.imageResources.hasOwnProperty(ec)) {
              d.imageResources[ec] = G;
              var Hc = u.crossOrigin, ju = typeof Hc == "string" ? Hc === "use-credentials" ? Hc : "" : void 0, Bc = b.headers, Eu;
              Bc && 0 < Bc.remainingCapacity && typeof u.srcSet != "string" && (u.fetchPriority === "high" || 500 > Bc.highImagePreloads.length) && (Eu = R(xt, "image", {
                imageSrcSet: u.srcSet,
                imageSizes: u.sizes,
                crossOrigin: ju,
                integrity: u.integrity,
                nonce: u.nonce,
                type: u.type,
                fetchPriority: u.fetchPriority,
                referrerPolicy: u.refererPolicy
              }), 0 <= (Bc.remainingCapacity -= Eu.length + 2)) ? (b.resets.image[ec] = G, Bc.highImagePreloads && (Bc.highImagePreloads += ", "), Bc.highImagePreloads += Eu) : (nc = [], me(nc, {
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
          if (I.insertionMode < He) {
            var Ru = E || b.preamble;
            if (Ru.headChunks)
              throw Error("The `<head>` tag may only be rendered once.");
            E !== null && n.push("<!--head-->"), Ru.headChunks = [];
            var Ts = Ia(
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
          if (I.insertionMode < He) {
            var As = E || b.preamble;
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
            var qu = E || b.preamble;
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
            n.push(kt(r));
            var Uc = null, To = null, _a;
            for (_a in u)
              if (Sn.call(u, _a)) {
                var gl = u[_a];
                if (gl != null) {
                  var Cu = _a;
                  switch (_a) {
                    case "children":
                      Uc = gl;
                      break;
                    case "dangerouslySetInnerHTML":
                      To = gl;
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
            return n.push(sn), we(
              n,
              To,
              Uc
            ), Uc;
          }
      }
      return Ge(n, u, r);
    }
    function mt(n) {
      var r = Sr.get(n);
      return r === void 0 && (r = "</" + n + ">", Sr.set(n, r)), r;
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
          return n.push(xa), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(yt);
        case Xe:
          return n.push(Ea), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(qa);
        case at:
          return n.push(dr), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(zo);
        case cn:
          return n.push(Nu), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push($a);
        case wn:
          return n.push(tu), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(ru);
        case _n:
          return n.push(eo), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(no);
        case en:
          return n.push(Sc), n.push(r.segmentPrefix), r = d.toString(16), n.push(r), n.push(mc);
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
          return n.push(mr);
        case cn:
          return n.push(kc);
        case wn:
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
        for (this.push(re.startInlineStyle), this.push(Oc), this.push(n.precedence), this.push(ka); d < u.length - 1; d++)
          this.push(u[d]), this.push(Ml);
        for (this.push(u[d]), this.push(us), d = 0; d < r.length; d++) this.push(r[d]);
        Bo = this.push(ss), li = !0, r.length = 0, u.length = 0;
      }
    }
    function vn(n) {
      return n.state !== S ? li = !0 : !1;
    }
    function rr(n, r, u) {
      return li = !1, Bo = !0, re = u, r.styles.forEach(Da, n), re = null, r.stylesheets.forEach(vn), li && (u.stylesToHoist = !0), Bo;
    }
    function Nn(n) {
      for (var r = 0; r < n.length; r++) this.push(n[r]);
      n.length = 0;
    }
    function rc(n) {
      me(kl, n.props);
      for (var r = 0; r < kl.length; r++)
        this.push(kl[r]);
      kl.length = 0, n.state = S;
    }
    function ht(n) {
      var r = 0 < n.sheets.size;
      n.sheets.forEach(rc, this), n.sheets.clear();
      var u = n.rules, d = n.hrefs;
      if (!r || d.length) {
        if (this.push(re.startInlineStyle), this.push(Sa), this.push(n.precedence), n = 0, d.length) {
          for (this.push(ro); n < d.length - 1; n++)
            this.push(d[n]), this.push(Ml);
          this.push(d[n]);
        }
        for (this.push(Yu), n = 0; n < u.length; n++)
          this.push(u[n]);
        this.push(fs), u.length = 0, d.length = 0;
      }
    }
    function po(n) {
      if (n.state === w) {
        n.state = C;
        var r = n.props;
        for (me(kl, {
          rel: "preload",
          as: "style",
          href: n.props.href,
          crossOrigin: r.crossOrigin,
          fetchPriority: r.fetchPriority,
          integrity: r.integrity,
          media: r.media,
          hrefLang: r.hrefLang,
          referrerPolicy: r.referrerPolicy
        }), n = 0; n < kl.length; n++)
          this.push(kl[n]);
        kl.length = 0;
      }
    }
    function xo(n) {
      n.sheets.forEach(po, this), n.sheets.clear();
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
        if (d.state !== S)
          if (d.state === z)
            n.push(u), d = d.props.href, D(d, "href"), d = $r("" + d), n.push(d), n.push(v), u = a;
          else {
            n.push(u);
            var b = d.props["data-precedence"], E = d.props, F = Je("" + d.props.href);
            F = $r(F), n.push(F), D(b, "precedence"), b = "" + b, n.push(s), b = $r(b), n.push(b);
            for (var I in E)
              if (Sn.call(E, I) && (b = E[I], b != null))
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
                      b
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
      ), n.scriptResources[u] = M, n.moduleScriptResources[u] = M, n = [], me(n, d), r.bootstrapScripts.add(n);
    }
    function yl(n, r) {
      n.crossOrigin == null && (n.crossOrigin = r[0]), n.integrity == null && (n.integrity = r[1]);
    }
    function R(n, r, u) {
      n = L(n), r = Ee(r, "as"), r = "<" + n + '>; rel=preload; as="' + r + '"';
      for (var d in u)
        Sn.call(u, d) && (n = u[d], typeof n == "string" && (r += "; " + d.toLowerCase() + '="' + Ee(
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
          var I = E[b], te, B = void 0, j = void 0, ge = {
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
          b = F[E], B = te = void 0, j = {
            rel: "modulepreload",
            fetchPriority: "low",
            nonce: void 0
          }, typeof b == "string" ? j.href = I = b : (j.href = I = b.src, j.integrity = B = typeof b.integrity == "string" ? b.integrity : void 0, j.crossOrigin = te = typeof b == "string" || b.crossOrigin == null ? void 0 : b.crossOrigin === "use-credentials" ? "use-credentials" : ""), Vl(
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
        case pi:
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
          case Dt:
            return "Portal";
          case Tl:
            return n.displayName || "Context";
          case Qc:
            return (n._context.displayName || "Context") + ".Consumer";
          case pl:
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
      var b = 32 - Dl(d) - 1;
      d &= ~(1 << b), u += 1;
      var E = 32 - Dl(r) + b;
      if (30 < E) {
        var F = b - b % 5;
        return E = (d & (1 << F) - 1).toString(32), d >>= F, b -= F, {
          id: 1 << 32 - Dl(r) + b | u << b | d,
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
    function kn() {
      return ot === null ? Gu === null ? (Go = !1, Gu = ot = zn()) : (Go = !0, ot = Gu) : ot.next === null ? (Go = !1, ot = ot.next = zn()) : (Go = !0, ot = ot.next), ot;
    }
    function Jl() {
      var n = Xo;
      return Xo = null, n;
    }
    function sr() {
      Ci = !1, ao = _r = Yo = Qr = null, ai = !1, Gu = null, hu = 0, ot = ma = null;
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
      if (n !== Wc && (co = "useReducer"), Qr = di(), ot = kn(), Go) {
        if (u = ot.queue, r = u.dispatch, ma !== null) {
          var d = ma.get(u);
          if (d !== void 0) {
            ma.delete(u), u = ot.memoizedState;
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
        Qr,
        n
      ), [ot.memoizedState, n];
    }
    function ns(n, r) {
      if (Qr = di(), ot = kn(), r = r === void 0 ? null : r, ot !== null) {
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
    function Su(n, r, u) {
      if (25 <= hu)
        throw Error(
          "Too many re-renders. React limits the number of renders to prevent an infinite loop."
        );
      if (n === Qr)
        if (ai = !0, n = { action: u, next: null }, ma === null && (ma = /* @__PURE__ */ new Map()), u = ma.get(r), u === void 0)
          ma.set(r, n);
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
      var d = oo++, b = _r;
      if (typeof n.$$FORM_ACTION == "function") {
        var E = null, F = ao;
        b = b.formState;
        var I = n.$$IS_SIGNATURE_EQUAL;
        if (b !== null && typeof I == "function") {
          var te = b[1];
          I.call(n, b[2], b[3]) && (E = u !== void 0 ? "p" + u : "k" + Re(
            JSON.stringify([
              F,
              null,
              d
            ]),
            0
          ), te === E && (su = d, r = b[0]));
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
    function wl(n) {
      var r = fu;
      return fu += 1, Xo === null && (Xo = []), ic(Xo, n, r);
    }
    function za() {
      throw Error("Cache cannot be refreshed during server rendering.");
    }
    function ts() {
    }
    function rs() {
      if (Sl === 0) {
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
      Sl++;
    }
    function Ro() {
      if (Sl--, Sl === 0) {
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
      0 > Sl && console.error(
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
        var F = b.DetermineComponentFrameRoot(), I = F[0], te = F[1];
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
                    return n.displayName && ge.includes("<anonymous>") && (ge = ge.replace("<anonymous>", n.displayName)), typeof n == "function" && yu.set(n, ge), ge;
                  }
                while (1 <= E && 0 <= F);
              break;
            }
        }
      } finally {
        vs = !1, gt.H = d, Ro(), Error.prepareStackTrace = u;
      }
      return B = (B = n ? n.displayName || n.name : "") ? gi(B) : "", typeof n == "function" && yu.set(n, B), B;
    }
    function Xc(n) {
      if (typeof n == "string") return gi(n);
      if (typeof n == "function")
        return n.prototype && n.prototype.isReactComponent ? vi(n, !0) : vi(n, !1);
      if (typeof n == "object" && n !== null) {
        switch (n.$$typeof) {
          case pl:
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
    function Zt(n, r, u, d, b, E, F, I, te, B, j) {
      var ge = /* @__PURE__ */ new Set();
      this.destination = null, this.flushScheduled = !1, this.resumableState = n, this.renderState = r, this.rootFormatContext = u, this.progressiveChunkSize = d === void 0 ? 12800 : d, this.status = 10, this.fatalError = null, this.pendingRootTasks = this.allPendingTasks = this.nextSegmentId = 0, this.completedPreambleSegments = this.completedRootSegment = null, this.byteSize = 0, this.abortableTasks = ge, this.pingedTasks = [], this.clientRenderedBoundaries = [], this.completedBoundaries = [], this.partialBoundaries = [], this.trackedPostpones = null, this.onError = b === void 0 ? uc : b, this.onPostpone = B === void 0 ? dn : B, this.onAllReady = E === void 0 ? dn : E, this.onShellReady = F === void 0 ? dn : F, this.onShellError = I === void 0 ? dn : I, this.onFatalError = te === void 0 ? dn : te, this.formState = j === void 0 ? null : j, this.didWarnForKey = null;
    }
    function ko(n, r, u, d, b, E, F, I, te, B, j, ge) {
      var Ce = ys();
      return 1e3 < Ce - Is && (gt.recentlyCreatedOwnerStacks = 0, Is = Ce), r = new Zt(
        r,
        u,
        d,
        b,
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
        Te,
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
    function yi(n, r, u, d, b, E, F, I, te, B, j, ge, Ce, ye, ae, fn, Qn) {
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
        hoistableState: I,
        abortSet: te,
        keyPath: B,
        formatContext: j,
        context: ge,
        treeContext: Ce,
        row: ye,
        componentStack: ae,
        thenableState: r
      };
      return Ye.debugTask = Qn, te.add(Ye), Ye;
    }
    function fc(n, r, u, d, b, E, F, I, te, B, j, ge, Ce, ye, ae, fn) {
      n.allPendingTasks++, E === null ? n.pendingRootTasks++ : E.pendingTasks++, Ce !== null && Ce.pendingTasks++, u.pendingTasks++;
      var Qn = {
        replay: u,
        node: d,
        childIndex: b,
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
        componentStack: ye,
        thenableState: r
      };
      return Qn.debugTask = fn, I.add(Qn), Qn;
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
      } catch (I) {
        F = `
Error generating stack: ` + I.message + `
` + I.stack;
      }
      return F;
    }
    function mu(n, r) {
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
    function So(n, r, u, d, b) {
      n.errorDigest = r, u instanceof Error ? (r = String(u.message), u = String(u.stack)) : (r = typeof u == "object" && u !== null ? pn(u) : String(u), u = null), b = b ? `Switched to client rendering because the server rendering aborted due to:

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
      Pu(n, r.next, r.hoistables);
    }
    function Pu(n, r, u) {
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
    function Di(n, r) {
      var u = r.boundaries;
      if (u !== null && r.pendingTasks === u.length) {
        for (var d = !0, b = 0; b < u.length; b++) {
          var E = u[b];
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
    function Au(n, r, u, d, b) {
      var E = r.keyPath, F = r.treeContext, I = r.row, te = r.componentStack, B = r.debugTask;
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
            typeof fn == "number" ? (Ni(n, r, fn, ae, ye), delete ge[ye]) : It(n, r, ae, ye), --j.pendingTasks === 0 && jn(n, j);
          }
        else
          for (ge = 0; ge < u; ge++)
            Ce = b !== "backwards" && b !== "unstable_legacy-backwards" ? ge : u - 1 - ge, ye = d[Ce], Mt(n, r, ye), r.row = j = jl(j), r.treeContext = Cn(F, u, Ce), It(n, r, ye, Ce), --j.pendingTasks === 0 && jn(n, j);
      } else if (b !== "backwards" && b !== "unstable_legacy-backwards")
        for (b = 0; b < u; b++)
          ge = d[b], Mt(n, r, ge), r.row = j = jl(j), r.treeContext = Cn(
            F,
            u,
            b
          ), It(n, r, ge, b), --j.pendingTasks === 0 && jn(n, j);
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
          ), b.children.splice(ge, 0, fn), r.blockedSegment = fn, Mt(n, r, ae);
          try {
            It(n, r, ae, ye), nl(
              fn.chunks,
              n.renderState,
              fn.lastPushedText,
              fn.textEmbedded
            ), fn.status = Mr, --j.pendingTasks === 0 && jn(n, j);
          } catch (Qn) {
            throw fn.status = n.status === 12 ? Nl : Dn, Qn;
          }
        }
        r.blockedSegment = b, b.lastPushedText = !1;
      }
      I !== null && j !== null && 0 < j.pendingTasks && (I.pendingTasks++, j.next = I), r.treeContext = F, r.row = I, r.keyPath = E, r.componentStack = te, r.debugTask = B;
    }
    function Li(n, r, u, d, b, E) {
      var F = r.thenableState;
      for (r.thenableState = null, Qr = {}, Yo = r, _r = n, ao = u, Ci = !1, oo = uu = 0, su = -1, fu = 0, Xo = F, n = Zu(d, b, E); ai; )
        ai = !1, oo = uu = 0, su = -1, fu = 0, hu += 1, ot = null, n = d(b, E);
      return sr(), n;
    }
    function bi(n, r, u, d, b, E, F) {
      var I = !1;
      if (E !== 0 && n.formState !== null) {
        var te = r.blockedSegment;
        if (te !== null) {
          I = !0, te = te.chunks;
          for (var B = 0; B < E; B++)
            B === F ? te.push("<!--F!-->") : te.push("<!--F-->");
        }
      }
      E = r.keyPath, r.keyPath = u, b ? (u = r.treeContext, r.treeContext = Cn(u, 1, 0), It(n, r, d, -1), r.treeContext = u) : I ? It(n, r, d, -1) : $e(n, r, d, -1), r.keyPath = E;
    }
    function mo(n, r, u, d, b, E) {
      if (typeof d == "function")
        if (d.prototype && d.prototype.isReactComponent) {
          var F = b;
          if ("ref" in b) {
            F = {};
            for (var I in b)
              I !== "ref" && (F[I] = b[I]);
          }
          var te = d.defaultProps;
          if (te) {
            F === b && (F = it({}, F, b));
            for (var B in te)
              F[B] === void 0 && (F[B] = te[B]);
          }
          var j = F, ge = Te, Ce = d.contextType;
          if ("contextType" in d && Ce !== null && (Ce === void 0 || Ce.$$typeof !== Tl) && !Vr.has(d)) {
            Vr.add(d);
            var ye = Ce === void 0 ? " However, it is set to undefined. This can be caused by a typo or by mixing up named and default imports. This can also happen due to a circular dependency, so try moving the createContext() call to a separate file." : typeof Ce != "object" ? " However, it is set to a " + typeof Ce + "." : Ce.$$typeof === Qc ? " Did you accidentally pass the Context.Consumer instead?" : " However, it is set to an object with keys {" + Object.keys(Ce).join(", ") + "}.";
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
            var Qn = null, Ye = null, Fn = null;
            if (typeof ae.componentWillMount == "function" && ae.componentWillMount.__suppressDeprecationWarning !== !0 ? Qn = "componentWillMount" : typeof ae.UNSAFE_componentWillMount == "function" && (Qn = "UNSAFE_componentWillMount"), typeof ae.componentWillReceiveProps == "function" && ae.componentWillReceiveProps.__suppressDeprecationWarning !== !0 ? Ye = "componentWillReceiveProps" : typeof ae.UNSAFE_componentWillReceiveProps == "function" && (Ye = "UNSAFE_componentWillReceiveProps"), typeof ae.componentWillUpdate == "function" && ae.componentWillUpdate.__suppressDeprecationWarning !== !0 ? Fn = "componentWillUpdate" : typeof ae.UNSAFE_componentWillUpdate == "function" && (Fn = "UNSAFE_componentWillUpdate"), Qn !== null || Ye !== null || Fn !== null) {
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
          var Si = ae.state;
          Si && (typeof Si != "object" || Yi(Si)) && console.error("%s.state: must be set to an object or null", Mn), typeof ae.getChildContext == "function" && typeof d.childContextTypes != "object" && console.error(
            "%s.getChildContext(): childContextTypes must be defined in order to use getChildContext().",
            Mn
          );
          var Jr = ae.state !== void 0 ? ae.state : null;
          ae.updater = wt, ae.props = j, ae.state = Jr;
          var _e = { queue: [], replace: !1 };
          ae._reactInternals = _e;
          var Bn = d.contextType;
          if (ae.context = typeof Bn == "object" && Bn !== null ? Bn._currentValue2 : Te, ae.state === j) {
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
            var Tt = Xn(
              j,
              Jr
            );
            if (Tt === void 0) {
              var Tn = dt(d) || "Component";
              Qe.has(Tn) || (Qe.add(Tn), console.error(
                "%s.getDerivedStateFromProps(): A valid state object (or null) must be returned. You have returned undefined.",
                Tn
              ));
            }
            var tn = Tt == null ? Jr : it({}, Jr, Tt);
            ae.state = tn;
          }
          if (typeof d.getDerivedStateFromProps != "function" && typeof ae.getSnapshotBeforeUpdate != "function" && (typeof ae.UNSAFE_componentWillMount == "function" || typeof ae.componentWillMount == "function")) {
            var Ir = ae.state;
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
            if (typeof ae.UNSAFE_componentWillMount == "function" && ae.UNSAFE_componentWillMount(), Ir !== ae.state && (console.error(
              "%s.componentWillMount(): Assigning directly to this.state is deprecated (except inside a component's constructor). Use setState instead.",
              dt(d) || "Component"
            ), wt.enqueueReplaceState(
              ae,
              ae.state,
              null
            )), _e.queue !== null && 0 < _e.queue.length) {
              var br = _e.queue, ct = _e.replace;
              if (_e.queue = null, _e.replace = !1, ct && br.length === 1)
                ae.state = br[0];
              else {
                for (var al = ct ? br[0] : ae.state, Jo = !0, ol = ct ? 1 : 0; ol < br.length; ol++) {
                  var mi = br[ol], Pi = typeof mi == "function" ? mi.call(
                    ae,
                    al,
                    j,
                    void 0
                  ) : mi;
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
          var Ai = bu(ae);
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
            var m = dt(d) || "Unknown";
            Qo[m] || (console.error(
              "%s: Function components do not support getDerivedStateFromProps.",
              m
            ), Qo[m] = !0);
          }
          if (typeof d.contextType == "object" && d.contextType !== null) {
            var _ = dt(d) || "Unknown";
            bs[_] || (console.error(
              "%s: Function components do not support contextType.",
              _
            ), bs[_] = !0);
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
        var J = r.blockedSegment;
        if (J === null) {
          var N = b.children, U = r.formatContext, oe = r.keyPath;
          r.formatContext = si(U, d, b), r.keyPath = u, It(n, r, N, -1), r.formatContext = U, r.keyPath = oe;
        } else {
          var se = xn(
            J.chunks,
            d,
            b,
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
            Zn.push(mt(d));
          }
          J.lastPushedText = !1;
        }
      } else {
        switch (d) {
          case Jc:
          case vc:
          case yc:
          case pi:
            var hn = r.keyPath;
            r.keyPath = u, $e(n, r, b.children, -1), r.keyPath = hn;
            return;
          case ni:
            var At = r.blockedSegment;
            if (At === null) {
              if (b.mode !== "hidden") {
                var Ht = r.keyPath;
                r.keyPath = u, It(n, r, b.children, -1), r.keyPath = Ht;
              }
            } else if (b.mode !== "hidden") {
              n.renderState.generateStaticMarkup || At.chunks.push("<!--&-->"), At.lastPushedText = !1;
              var On = r.keyPath;
              r.keyPath = u, It(n, r, b.children, -1), r.keyPath = On, n.renderState.generateStaticMarkup || At.chunks.push("<!--/&-->"), At.lastPushedText = !1;
            }
            return;
          case xl:
            e: {
              var Le = b.children, Bt = b.revealOrder;
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
                var wr = r.keyPath, er = r.row, st = r.row = jl(null);
                st.boundaries = [], st.together = !0, r.keyPath = u, $e(n, r, Le, -1), --st.pendingTasks === 0 && jn(n, st), r.keyPath = wr, r.row = er, er !== null && 0 < st.pendingTasks && (er.pendingTasks++, st.next = er);
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
              var ul = r.keyPath, ml = r.formatContext, nr = r.row;
              r.keyPath = u, r.formatContext = nt(
                n.resumableState,
                ml
              ), r.row = null;
              var pt = b.children;
              try {
                It(n, r, pt, -1);
              } finally {
                r.keyPath = ul, r.formatContext = ml, r.row = nr;
              }
            } else {
              var Lr = r.keyPath, sl = r.formatContext, Nr = r.row, na = r.blockedBoundary, fl = r.blockedPreamble, Ut = r.hoistableState, zl = r.blockedSegment, cr = b.fallback, Vu = b.children, Fi = /* @__PURE__ */ new Set(), Ft = Zc(
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
                } catch (Tu) {
                  throw Hl.status = n.status === 12 ? Nl : Dn, Tu;
                } finally {
                  r.blockedSegment = zl, r.blockedPreamble = fl, r.keyPath = Lr, r.formatContext = sl;
                }
                var jo = yi(
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
                  Te,
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
                } catch (Tu) {
                  if (Ft.status = ar, n.status === 12) {
                    zr.status = Nl;
                    var hl = n.fatalError;
                  } else
                    zr.status = Dn, hl = Tu;
                  var Lc = ca(r.componentStack), Qu = Yr(
                    n,
                    hl,
                    Lc,
                    r.debugTask
                  );
                  So(
                    Ft,
                    Qu,
                    hl,
                    Lc,
                    !1
                  ), Ha(n, Ft);
                } finally {
                  r.blockedBoundary = na, r.blockedPreamble = fl, r.hoistableState = Ut, r.blockedSegment = zl, r.keyPath = Lr, r.formatContext = sl, r.row = Nr;
                }
                var Bl = yi(
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
                  Te,
                  r.debugTask
                );
                Wr(Bl), n.pingedTasks.push(Bl);
              }
            }
            return;
        }
        if (typeof d == "object" && d !== null)
          switch (d.$$typeof) {
            case pl:
              if ("ref" in b) {
                var Nc = {};
                for (var Hr in b)
                  Hr !== "ref" && (Nc[Hr] = b[Hr]);
              } else Nc = b;
              var qo = Li(
                n,
                r,
                u,
                d.render,
                Nc,
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
              mo(n, r, u, d.type, b, E);
              return;
            case Tl:
              var go = b.value, Fa = b.children, Ul = r.context, Wl = r.keyPath, Oi = d._currentValue2;
              d._currentValue2 = go, d._currentRenderer2 !== void 0 && d._currentRenderer2 !== null && d._currentRenderer2 !== yn && console.error(
                "Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported."
              ), d._currentRenderer2 = yn;
              var dl = Ve, Tr = {
                parent: dl,
                depth: dl === null ? 0 : dl.depth + 1,
                context: d,
                parentValue: Oi,
                value: go
              };
              Ve = Tr, r.context = Tr, r.keyPath = u, $e(n, r, Fa, -1);
              var Oa = Ve;
              if (Oa === null)
                throw Error(
                  "Tried to pop a Context at the root of the app. This is a bug in React."
                );
              Oa.context !== d && console.error(
                "The parent context is not the expected context. This is probably a bug in React."
              ), Oa.context._currentValue2 = Oa.parentValue, d._currentRenderer2 !== void 0 && d._currentRenderer2 !== null && d._currentRenderer2 !== yn && console.error(
                "Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported."
              ), d._currentRenderer2 = yn;
              var _i = Ve = Oa.parent;
              r.context = _i, r.keyPath = Wl, Ul !== r.context && console.error(
                "Popping the context provider did not return back to the original snapshot. This is a bug in React."
              );
              return;
            case Qc:
              var vo = d._context, ta = b.children;
              typeof ta != "function" && console.error(
                "A context consumer was rendered with multiple children, or a child that isn't a function. A context consumer expects a single child that is a function. If you did pass a function, make sure there is no trailing or leading whitespace around it."
              );
              var ws = ta(vo._currentValue2), Kr = r.keyPath;
              r.keyPath = u, $e(n, r, ws, -1), r.keyPath = Kr;
              return;
            case El:
              var ui = Ms(d);
              if (n.status === 12) throw null;
              mo(n, r, u, ui, b, E);
              return;
          }
        var zc = "";
        throw (d === void 0 || typeof d == "object" && d !== null && Object.keys(d).length === 0) && (zc += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports."), Error(
          "Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: " + ((d == null ? d : typeof d) + "." + zc)
        );
      }
    }
    function Ni(n, r, u, d, b) {
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
        r.replay = null, r.blockedSegment = I, It(n, r, d, b), I.status = Mr, F === null ? n.completedRootSegment = I : (Wa(F, I), F.parentFlushed && n.partialBoundaries.push(F));
      } finally {
        r.replay = E, r.blockedSegment = null;
      }
    }
    function zi(n, r, u, d, b, E, F, I, te, B) {
      E = B.nodes;
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
              if (mo(n, r, u, F, I, te), r.replay.pendingTasks === 1 && 0 < r.replay.nodes.length)
                throw Error(
                  "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                );
              r.replay.pendingTasks--;
            } catch ($t) {
              if (typeof $t == "object" && $t !== null && ($t === Or || typeof $t.then == "function"))
                throw r.node === b ? r.replay = B : E.splice(j, 1), $t;
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
              B = void 0, d = ge[5], F = ge[2], te = ge[3], b = ge[4] === null ? [] : ge[4][2], ge = ge[4] === null ? null : ge[4][3];
              var ye = r.keyPath, ae = r.formatContext, fn = r.row, Qn = r.replay, Ye = r.blockedBoundary, Fn = r.hoistableState, vr = I.children, yr = I.fallback, Mn = /* @__PURE__ */ new Set();
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
                ), So(I, B, $t, Ce, !1), r.replay.pendingTasks--, n.clientRenderedBoundaries.push(I);
              } finally {
                r.blockedBoundary = Ye, r.hoistableState = Fn, r.replay = Qn, r.keyPath = ye, r.formatContext = ae, r.row = fn;
              }
              I = fc(
                n,
                null,
                { nodes: b, slots: ge, pendingTasks: 0 },
                yr,
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
                Te,
                r.debugTask
              ), Wr(I), n.pingedTasks.push(I);
            }
          }
          E.splice(j, 1);
          break;
        }
      }
    }
    function Po(n, r, u, d, b) {
      d === r ? (u !== -1 || n.componentStack === null || typeof n.componentStack.type != "function" || Object.prototype.toString.call(n.componentStack.type) !== "[object GeneratorFunction]" || Object.prototype.toString.call(d) !== "[object Generator]") && (Mc || console.error(
        "Using Iterators as children is unsupported and will likely yield unexpected results because enumerating a generator mutates it. You may convert it to an array with `Array.from()` or the `[...spread]` operator before rendering. You can also use an Iterable that can iterate multiple times over the same items."
      ), Mc = !0) : r.entries !== b || oi || (console.error(
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
              var b = u.type, E = u.key;
              u = u.props;
              var F = u.ref;
              F = F !== void 0 ? F : null;
              var I = r.debugTask, te = dt(b);
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
                  b,
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
                b,
                u,
                F,
                r.replay
              ) : I ? I.run(
                mo.bind(
                  null,
                  n,
                  r,
                  B,
                  b,
                  u,
                  F
                )
              ) : mo(n, r, B, b, u, F);
              return;
            case Dt:
              throw Error(
                "Portals are not currently supported by the server renderer. Render them conditionally so that they only appear on the client render."
              );
            case El:
              if (b = Ms(u), n.status === 12) throw null;
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
              wl(u),
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
        for (var I = r.replay, te = I.nodes, B = 0; B < te.length; B++) {
          var j = te[B];
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
            r.replay = I, te.splice(B, 1);
            break;
          }
        }
        r.keyPath = b, r.componentStack = E, r.debugTask = F;
        return;
      }
      if (I = r.treeContext, te = u.length, r.replay !== null && (B = r.replay.slots, B !== null && typeof B == "object")) {
        for (d = 0; d < te; d++)
          j = u[d], r.treeContext = Cn(
            I,
            te,
            d
          ), Ce = B[d], typeof Ce == "number" ? (Ni(n, r, Ce, j, d), delete B[d]) : It(n, r, j, d);
        r.treeContext = I, r.keyPath = b, r.componentStack = E, r.debugTask = F;
        return;
      }
      for (B = 0; B < te; B++)
        d = u[B], Mt(n, r, d), r.treeContext = Cn(I, te, B), It(n, r, d, B);
      r.treeContext = I, r.keyPath = b, r.componentStack = E, r.debugTask = F;
    }
    function Vt(n, r, u) {
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
          var F = Vt(
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
    function Ha(n, r) {
      n = n.trackedPostpones, n !== null && (r = r.trackedContentKeyPath, r !== null && (r = n.workingMap.get(r), r !== void 0 && (r.length = 4, r[2] = [], r[3] = null)));
    }
    function Ti(n, r, u) {
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
        Te,
        r.debugTask
      );
    }
    function Hi(n, r, u) {
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
        Te,
        r.debugTask
      );
    }
    function It(n, r, u, d) {
      var b = r.formatContext, E = r.context, F = r.keyPath, I = r.treeContext, te = r.componentStack, B = r.debugTask, j = r.blockedSegment;
      if (j === null) {
        j = r.replay;
        try {
          return $e(n, r, u, d);
        } catch (ye) {
          if (sr(), u = ye === Or ? ac() : ye, n.status !== 12 && typeof u == "object" && u !== null) {
            if (typeof u.then == "function") {
              d = ye === Or ? Jl() : null, n = Ti(
                n,
                r,
                d
              ).ping, u.then(n, n), r.formatContext = b, r.context = E, r.keyPath = F, r.treeContext = I, r.componentStack = te, r.replay = j, r.debugTask = B, Yn(E);
              return;
            }
            if (u.message === "Maximum call stack size exceeded") {
              u = ye === Or ? Jl() : null, u = Ti(n, r, u), n.pingedTasks.push(u), r.formatContext = b, r.context = E, r.keyPath = F, r.treeContext = I, r.componentStack = te, r.replay = j, r.debugTask = B, Yn(E);
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
              j = u, u = ye === Or ? Jl() : null, n = Hi(n, r, u).ping, j.then(n, n), r.formatContext = b, r.context = E, r.keyPath = F, r.treeContext = I, r.componentStack = te, r.debugTask = B, Yn(E);
              return;
            }
            if (u.message === "Maximum call stack size exceeded") {
              j = ye === Or ? Jl() : null, j = Hi(n, r, j), n.pingedTasks.push(j), r.formatContext = b, r.context = E, r.keyPath = F, r.treeContext = I, r.componentStack = te, r.debugTask = B, Yn(E);
              return;
            }
          }
        }
      }
      throw r.formatContext = b, r.context = E, r.keyPath = F, r.treeContext = I, Yn(E), u;
    }
    function Bi(n) {
      var r = n.blockedBoundary, u = n.blockedSegment;
      u !== null && (u.status = Nl, $l(this, r, n.row, u));
    }
    function Ui(n, r, u, d, b, E, F, I) {
      for (var te = 0; te < u.length; te++) {
        var B = u[te];
        if (B.length === 4)
          Ui(
            n,
            r,
            B[2],
            B[3],
            b,
            E,
            F,
            I
          );
        else {
          var j = n;
          B = B[5];
          var ge = b, Ce = E, ye = F, ae = I, fn = Zc(
            j,
            null,
            /* @__PURE__ */ new Set(),
            null,
            null
          );
          fn.parentFlushed = !0, fn.rootSegmentID = B, fn.status = ar, So(
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
        if (r.status !== ar && (r.status = ar, So(
          r,
          E,
          b,
          F,
          I
        ), r.parentFlushed && n.clientRenderedBoundaries.push(r)), typeof d == "object")
          for (var Qn in d) delete d[Qn];
      }
    }
    function Ba(n, r, u) {
      var d = n.blockedBoundary, b = n.blockedSegment;
      if (b !== null) {
        if (b.status === 6) return;
        b.status = Nl;
      }
      var E = ca(n.componentStack), F = n.node;
      if (F !== null && typeof F == "object" && mu(n, F._debugInfo), d === null) {
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
            return Yr(r, u, E, n.debugTask), ua(r, F, n, b), d.fallbackAbortableTasks.forEach(function(I) {
              return Ba(I, r, u);
            }), d.fallbackAbortableTasks.clear(), $l(r, d, n.row, b);
          d.status = ar, b = Yr(
            r,
            u,
            E,
            n.debugTask
          ), d.status = ar, So(d, b, u, E, !0), Ha(r, d), d.parentFlushed && r.clientRenderedBoundaries.push(d);
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
          var b = u.headers;
          if (b) {
            u.headers = null;
            var E = b.preconnects;
            if (b.fontPreloads && (E && (E += ", "), E += b.fontPreloads), b.highImagePreloads && (E && (E += ", "), E += b.highImagePreloads), !r) {
              var F = u.styles.values(), I = F.next();
              e: for (; 0 < b.remainingCapacity && !I.done; I = F.next())
                for (var te = I.value.sheets.values(), B = te.next(); 0 < b.remainingCapacity && !B.done; B = te.next()) {
                  var j = B.value, ge = j.props, Ce = ge.href, ye = j.props, ae = R(
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
              var b = r.next;
              if (b !== null && (d = b.boundaries, d !== null))
                for (b.boundaries = null, b = 0; b < d.length; b++) {
                  var E = d[b];
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
        var b = zt;
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
              var Ce = void 0, ye = B;
              if (B = j, B.replay.pendingTasks !== 0) {
                Yn(B.context), Ce = Ll, Ll = B;
                try {
                  if (typeof B.replay.slots == "number" ? Ni(
                    ye,
                    B,
                    B.replay.slots,
                    B.node,
                    B.childIndex
                  ) : ql(ye, B), B.replay.pendingTasks === 1 && 0 < B.replay.nodes.length)
                    throw Error(
                      "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                    );
                  B.replay.pendingTasks--, B.abortSet.delete(B), $l(
                    ye,
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
                    var Qn = ca(B.componentStack), Ye = void 0, Fn = ye, vr = B.blockedBoundary, yr = ye.status === 12 ? ye.fatalError : ae, Mn = Qn, $t = B.replay.nodes, Si = B.replay.slots;
                    Ye = Yr(
                      Fn,
                      yr,
                      Mn,
                      B.debugTask
                    ), Ui(
                      Fn,
                      vr,
                      $t,
                      Si,
                      yr,
                      Ye,
                      Mn,
                      !1
                    ), ye.pendingRootTasks--, ye.pendingRootTasks === 0 && Ua(ye), ye.allPendingTasks--, ye.allPendingTasks === 0 && Gr(ye);
                  }
                } finally {
                  Ll = Ce;
                }
              }
            } else if (ye = Ce = void 0, Ye = j, Fn = ge, Fn.status === $i) {
              Fn.status = 6, Yn(Ye.context), ye = Ll, Ll = Ye;
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
                  var Tt = Ye.ping;
                  Bn.then(Tt, Tt);
                } else {
                  var Tn = ca(
                    Ye.componentStack
                  );
                  Ye.abortSet.delete(Ye), Fn.status = Dn;
                  var tn = Ye.blockedBoundary, Ir = Ye.row, Wn = Ye.debugTask;
                  if (Ir !== null && --Ir.pendingTasks === 0 && jn(B, Ir), B.allPendingTasks--, Ce = Yr(
                    B,
                    Bn,
                    Tn,
                    Wn
                  ), tn === null)
                    Kt(
                      B,
                      Bn,
                      Tn,
                      Wn
                    );
                  else if (tn.pendingTasks--, tn.status !== ar) {
                    tn.status = ar, So(
                      tn,
                      Ce,
                      Bn,
                      Tn,
                      !1
                    ), Ha(B, tn);
                    var br = tn.row;
                    br !== null && --br.pendingTasks === 0 && jn(B, br), tn.parentFlushed && B.clientRenderedBoundaries.push(tn), B.pendingRootTasks === 0 && B.trackedPostpones === null && tn.contentPreamble !== null && Ao(B);
                  }
                  B.allPendingTasks === 0 && Gr(B);
                }
              } finally {
                Ll = ye;
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
          hs = F, gt.H = u, gt.A = d, gt.getCurrentStack = E, u === uo && Yn(r), zt = b;
        }
      }
    }
    function Ou(n, r, u) {
      r.preambleChildren.length && u.push(r.preambleChildren);
      for (var d = !1, b = 0; b < r.children.length; b++)
        d = _u(
          n,
          r.children[b],
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
      var b = d.contentPreamble, E = d.fallbackPreamble;
      if (b === null || E === null) return !1;
      switch (d.status) {
        case Mr:
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
        ), b = n.renderState.preamble;
        d === !1 || b.headChunks && b.bodyChunks ? n.completedPreambleSegments = r : n.byteSize = u;
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
          var b = !0, E = u.chunks, F = 0;
          u = u.children;
          for (var I = 0; I < u.length; I++) {
            for (b = u[I]; F < b.index; F++)
              r.push(E[F]);
            b = Oo(n, r, b, d);
          }
          for (; F < E.length - 1; F++)
            r.push(E[F]);
          return F < E.length && (b = r.push(E[F])), b;
        case Nl:
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
          var F = b.errorDigest, I = b.errorMessage;
          E = b.errorStack, b = b.errorComponentStack, r.push(Cc), r.push(Lo), F && (r.push(Ot), F = Me(F), r.push(F), r.push(
            ja
          )), I && (r.push(Cl), I = Me(I), r.push(I), r.push(
            ja
          )), E && (r.push(un), E = Me(E), r.push(E), r.push(
            ja
          )), b && (r.push(Ki), E = Me(b), r.push(E), r.push(
            ja
          )), r.push(No);
        }
        return Fo(n, r, u, d), n = n.renderState.generateStaticMarkup ? !0 : r.push(pa), n;
      }
      if (b.status !== Mr)
        return b.status === $i && (b.rootSegmentID = n.nextSegmentId++), 0 < b.completedSegments.length && n.partialBoundaries.push(b), Xt(
          r,
          n.renderState,
          b.rootSegmentID
        ), d && an(d, b.fallbackState), Fo(n, r, u, d), r.push(pa);
      if (!Ic && cc(n, b) && ho + b.byteSize > n.progressiveChunkSize)
        return b.rootSegmentID = n.nextSegmentId++, n.completedBoundaries.push(b), Xt(
          r,
          n.renderState,
          b.rootSegmentID
        ), Fo(n, r, u, d), r.push(pa);
      if (ho += b.byteSize, d && an(d, b.contentState), u = b.row, u !== null && cc(n, b) && --u.pendingTasks === 0 && jn(n, u), n.renderState.generateStaticMarkup || r.push(Ji), u = b.completedSegments, u.length !== 1)
        throw Error(
          "A previously unvisited boundary must have exactly one root segment. This is a bug in React."
        );
      return Oo(n, r, u[0], d), n = n.renderState.generateStaticMarkup ? !0 : r.push(pa), n;
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
      return n.stylesToHoist = !1, r.push(n.startInlineScript), r.push(sn), E ? ((d.instructions & T) === o && (d.instructions |= T, r.push(Ra)), (d.instructions & g) === o && (d.instructions |= g, r.push(Nt)), (d.instructions & k) === o ? (d.instructions |= k, r.push(Pc)) : r.push(Ac)) : ((d.instructions & g) === o && (d.instructions |= g, r.push(Nt)), r.push(iu)), d = b.toString(16), r.push(n.boundaryPrefix), r.push(d), r.push(au), r.push(n.segmentPrefix), r.push(d), E ? (r.push(Wu), aa(r, u)) : r.push(ou), u = r.push(cu), Xl(r, n) && u;
    }
    function fa(n, r, u, d) {
      if (d.status === Aa) return !0;
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
      ) : (jt(n, r, d, b), u = n.resumableState, n = n.renderState, r.push(n.startInlineScript), r.push(sn), (u.instructions & f) === o ? (u.instructions |= f, r.push(Hu)) : r.push(lu), r.push(n.segmentPrefix), E = E.toString(16), r.push(E), r.push(Bu), r.push(n.placeholderPrefix), r.push(E), r = r.push(Uu), r);
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
            var E = n.resumableState, F = n.renderState, I = F.preamble, te = I.htmlChunks, B = I.headChunks, j;
            if (te) {
              for (j = 0; j < te.length; j++)
                r.push(te[j]);
              if (B)
                for (j = 0; j < B.length; j++)
                  r.push(B[j]);
              else {
                var ge = kt("head");
                r.push(ge), r.push(sn);
              }
            } else if (B)
              for (j = 0; j < B.length; j++)
                r.push(B[j]);
            var Ce = F.charsetChunks;
            for (j = 0; j < Ce.length; j++)
              r.push(Ce[j]);
            Ce.length = 0, F.preconnects.forEach(Nn, r), F.preconnects.clear();
            var ye = F.viewportChunks;
            for (j = 0; j < ye.length; j++)
              r.push(ye[j]);
            ye.length = 0, F.fontPreloads.forEach(Nn, r), F.fontPreloads.clear(), F.highImagePreloads.forEach(Nn, r), F.highImagePreloads.clear(), re = F, F.styles.forEach(ht, r), re = null;
            var ae = F.importMapChunks;
            for (j = 0; j < ae.length; j++)
              r.push(ae[j]);
            ae.length = 0, F.bootstrapScripts.forEach(Nn, r), F.scripts.forEach(Nn, r), F.scripts.clear(), F.bulkPreloads.forEach(Nn, r), F.bulkPreloads.clear(), E.instructions |= P;
            var fn = F.hoistableChunks;
            for (j = 0; j < fn.length; j++)
              r.push(fn[j]);
            for (E = fn.length = 0; E < b.length; E++) {
              var Qn = b[E];
              for (F = 0; F < Qn.length; F++)
                Oo(n, r, Qn[F], null);
            }
            var Ye = n.renderState.preamble, Fn = Ye.headChunks;
            if (Ye.htmlChunks || Fn) {
              var vr = mt("head");
              r.push(vr);
            }
            var yr = Ye.bodyChunks;
            if (yr)
              for (b = 0; b < yr.length; b++)
                r.push(yr[b]);
            Oo(n, r, d, null), n.completedRootSegment = null;
            var Mn = n.renderState;
            if (n.allPendingTasks !== 0 || n.clientRenderedBoundaries.length !== 0 || n.completedBoundaries.length !== 0 || n.trackedPostpones !== null && (n.trackedPostpones.rootNodes.length !== 0 || n.trackedPostpones.rootSlots !== null)) {
              var $t = n.resumableState;
              if (($t.instructions & V) === o) {
                if ($t.instructions |= V, r.push(Mn.startInlineScript), ($t.instructions & P) === o) {
                  $t.instructions |= P;
                  var Si = "_" + $t.idPrefix + "R_";
                  r.push(Uo);
                  var Jr = Me(Si);
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
            var Tt = Xn[u];
            _e = r;
            var Tn = n.resumableState, tn = n.renderState, Ir = Tt.rootSegmentID, Wn = Tt.errorDigest, br = Tt.errorMessage, ct = Tt.errorStack, al = Tt.errorComponentStack;
            _e.push(tn.startInlineScript), _e.push(sn), (Tn.instructions & T) === o ? (Tn.instructions |= T, _e.push(_l)) : _e.push(cs), _e.push(tn.boundaryPrefix);
            var Jo = Ir.toString(16);
            if (_e.push(Jo), _e.push(to), Wn || br || ct || al) {
              _e.push(Fc);
              var ol = Pt(
                Wn || ""
              );
              _e.push(ol);
            }
            if (br || ct || al) {
              _e.push(Fc);
              var mi = Pt(
                br || ""
              );
              _e.push(mi);
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
              Xn = n, Tt = r;
              var c = t[u];
              ho = c.byteSize;
              var h = c.completedSegments;
              for (or = 0; or < h.length; or++)
                if (!fa(
                  Xn,
                  Tt,
                  c,
                  h[or]
                )) {
                  or++, h.splice(0, or);
                  var y = !1;
                  break e;
                }
              h.splice(0, or);
              var x = c.row;
              x !== null && x.together && c.pendingTasks === 1 && (x.pendingTasks === 1 ? Pu(
                Xn,
                x,
                x.hoistables
              ) : x.pendingTasks--), y = rr(
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
          t.splice(0, u), Ic = !1;
          var m = n.completedBoundaries;
          for (u = 0; u < m.length; u++)
            if (!ls(n, r, m[u])) {
              n.destination = null, u++, m.splice(0, u);
              return;
            }
          m.splice(0, u);
        }
      } finally {
        Ic = !1, n.allPendingTasks === 0 && n.clientRenderedBoundaries.length === 0 && n.completedBoundaries.length === 0 && (n.flushScheduled = !1, u = n.resumableState, u.hasBody && (t = mt("body"), r.push(t)), u.hasHtml && (u = mt("html"), r.push(u)), n.abortableTasks.size !== 0 && console.error(
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
          n.fatalError = d, u.forEach(function(b) {
            var E = Ll, F = gt.getCurrentStack;
            Ll = b, gt.getCurrentStack = Kl;
            try {
              Ba(b, n, d);
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
      var b = !1, E = null, F = "", I = !1;
      if (r = rn(
        r ? r.identifierPrefix : void 0
      ), n = ko(
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
          b = !0, E = te;
        }
      }), b && E !== d) throw E;
      if (!I)
        throw Error(
          "A component suspended while responding to synchronous input. This will cause the UI to be replaced with a loading indicator. To fix, updates that suspend should be wrapped with startTransition."
        );
      return F;
    }
    var Mu = _s(), Es = yf(), Ya = /* @__PURE__ */ Symbol.for("react.transitional.element"), Dt = /* @__PURE__ */ Symbol.for("react.portal"), pi = /* @__PURE__ */ Symbol.for("react.fragment"), vc = /* @__PURE__ */ Symbol.for("react.strict_mode"), yc = /* @__PURE__ */ Symbol.for("react.profiler"), Qc = /* @__PURE__ */ Symbol.for("react.consumer"), Tl = /* @__PURE__ */ Symbol.for("react.context"), pl = /* @__PURE__ */ Symbol.for("react.forward_ref"), rl = /* @__PURE__ */ Symbol.for("react.suspense"), xl = /* @__PURE__ */ Symbol.for("react.suspense_list"), Gn = /* @__PURE__ */ Symbol.for("react.memo"), El = /* @__PURE__ */ Symbol.for("react.lazy"), lt = /* @__PURE__ */ Symbol.for("react.scope"), ni = /* @__PURE__ */ Symbol.for("react.activity"), Jc = /* @__PURE__ */ Symbol.for("react.legacy_hidden"), Kc = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), jc = /* @__PURE__ */ Symbol.for("react.view_transition"), bc = Symbol.iterator, Yi = Array.isArray, wc = /* @__PURE__ */ new WeakMap(), Tc = /* @__PURE__ */ new WeakMap(), Xr = /* @__PURE__ */ Symbol.for("react.client.reference"), it = Object.assign, Sn = Object.prototype.hasOwnProperty, va = RegExp(
      "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    ), Ga = {}, Xa = {}, ya = new Set(
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
    ), xi = !1, pc = {
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
    ), Va = /^(?:webkit|moz|o)[A-Z]/, hr = /^-ms-/, ir = /-(.)/g, ba = /;\s*$/, qn = {}, Hn = {}, Qa = !1, Mo = !1, $c = /["'&<>]/, Io = /([A-Z])/g, Lu = /^ms-/, Cs = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i, gt = Mu.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Xi = Es.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, os = Object.freeze({
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
              var b, E;
              (E = u && 0 < u.remainingCapacity) && (E = (b = "<" + L(n) + ">; rel=dns-prefetch", 0 <= (u.remainingCapacity -= b.length + 2))), E ? (d.resets.dns[n] = M, u.preconnects && (u.preconnects += ", "), u.preconnects += b) : (b = [], me(b, { href: n, rel: "dns-prefetch" }), d.preconnects.add(b));
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
              d.connectResources[E][n] = M, d = b.headers;
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
              I ? (b.resets.connect[E][n] = M, d.preconnects && (d.preconnects += ", "), d.preconnects += F) : (E = [], me(E, {
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
                  var F = u.imageSrcSet, I = u.imageSizes, te = u.fetchPriority;
                var B = F ? F + `
` + (I || "") : n;
                if (b.imageResources.hasOwnProperty(B)) return;
                b.imageResources[B] = G, b = E.headers;
                var j;
                b && 0 < b.remainingCapacity && typeof F != "string" && te === "high" && (j = R(n, r, u), 0 <= (b.remainingCapacity -= j.length + 2)) ? (E.resets.image[B] = G, b.highImagePreloads && (b.highImagePreloads += ", "), b.highImagePreloads += j) : (b = [], me(
                  b,
                  it(
                    {
                      rel: "preload",
                      href: F ? void 0 : n,
                      as: r
                    },
                    u
                  )
                ), te === "high" ? E.highImagePreloads.add(b) : (E.bulkPreloads.add(b), E.preloads.images.set(B, b)));
                break;
              case "style":
                if (b.styleResources.hasOwnProperty(n)) return;
                F = [], me(
                  F,
                  it({ rel: "preload", href: n, as: r }, u)
                ), b.styleResources[n] = !u || typeof u.crossOrigin != "string" && typeof u.integrity != "string" ? G : [u.crossOrigin, u.integrity], E.preloads.stylesheets.set(n, F), E.bulkPreloads.add(F);
                break;
              case "script":
                if (b.scriptResources.hasOwnProperty(n)) return;
                F = [], E.preloads.scripts.set(n, F), E.bulkPreloads.add(F), me(
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
                F[n] = G, (b = E.headers) && 0 < b.remainingCapacity && r === "font" && (B = R(n, r, u), 0 <= (b.remainingCapacity -= B.length + 2)) ? (E.resets.font[n] = G, b.fontPreloads && (b.fontPreloads += ", "), b.fontPreloads += B) : (b = [], n = it(
                  { rel: "preload", href: n, as: r },
                  u
                ), me(b, n), r) === "font" ? E.fontPreloads.add(b) : E.bulkPreloads.add(b);
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
            me(
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
            E !== M && (d.scriptResources[n] = M, r = it({ src: n, async: !0 }, r), E && (E.length === 2 && yl(r, E), n = b.preloads.scripts.get(n)) && (n.length = 0), n = [], b.scripts.add(n), Ct(n, r), Wi(u));
          }
        } else i.X(n, r);
      },
      S: function(n, r, u) {
        var d = zt || null;
        if (d) {
          var b = d.resumableState, E = d.renderState;
          if (n) {
            r = r || "default";
            var F = E.styles.get(r), I = b.styleResources.hasOwnProperty(n) ? b.styleResources[n] : void 0;
            I !== M && (b.styleResources[n] = M, F || (F = {
              precedence: Me(r),
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
            }, I && (I.length === 2 && yl(r.props, I), (E = E.preloads.stylesheets.get(n)) && 0 < E.length ? E.length = 0 : r.state = C), F.sheets.set(n, r), Wi(d));
          }
        } else i.S(n, r, u);
      },
      M: function(n, r) {
        var u = zt || null;
        if (u) {
          var d = u.resumableState, b = u.renderState;
          if (n) {
            var E = d.moduleScriptResources.hasOwnProperty(n) ? d.moduleScriptResources[n] : void 0;
            E !== M && (d.moduleScriptResources[n] = M, r = it(
              { src: n, type: "module", async: !0 },
              r
            ), E && (E.length === 2 && yl(r, E), n = b.preloads.moduleScripts.get(n)) && (n.length = 0), n = [], b.scripts.add(n), Ct(n, r), Wi(u));
          }
        } else i.M(n, r);
      }
    };
    var o = 0, f = 1, g = 2, T = 4, k = 8, P = 32, V = 64, M = null, G = [];
    Object.freeze(G);
    var re = null, $ = "<\/script>", ve = /(<\/|<)(s)(cript)/gi, De = {}, on = 0, Ze = 1, He = 2, je = 3, Xe = 4, at = 5, cn = 6, wn = 7, _n = 8, en = 9, vt = /* @__PURE__ */ new Map(), mn = ' style="', Rr = ":", In = ";", En = " ", Pn = '="', qe = '"', An = '=""', qt = Me(
      "javascript:throw new Error('React form unexpectedly submitted.')"
    ), sn = ">", wa = "/>", Zi = !1, Cr = !1, Pl = !1, Al = !1, Fl = !1, Ei = !1, Vi = !1, Qt = !1, Ja = !1, Ka = !1, xc = !1, eu = `addEventListener("submit",function(a){if(!a.defaultPrevented){var c=a.target,d=a.submitter,e=c.action,b=d;if(d){var f=d.getAttribute("formAction");null!=f&&(e=f,b=null)}"javascript:throw new Error('React form unexpectedly submitted.')"===e&&(a.preventDefault(),b?(a=document.createElement("input"),a.name=b.name,a.value=b.value,b.parentNode.insertBefore(a,b),b=new FormData(c),a.parentNode.removeChild(a)):b=new FormData(c),a=c.ownerDocument||c,(a.$$reactFormReplay=a.$$reactFormReplay||[]).push(c,d,b))}});`, Do = /(<\/|<)(s)(tyle)/gi, Ta = `
`, kr = /^[a-zA-Z][a-zA-Z:_\.\-\d]*$/, Ec = /* @__PURE__ */ new Map(), Sr = /* @__PURE__ */ new Map(), Rl = "requestAnimationFrame(function(){$RT=performance.now()});", Qi = '<template id="', Rc = '"></template>', Ji = "<!--$-->", nu = '<!--$?--><template id="', Lt = '"></template>', Cc = "<!--$!-->", pa = "<!--/$-->", Lo = "<template", ja = '"', Ot = ' data-dgst="', Cl = ' data-msg="', un = ' data-stck="', Ki = ' data-cstck="', No = "></template>", xa = '<div hidden id="', yt = '">', Zr = "</div>", Ea = '<svg aria-hidden="true" style="display:none" id="', qa = '">', Ol = "</svg>", dr = '<math aria-hidden="true" style="display:none" id="', zo = '">', mr = "</math>", Nu = '<table hidden id="', $a = '">', kc = "</table>", tu = '<table hidden><tbody id="', ru = '">', Ri = "</tbody></table>", eo = '<table hidden><tr id="', no = '">', Pr = "</tr></table>", Sc = '<table hidden><colgroup id="', mc = '">', zu = "</colgroup></table>", Hu = '$RS=function(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};$RS("', lu = '$RS("', Bu = '","', Uu = '")<\/script>', Nt = `$RB=[];$RV=function(a){$RT=performance.now();for(var b=0;b<a.length;b+=2){var c=a[b],e=a[b+1];null!==e.parentNode&&e.parentNode.removeChild(e);var f=c.parentNode;if(f){var g=c.previousSibling,h=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d||"/&"===d)if(0===h)break;else h--;else"$"!==d&&"$?"!==d&&"$~"!==d&&"$!"!==d&&"&"!==d||h++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;e.firstChild;)f.insertBefore(e.firstChild,c);g.data="$";g._reactRetry&&requestAnimationFrame(g._reactRetry)}}a.length=0};
$RC=function(a,b){if(b=document.getElementById(b))(a=document.getElementById(a))?(a.previousSibling.data="$~",$RB.push(a,b),2===$RB.length&&("number"!==typeof $RT?requestAnimationFrame($RV.bind(null,$RB)):(a=performance.now(),setTimeout($RV.bind(null,$RB),2300>a&&2E3<a?2300-a:$RT+300-a)))):b.parentNode.removeChild(b)};`, iu = '$RC("', Pc = `$RM=new Map;$RR=function(n,w,p){function u(q){this._p=null;q()}for(var r=new Map,t=document,h,b,e=t.querySelectorAll("link[data-precedence],style[data-precedence]"),v=[],k=0;b=e[k++];)"not all"===b.getAttribute("media")?v.push(b):("LINK"===b.tagName&&$RM.set(b.getAttribute("href"),b),r.set(b.dataset.precedence,h=b));e=0;b=[];var l,a;for(k=!0;;){if(k){var f=p[e++];if(!f){k=!1;e=0;continue}var c=!1,m=0;var d=f[m++];if(a=$RM.get(d)){var g=a._p;c=!0}else{a=t.createElement("link");a.href=d;a.rel=
"stylesheet";for(a.dataset.precedence=l=f[m++];g=f[m++];)a.setAttribute(g,f[m++]);g=a._p=new Promise(function(q,x){a.onload=u.bind(a,q);a.onerror=u.bind(a,x)});$RM.set(d,a)}d=a.getAttribute("media");!g||d&&!matchMedia(d).matches||b.push(g);if(c)continue}else{a=v[e++];if(!a)break;l=a.getAttribute("data-precedence");a.removeAttribute("media")}c=r.get(l)||h;c===h&&(h=a);r.set(l,a);c?c.parentNode.insertBefore(a,c.nextSibling):(c=t.head,c.insertBefore(a,c.firstChild))}if(p=document.getElementById(n))p.previousSibling.data=
"$~";Promise.all(b).then($RC.bind(null,n,w),$RX.bind(null,n,"CSS failed to load"))};$RR("`, Ac = '$RR("', au = '","', Wu = '",', ou = '"', cu = ")<\/script>", Ra = '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};', _l = '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};;$RX("', cs = '$RX("', to = '"', Fc = ",", ri = ")<\/script>", Ho = /[<\u2028\u2029]/g, Ca = /[&><\u2028\u2029]/g, Oc = ' media="not all" data-precedence="', ka = '" data-href="', us = '">', ss = "</style>", li = !1, Bo = !0, kl = [], Sa = ' data-precedence="', ro = '" data-href="', Ml = " ", Yu = '">', fs = "</style>", Uo = ' id="', l = "[", a = ",[", s = ",", v = "]", w = 0, C = 1, S = 2, z = 3, O = /[<>\r\n]/g, H = /["';,\r\n]/g, Z = "", K = Function.prototype.bind, xe = /* @__PURE__ */ Symbol.for("react.client.reference"), Te = {};
    Object.freeze(Te);
    var yn = {}, Ve = null, bn = {}, bt = {}, $n = /* @__PURE__ */ new Set(), gr = /* @__PURE__ */ new Set(), ll = /* @__PURE__ */ new Set(), Il = /* @__PURE__ */ new Set(), Qe = /* @__PURE__ */ new Set(), Ar = /* @__PURE__ */ new Set(), _t = /* @__PURE__ */ new Set(), Vr = /* @__PURE__ */ new Set(), ji = /* @__PURE__ */ new Set(), wt = {
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
    }, lo = { id: 1, overflow: "" }, Dl = Math.clz32 ? Math.clz32 : es, Fr = Math.log, ii = Math.LN2, Or = Error(
      "Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`."
    ), io = null, Wo = typeof Object.is == "function" ? Object.is : oc, Qr = null, Yo = null, _r = null, ao = null, Gu = null, ot = null, Go = !1, ai = !1, uu = 0, oo = 0, su = -1, fu = 0, Xo = null, ma = null, hu = 0, Ci = !1, co, uo = {
      readContext: Na,
      use: function(n) {
        if (n !== null && typeof n == "object") {
          if (typeof n.then == "function")
            return wl(n);
          if (n.$$typeof === Tl)
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
        Qr = di(), ot = kn();
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
    }, Sl = 0, Pa, qi, du, gu, vu, so, gs;
    ts.__reactDisabledLog = !0;
    var Xu, Zo, vs = !1, yu = new (typeof WeakMap == "function" ? WeakMap : Map)(), ks = {
      react_stack_bottom_frame: function(n, r, u) {
        return n(r, u);
      }
    }, Zu = ks.react_stack_bottom_frame.bind(ks), Ss = {
      react_stack_bottom_frame: function(n) {
        return n.render();
      }
    }, bu = Ss.react_stack_bottom_frame.bind(Ss), Vo = {
      react_stack_bottom_frame: function(n) {
        var r = n._init;
        return r(n._payload);
      }
    }, Ms = Vo.react_stack_bottom_frame.bind(Vo), Is = 0;
    if (typeof performance == "object" && typeof performance.now == "function")
      var ki = performance, ys = function() {
        return ki.now();
      };
    else {
      var Ds = Date;
      ys = function() {
        return Ds.now();
      };
    }
    var ar = 4, $i = 0, Mr = 1, Aa = 2, Nl = 3, Dn = 4, il = 5, ea = 14, zt = null, _c = {}, wu = {}, bs = {}, Qo = {}, fo = !1, Mc = !1, oi = !1, ho = 0, Ic = !1;
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
    function Se(e) {
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
          return xi(e) ? "[...]" : e !== null && e.$$typeof === Gi ? "client" : (e = Se(e), e === "Object" ? "{...}" : e);
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
          case Sn:
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
    function pn(e, t) {
      var c = Se(e);
      if (c !== "Object" && c !== "Array") return c;
      var h = -1, y = 0;
      if (xi(e))
        if (fr.has(e)) {
          var x = fr.get(e);
          c = "<" + Oe(x) + ">";
          for (var m = 0; m < e.length; m++) {
            var _ = e[m];
            _ = typeof _ == "string" ? _ : typeof _ == "object" && _ !== null ? "{" + pn(_) + "}" : "{" + be(_) + "}", "" + m === t ? (h = c.length, y = _.length, c += _) : c = 15 > _.length && 40 > c.length + _.length ? c + _ : c + "{...}";
          }
          c += "</" + Oe(x) + ">";
        } else {
          for (c = "[", x = 0; x < e.length; x++)
            0 < x && (c += ", "), m = e[x], m = typeof m == "object" && m !== null ? pn(m) : be(m), "" + x === t ? (h = c.length, y = m.length, c += m) : c = 10 > m.length && 40 > c.length + m.length ? c + m : c + "...";
          c += "]";
        }
      else if (e.$$typeof === jc)
        c = "<" + Oe(e.type) + "/>";
      else {
        if (e.$$typeof === Gi) return "client";
        if (pc.has(e)) {
          for (c = pc.get(e), c = "<" + (Oe(c) || "..."), x = Object.keys(e), m = 0; m < x.length; m++) {
            c += " ", _ = x[m], c += nn(_) + "=";
            var J = e[_], N = _ === t && typeof J == "object" && J !== null ? pn(J) : be(J);
            typeof J != "string" && (N = "{" + N + "}"), _ === t ? (h = c.length, y = N.length, c += N) : c = 10 > N.length && 40 > c.length + N.length ? c + N : c + "...";
          }
          c += ">";
        } else {
          for (c = "{", x = Object.keys(e), m = 0; m < x.length; m++)
            0 < m && (c += ", "), _ = x[m], c += nn(_) + ": ", J = e[_], J = typeof J == "object" && J !== null ? pn(J) : be(J), _ === t ? (h = c.length, y = J.length, c += J) : c = 10 > J.length && 40 > c.length + J.length ? c + J : c + "...";
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
      if (Hn.call(g, t) && g[t])
        return !0;
      var y = t.toLowerCase();
      if (y === "onfocusin" || y === "onfocusout")
        return console.error(
          "React uses onFocus and onBlur instead of onFocusIn and onFocusOut. All React events are normalized to bubble, so onFocusIn and onFocusOut are not needed/supported by React."
        ), g[t] = !0;
      if (typeof c == "function" && (e === "form" && t === "action" || e === "input" && t === "formAction" || e === "button" && t === "formAction"))
        return !0;
      if (T.test(t))
        return k.test(t) && console.error(
          "Invalid event handler property `%s`. React events use the camelCase naming convention, for example `onClick`.",
          t
        ), g[t] = !0;
      if (P.test(t) || V.test(t)) return !0;
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
      Je(e), e = "" + e;
      var t = He.exec(e);
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
    function Q(e) {
      return at.test("" + e) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : e;
    }
    function de(e) {
      return Je(e), ("" + e).replace(Ja, ce);
    }
    function pr(e, t, c, h, y, x) {
      c = typeof t == "string" ? t : t && t.script;
      var m = c === void 0 ? wa : X(
        '<script nonce="' + Pe(c) + '"'
      ), _ = typeof t == "string" ? void 0 : t && t.style, J = _ === void 0 ? Qt : X(
        '<style nonce="' + Pe(_) + '"'
      ), N = e.idPrefix, U = [], oe = e.bootstrapScriptContent, se = e.bootstrapScripts, ue = e.bootstrapModules;
      if (oe !== void 0 && (U.push(m), an(U, e), U.push(
        yt,
        ee(
          de(oe)
        ),
        Zi
      )), oe = [], h !== void 0 && (oe.push(Ka), oe.push(
        ee(
          de(JSON.stringify(h))
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
        placeholderPrefix: X(N + "P:"),
        segmentPrefix: X(N + "S:"),
        boundaryPrefix: X(N + "B:"),
        startInlineScript: m,
        startInlineStyle: J,
        preamble: he(),
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
          }, typeof x == "string" ? N.href = m = x : (N.href = m = x.src, N.integrity = J = typeof x.integrity == "string" ? x.integrity : void 0, N.crossOrigin = _ = typeof x == "string" || x.crossOrigin == null ? void 0 : x.crossOrigin === "use-credentials" ? "use-credentials" : ""), dt(
            e,
            y,
            m,
            N
          ), U.push(
            Cr,
            ee(Pe(m)),
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
          se = ue[t], m = x = void 0, _ = {
            rel: "modulepreload",
            fetchPriority: "low",
            nonce: c
          }, typeof se == "string" ? _.href = h = se : (_.href = h = se.src, _.integrity = m = typeof se.integrity == "string" ? se.integrity : void 0, _.crossOrigin = x = typeof se == "string" || se.crossOrigin == null ? void 0 : se.crossOrigin === "use-credentials" ? "use-credentials" : ""), dt(
            e,
            y,
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
          ), typeof m == "string" && U.push(
            Fl,
            ee(Pe(m)),
            un
          ), typeof x == "string" && U.push(
            Ei,
            ee(Pe(x)),
            un
          ), an(U, e), U.push(Vi);
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
    function he() {
      return { htmlChunks: null, headChunks: null, bodyChunks: null };
    }
    function p(e, t, c, h) {
      return {
        insertionMode: e,
        selectedValue: t,
        tagScope: c,
        viewTransition: h
      };
    }
    function Y(e) {
      return p(
        e === "http://www.w3.org/2000/svg" ? Sr : e === "http://www.w3.org/1998/Math/MathML" ? Rl : Do,
        null,
        0,
        null
      );
    }
    function we(e, t, c) {
      var h = e.tagScope & -25;
      switch (t) {
        case "noscript":
          return p(kr, null, h | 1, null);
        case "select":
          return p(
            kr,
            c.value != null ? c.value : c.defaultValue,
            h,
            null
          );
        case "svg":
          return p(Sr, null, h, null);
        case "picture":
          return p(kr, null, h | 2, null);
        case "math":
          return p(Rl, null, h, null);
        case "foreignObject":
          return p(kr, null, h, null);
        case "table":
          return p(Qi, null, h, null);
        case "thead":
        case "tbody":
        case "tfoot":
          return p(
            Rc,
            null,
            h,
            null
          );
        case "colgroup":
          return p(
            nu,
            null,
            h,
            null
          );
        case "tr":
          return p(
            Ji,
            null,
            h,
            null
          );
        case "head":
          if (e.insertionMode < kr)
            return p(
              Ec,
              null,
              h,
              null
            );
          break;
        case "html":
          if (e.insertionMode === Do)
            return p(
              Ta,
              null,
              h,
              null
            );
      }
      return e.insertionMode >= Qi || e.insertionMode < kr ? p(kr, null, h, null) : e.tagScope !== h ? p(
        e.insertionMode,
        e.selectedValue,
        h,
        null
      ) : e;
    }
    function pe(e) {
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
    function ke(e, t) {
      return t.tagScope & 32 && (e.instructions |= 128), p(
        t.insertionMode,
        t.selectedValue,
        t.tagScope | 12,
        pe(t.viewTransition)
      );
    }
    function Ne(e, t) {
      e = pe(t.viewTransition);
      var c = t.tagScope | 16;
      return e !== null && e.share !== "none" && (c |= 64), p(
        t.insertionMode,
        t.selectedValue,
        c,
        e
      );
    }
    function me(e, t, c, h) {
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
          var y = t[h];
          if (y != null && typeof y != "boolean" && y !== "") {
            if (h.indexOf("--") === 0) {
              var x = ee(Pe(h));
              Me(y, h), y = ee(
                Pe(("" + y).trim())
              );
            } else {
              x = h;
              var m = y;
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
              else if ($.test(m)) {
                _ = x;
                var J = m;
                De.hasOwnProperty(J) && De[J] || (De[J] = !0, console.error(
                  `Style property values shouldn't contain a semicolon. Try "%s: %s" instead.`,
                  _,
                  J.replace(
                    $,
                    ""
                  )
                ));
              }
              typeof m == "number" && (isNaN(m) ? on || (on = !0, console.error(
                "`NaN` is an invalid value for the `%s` css style property.",
                x
              )) : isFinite(m) || Ze || (Ze = !0, console.error(
                "`Infinity` is an invalid value for the `%s` css style property.",
                x
              ))), x = h, m = Cc.get(x), m !== void 0 || (m = X(
                Pe(
                  x.replace(je, "-$1").toLowerCase().replace(Xe, "-ms-")
                )
              ), Cc.set(x, m)), x = m, typeof y == "number" ? y = y === 0 || Io.has(h) ? ee("" + y) : ee(y + "px") : (Me(y, h), y = ee(
                Pe(("" + y).trim())
              ));
            }
            c ? (c = !1, e.push(
              pa,
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
            var y = h.data;
            y?.forEach(Ia);
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
    function kt(e, t, c, h, y, x, m, _) {
      var J = null;
      if (typeof h == "function") {
        _ === null || kc || (kc = !0, console.error(
          'Cannot specify a "name" prop for a button that specifies a function as a formAction. React needs it to encode which action should be invoked. It will get overridden.'
        )), y === null && x === null || ru || (ru = !0, console.error(
          "Cannot specify a formEncType or formMethod for a button that specifies a function as a formAction. React provides those automatically. They will get overridden."
        )), m === null || tu || (tu = !0, console.error(
          "Cannot specify a formTarget for a button that specifies a function as a formAction. The function will always be executed in the same window."
        ));
        var N = Ge(t, h);
        N !== null ? (_ = N.name, h = N.action || "", y = N.encType, x = N.method, m = N.target, J = N.data) : (e.push(
          Ot,
          ee("formAction"),
          Cl,
          No,
          un
        ), m = x = y = h = _ = null, Xt(t, c));
      }
      return _ != null && xn(e, "name", _), h != null && xn(e, "formAction", h), y != null && xn(e, "formEncType", y), x != null && xn(e, "formMethod", x), m != null && xn(e, "formTarget", m), J;
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
    function mt(e, t, c) {
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
      return Je(e), ("" + e).replace(Sc, fe);
    }
    function Pt(e, t, c) {
      e.push(Nn(c));
      for (var h in t)
        if (Hn.call(t, h)) {
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
      e.push(Nn("title"));
      var c = null, h = null, y;
      for (y in t)
        if (Hn.call(t, y)) {
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
      return e.push(yt), t = Array.isArray(c) ? 2 > c.length ? c[0] : null : c, typeof t != "function" && typeof t != "symbol" && t !== null && t !== void 0 && e.push(ee(Pe("" + t))), mt(e, h, c), e.push(ht("title")), null;
    }
    function Da(e, t) {
      e.push(Nn("script"));
      var c = null, h = null, y;
      for (y in t)
        if (Hn.call(t, y)) {
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
      )), mt(e, h, c), typeof c == "string" && e.push(ee(de(c))), e.push(ht("script")), null;
    }
    function vn(e, t, c) {
      e.push(Nn(c));
      var h = c = null, y;
      for (y in t)
        if (Hn.call(t, y)) {
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
      return e.push(yt), mt(e, h, c), c;
    }
    function rr(e, t, c) {
      e.push(Nn(c));
      var h = c = null, y;
      for (y in t)
        if (Hn.call(t, y)) {
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
      return e.push(yt), mt(e, h, c), typeof c == "string" ? (e.push(ee(Pe(c))), null) : c;
    }
    function Nn(e) {
      var t = Uu.get(e);
      if (t === void 0) {
        if (!Bu.test(e)) throw Error("Invalid tag: " + e);
        t = X("<" + e), Uu.set(e, t);
      }
      return t;
    }
    function rc(e, t, c, h, y, x, m, _, J) {
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
      ), _.insertionMode !== Sr && _.insertionMode !== Rl && t.indexOf("-") === -1 && t.toLowerCase() !== t && console.error(
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
          if (e.push(yt), mt(e, oe, U), typeof U == "string") {
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
          return e.push(yt), mt(e, Zn, Ue), Ue;
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
              Bt === null || mr || (mr = !0, console.error(
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
          return e.push(yt), mt(e, Bt, Ht), Ht;
        case "textarea":
          rn("textarea", c), c.value === void 0 || c.defaultValue === void 0 || dr || (console.error(
            "Textarea elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled textarea and remove one of these props. More info: https://react.dev/link/controlled-components"
          ), dr = !0), e.push(Nn("textarea"));
          var wr = null, er = null, st = null, Jt;
          for (Jt in c)
            if (Hn.call(c, Jt)) {
              var ul = c[Jt];
              if (ul != null)
                switch (Jt) {
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
                      Jt,
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
              Je(st[0]), wr = "" + st[0];
            }
            Je(st), wr = "" + st;
          }
          return typeof wr == "string" && wr[0] === `
` && e.push(lu), wr !== null && (Jn(wr, "value"), e.push(
            ee(Pe("" + wr))
          )), null;
        case "input":
          rn("input", c), e.push(Nn("input"));
          var ml = null, nr = null, pt = null, Lr = null, sl = null, Nr = null, na = null, fl = null, Ut = null, zl;
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
                    ml = cr;
                    break;
                  case "formAction":
                    nr = cr;
                    break;
                  case "formEncType":
                    pt = cr;
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
          var Vu = kt(
            e,
            h,
            y,
            nr,
            pt,
            Lr,
            sl,
            ml
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
          var Lc = kt(
            e,
            h,
            y,
            zr,
            Dc,
            Ko,
            ci,
            Hl
          );
          if (e.push(yt), Lc?.forEach(Ct, e), mt(e, Ft, Fi), typeof Fi == "string") {
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
            var Tr = Ge(
              h,
              Hr
            );
            Tr !== null ? (Hr = Tr.action || "", qo = Tr.encType, go = Tr.method, Fa = Tr.target, Oi = Tr.data, dl = Tr.name) : (e.push(
              Ot,
              ee("action"),
              Cl,
              No,
              un
            ), Fa = go = qo = Hr = null, Xt(h, y));
          }
          if (Hr != null && xn(e, "action", Hr), qo != null && xn(e, "encType", qo), go != null && xn(e, "method", go), Fa != null && xn(e, "target", Fa), e.push(yt), dl !== null && (e.push(xa), tt(e, "name", dl), e.push(Zr), Oi?.forEach(
            Ct,
            e
          )), mt(e, Nc, Bl), typeof Bl == "string") {
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
          return e.push(yt), null;
        case "object":
          e.push(Nn("object"));
          var ta = null, ws = null, Kr;
          for (Kr in c)
            if (Hn.call(c, Kr)) {
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
          if (e.push(yt), mt(e, ws, ta), typeof ta == "string") {
            e.push(
              ee(Pe(ta))
            );
            var Tu = null;
          } else Tu = ta;
          return Tu;
        case "title":
          var pu = _.tagScope & 1, Xs = _.tagScope & 4;
          if (Hn.call(c, "children")) {
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
          if (_.insertionMode === Sr || pu || c.itemProp != null)
            var bo = $r(
              e,
              c
            );
          else
            Xs ? bo = null : ($r(y.hoistableChunks, c), bo = void 0);
          return bo;
        case "link":
          var xu = _.tagScope & 1, Ls = _.tagScope & 4, ms = c.rel, jr = c.href, Mi = c.precedence;
          if (_.insertionMode === Sr || xu || c.itemProp != null || typeof ms != "string" || typeof jr != "string" || jr === "") {
            ms === "stylesheet" && typeof c.precedence == "string" && (typeof jr == "string" && jr || console.error(
              'React encountered a `<link rel="stylesheet" .../>` with a `precedence` prop and expected the `href` prop to be a non-empty string but ecountered %s instead. If your intent was to have React hoist and deduplciate this stylesheet using the `precedence` prop ensure there is a non-empty string `href` prop as well, otherwise remove the `precedence` prop.',
              jr === null ? "`null`" : jr === void 0 ? "`undefined`" : jr === "" ? "an empty string" : 'something with type "' + typeof jr + '"'
            )), Ie(e, c);
            var wo = null;
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
              wo = Ie(
                e,
                c
              );
            } else {
              var Yl = y.styles.get(Mi), Wt = h.styleResources.hasOwnProperty(
                jr
              ) ? h.styleResources[jr] : void 0;
              if (Wt !== An) {
                h.styleResources[jr] = An, Yl || (Yl = {
                  precedence: ee(Pe(Mi)),
                  rules: [],
                  hrefs: [],
                  sheets: /* @__PURE__ */ new Map()
                }, y.styles.set(Mi, Yl));
                var xt = {
                  state: ma,
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
                Yl.sheets.set(jr, xt), m && m.stylesheets.add(xt);
              } else if (Yl) {
                var Ps = Yl.sheets.get(jr);
                Ps && m && m.stylesheets.add(Ps);
              }
              J && e.push(Lt), wo = null;
            }
          else
            c.onLoad || c.onError ? wo = Ie(
              e,
              c
            ) : (J && e.push(Lt), wo = Ls ? null : Ie(y.hoistableChunks, c));
          return wo;
        case "script":
          var ec = _.tagScope & 1, Ku = c.async;
          if (typeof c.src != "string" || !c.src || !Ku || typeof Ku == "function" || typeof Ku == "symbol" || c.onLoad || c.onError || _.insertionMode === Sr || ec || c.itemProp != null)
            var nc = Da(
              e,
              c
            );
          else {
            var Hc = c.src;
            if (c.type === "module")
              var ju = h.moduleScriptResources, Bc = y.preloads.moduleScripts;
            else
              ju = h.scriptResources, Bc = y.preloads.scripts;
            var Eu = ju.hasOwnProperty(Hc) ? ju[Hc] : void 0;
            if (Eu !== An) {
              ju[Hc] = An;
              var Ru = c;
              if (Eu) {
                Eu.length === 2 && (Ru = qn({}, c), hi(Ru, Eu));
                var Ts = Bc.get(Hc);
                Ts && (Ts.length = 0);
              }
              var As = [];
              y.scripts.add(As), Da(As, Ru);
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
          var Uc = c.precedence, To = c.href, _a = c.nonce;
          if (_.insertionMode === Sr || Ns || c.itemProp != null || typeof Uc != "string" || typeof To != "string" || To === "") {
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
            e.push(yt);
            var Fs = Array.isArray(gl) ? 2 > gl.length ? gl[0] : null : gl;
            typeof Fs != "function" && typeof Fs != "symbol" && Fs !== null && Fs !== void 0 && e.push(
              ee(xr(Fs))
            ), mt(
              e,
              Cu,
              gl
            ), e.push(ht("style"));
            var cf = null;
          } else {
            To.includes(" ") && console.error(
              'React expected the `href` prop for a <style> tag opting into hoisting semantics using the `precedence` prop to not have any spaces but ecountered spaces instead. using spaces in this prop will cause hydration of this style to fail on the client. The href for the <style> where this ocurred is "%s".',
              To
            );
            var ps = y.styles.get(Uc), uf = h.styleResources.hasOwnProperty(To) ? h.styleResources[To] : void 0;
            if (uf !== An) {
              h.styleResources[To] = An, uf && console.error(
                'React encountered a hoistable style tag for the same href as a preload: "%s". When using a style tag to inline styles you should not also preload it as a stylsheet.',
                To
              ), ps || (ps = {
                precedence: ee(
                  Pe(Uc)
                ),
                rules: [],
                hrefs: [],
                sheets: /* @__PURE__ */ new Map()
              }, y.styles.set(
                Uc,
                ps
              ));
              var Hs = y.nonce.style;
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
                ), ps.hrefs.push(
                  ee(Pe(To))
                );
                var Vs = ps.rules, Qs = null, Sf = null, sf;
                for (sf in c)
                  if (Hn.call(c, sf)) {
                    var bf = c[sf];
                    if (bf != null)
                      switch (sf) {
                        case "children":
                          Qs = bf;
                          break;
                        case "dangerouslySetInnerHTML":
                          Sf = bf;
                      }
                  }
                var js = Array.isArray(Qs) ? 2 > Qs.length ? Qs[0] : null : Qs;
                typeof js != "function" && typeof js != "symbol" && js !== null && js !== void 0 && Vs.push(
                  ee(xr(js))
                ), mt(Vs, Sf, Qs);
              }
            }
            ps && m && m.styles.add(ps), J && e.push(Lt), cf = void 0;
          }
          return cf;
        case "meta":
          var Jf = _.tagScope & 1, Kf = _.tagScope & 4;
          if (_.insertionMode === Sr || Jf || c.itemProp != null)
            var mf = Pt(
              e,
              c,
              "meta"
            );
          else
            J && e.push(Lt), mf = Kf ? null : typeof c.charSet == "string" ? Pt(y.charsetChunks, c, "meta") : c.name === "viewport" ? Pt(y.viewportChunks, c, "meta") : Pt(
              y.hoistableChunks,
              c,
              "meta"
            );
          return mf;
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
` ? e.push(lu, ee(Os)) : (Je(Os), e.push(ee("" + Os))));
          }
          return typeof qs == "string" && qs[0] === `
` && e.push(lu), qs;
        case "img":
          var jf = _.tagScope & 3, ra = c.src, Ii = c.srcSet;
          if (!(c.loading === "lazy" || !ra && !Ii || typeof ra != "string" && ra != null || typeof Ii != "string" && Ii != null || c.fetchPriority === "low" || jf) && (typeof ra != "string" || ra[4] !== ":" || ra[0] !== "d" && ra[0] !== "D" || ra[1] !== "a" && ra[1] !== "A" || ra[2] !== "t" && ra[2] !== "T" || ra[3] !== "a" && ra[3] !== "A") && (typeof Ii != "string" || Ii[4] !== ":" || Ii[0] !== "d" && Ii[0] !== "D" || Ii[1] !== "a" && Ii[1] !== "A" || Ii[2] !== "t" && Ii[2] !== "T" || Ii[3] !== "a" && Ii[3] !== "A")) {
            m !== null && _.tagScope & 64 && (m.suspenseyImages = !0);
            var Pf = typeof c.sizes == "string" ? c.sizes : void 0, Js = Ii ? Ii + `
` + (Pf || "") : ra, wf = y.preloads.images, Bs = wf.get(Js);
            if (Bs)
              (c.fetchPriority === "high" || 10 > y.highImagePreloads.size) && (wf.delete(Js), y.highImagePreloads.add(Bs));
            else if (!h.imageResources.hasOwnProperty(Js)) {
              h.imageResources[Js] = qt;
              var Tf = c.crossOrigin, Af = typeof Tf == "string" ? Tf === "use-credentials" ? Tf : "" : void 0, Us = y.headers, pf;
              Us && 0 < Us.remainingCapacity && typeof c.srcSet != "string" && (c.fetchPriority === "high" || 500 > Us.highImagePreloads.length) && (pf = oa(ra, "image", {
                imageSrcSet: c.srcSet,
                imageSizes: c.sizes,
                crossOrigin: Af,
                integrity: c.integrity,
                nonce: c.nonce,
                type: c.type,
                fetchPriority: c.fetchPriority,
                referrerPolicy: c.refererPolicy
              }), 0 <= (Us.remainingCapacity -= pf.length + 2)) ? (y.resets.image[Js] = qt, Us.highImagePreloads && (Us.highImagePreloads += ", "), Us.highImagePreloads += pf) : (Bs = [], Ie(Bs, {
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
              }), c.fetchPriority === "high" || 10 > y.highImagePreloads.size ? y.highImagePreloads.add(Bs) : (y.bulkPreloads.add(Bs), wf.set(Js, Bs)));
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
          if (_.insertionMode < kr) {
            var xf = x || y.preamble;
            if (xf.headChunks)
              throw Error("The `<head>` tag may only be rendered once.");
            x !== null && e.push(mc), xf.headChunks = [];
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
          if (_.insertionMode < kr) {
            var Ef = x || y.preamble;
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
            var Rf = x || y.preamble;
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
                var ku = c[Ks];
                if (ku != null) {
                  var If = Ks;
                  switch (Ks) {
                    case "children":
                      Cf = ku;
                      break;
                    case "dangerouslySetInnerHTML":
                      Mf = ku;
                      break;
                    case "style":
                      Rt(e, ku);
                      break;
                    case "suppressContentEditableWarning":
                    case "suppressHydrationWarning":
                    case "ref":
                      break;
                    case "className":
                      If = "class";
                    default:
                      if (Et(Ks) && typeof ku != "function" && typeof ku != "symbol" && ku !== !1) {
                        if (ku === !0)
                          ku = "";
                        else if (typeof ku == "object")
                          continue;
                        e.push(
                          Ot,
                          ee(If),
                          Cl,
                          ee(
                            Pe(ku)
                          ),
                          un
                        );
                      }
                  }
                }
              }
            return e.push(yt), mt(
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
    function po(e, t) {
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
        case Ta:
        case Ec:
        case kr:
          return A(e, ss), A(e, t.segmentPrefix), A(e, ee(h.toString(16))), D(e, li);
        case Sr:
          return A(e, kl), A(e, t.segmentPrefix), A(e, ee(h.toString(16))), D(e, Sa);
        case Rl:
          return A(e, Ml), A(e, t.segmentPrefix), A(e, ee(h.toString(16))), D(e, Yu);
        case Qi:
          return A(e, Uo), A(e, t.segmentPrefix), A(e, ee(h.toString(16))), D(e, l);
        case Rc:
          return A(e, s), A(e, t.segmentPrefix), A(e, ee(h.toString(16))), D(e, v);
        case Ji:
          return A(e, C), A(e, t.segmentPrefix), A(e, ee(h.toString(16))), D(e, S);
        case nu:
          return A(e, O), A(e, t.segmentPrefix), A(e, ee(h.toString(16))), D(e, H);
        default:
          throw Error("Unknown insertion mode. This is a bug in React.");
      }
    }
    function fi(e, t) {
      switch (t.insertionMode) {
        case Do:
        case Ta:
        case Ec:
        case kr:
          return D(e, Bo);
        case Sr:
          return D(e, ro);
        case Rl:
          return D(e, fs);
        case Qi:
          return D(e, a);
        case Rc:
          return D(e, w);
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
    function yl(e) {
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
      return Qr = !1, Yo = !0, sn = c, t.styles.forEach(yl, e), sn = null, t.stylesheets.forEach(R), Qr && (c.stylesToHoist = !0), Yo;
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
      if (e.state === ma) {
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
            var y = h.props["data-precedence"], x = h.props, m = Q("" + h.props.href);
            A(
              e,
              ee(Vl(m))
            ), Jn(y, "precedence"), y = "" + y, A(e, fu), A(
              e,
              ee(Vl(y))
            );
            for (var _ in x)
              if (Hn.call(x, _) && (y = x[_], y != null))
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
                      y
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
        case Tc:
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
          case Sn:
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
    function zn(e, t) {
      var c = t.parent;
      if (c === null)
        throw Error(
          "The depth must equal at least at zero before reaching the root. This is a bug in React."
        );
      e.depth === c.depth ? ic(e, c) : zn(e, c), t.context._currentValue = t.value;
    }
    function kn(e) {
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
      var y = 32 - Vo(h) - 1;
      h &= ~(1 << y), c += 1;
      var x = 32 - Vo(t) + y;
      if (30 < x) {
        var m = y - y % 5;
        return x = (h & (1 << m) - 1).toString(32), h >>= m, y -= m, {
          id: 1 << 32 - Vo(t) + y | c << y | h,
          overflow: x + e
        };
      }
      return {
        id: 1 << x | c << y | h,
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
          throw ys = t, ki;
      }
    }
    function Su() {
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
      if (0 < Mc)
        throw Error("Rendered more hooks than during the previous render");
      return { memoizedState: null, queue: null, next: null };
    }
    function Eo() {
      return Dn === null ? Nl === null ? (il = !1, Nl = Dn = Gc()) : (il = !0, Dn = Nl) : Dn.next === null ? (il = !1, Dn = Dn.next = Gc()) : (il = !0, Dn = Dn.next), Dn;
    }
    function wl() {
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
              var y = h.action;
              oi = !0, c = e(c, y), oi = !1, h = h.next;
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
              for (var y = 0; y < h.length && y < t.length; y++)
                if (!Ds(t[y], h[y])) {
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
      var h = _c++, y = Mr;
      if (typeof e.$$FORM_ACTION == "function") {
        var x = null, m = Aa;
        y = y.formState;
        var _ = e.$$IS_SIGNATURE_EQUAL;
        if (y !== null && typeof _ == "function") {
          var J = y[1];
          _.call(e, y[2], y[3]) && (x = c !== void 0 ? "p" + c : "k" + Re(
            JSON.stringify([
              m,
              null,
              h
            ]),
            0
          ), J === x && (wu = h, t = y[0]));
        }
        var N = e.bind(null, t);
        return e = function(oe) {
          N(oe);
        }, typeof N.$$FORM_ACTION == "function" && (e.$$FORM_ACTION = function(oe) {
          oe = N.$$FORM_ACTION(oe), c !== void 0 && (Jn(c, "target"), c += "", oe.action = c);
          var se = oe.data;
          return se && (x === null && (x = c !== void 0 ? "p" + c : "k" + Re(
            JSON.stringify([
              m,
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
      return bs += 1, Qo === null && (Qo = []), ns(Qo, e, t);
    }
    function ko() {
      throw Error("Cache cannot be refreshed during server rendering.");
    }
    function sc() {
    }
    function Zc() {
      if (d === 0) {
        b = console.log, E = console.info, F = console.warn, I = console.error, te = console.group, B = console.groupCollapsed, j = console.groupEnd;
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
        var m = y.DetermineComponentFrameRoot(), _ = m[0], J = m[1];
        if (_ && J) {
          var N = _.split(`
`), U = J.split(`
`);
          for (m = x = 0; x < N.length && !N[x].includes(
            "DetermineComponentFrameRoot"
          ); )
            x++;
          for (; m < U.length && !U[m].includes(
            "DetermineComponentFrameRoot"
          ); )
            m++;
          if (x === N.length || m === U.length)
            for (x = N.length - 1, m = U.length - 1; 1 <= x && 0 <= m && N[x] !== U[m]; )
              m--;
          for (; 1 <= x && 0 <= m; x--, m--)
            if (N[x] !== U[m]) {
              if (x !== 1 || m !== 1)
                do
                  if (x--, m--, 0 > m || N[x] !== U[m]) {
                    var oe = `
` + N[x].replace(
                      " at new ",
                      " at "
                    );
                    return e.displayName && oe.includes("<anonymous>") && (oe = oe.replace("<anonymous>", e.displayName)), typeof e == "function" && ae.set(e, oe), oe;
                  }
                while (1 <= x && 0 <= m);
              break;
            }
        }
      } finally {
        ye = !1, cn.H = h, yi(), Error.prepareStackTrace = c;
      }
      return N = (N = e ? e.displayName || e.name : "") ? Ur(N) : "", typeof e == "function" && ae.set(e, N), N;
    }
    function mu(e) {
      if (typeof e == "string") return Ur(e);
      if (typeof e == "function")
        return e.prototype && e.prototype.isReactComponent ? Kl(e, !0) : Kl(e, !1);
      if (typeof e == "object" && e !== null) {
        switch (e.$$typeof) {
          case Sn:
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
            return mu(e);
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
      var e = Si();
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
    function ca(e, t, c, h, y, x, m, _, J, N, U) {
      var oe = /* @__PURE__ */ new Set();
      this.destination = null, this.flushScheduled = !1, this.resumableState = e, this.renderState = t, this.rootFormatContext = c, this.progressiveChunkSize = h === void 0 ? 12800 : h, this.status = 10, this.fatalError = null, this.pendingRootTasks = this.allPendingTasks = this.nextSegmentId = 0, this.completedPreambleSegments = this.completedRootSegment = null, this.byteSize = 0, this.abortableTasks = oe, this.pingedTasks = [], this.clientRenderedBoundaries = [], this.completedBoundaries = [], this.partialBoundaries = [], this.trackedPostpones = null, this.onError = y === void 0 ? dc : y, this.onPostpone = N === void 0 ? Er : N, this.onAllReady = x === void 0 ? Er : x, this.onShellReady = m === void 0 ? Er : m, this.onShellError = _ === void 0 ? Er : _, this.onFatalError = J === void 0 ? Er : J, this.formState = U === void 0 ? null : U, this.didWarnForKey = null;
    }
    function So(e, t, c, h, y, x, m, _, J, N, U, oe) {
      return hc(), t = new ca(
        t,
        c,
        h,
        y,
        x,
        m,
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
        bu,
        null,
        null,
        Sl,
        null
      ), zi(e), t.pingedTasks.push(e), t;
    }
    function Yr(e, t, c, h, y, x, m, _, J, N, U) {
      return e = So(
        e,
        t,
        c,
        h,
        y,
        x,
        m,
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
    function Kt(e, t, c, h, y, x, m, _, J) {
      return hc(), c = new ca(
        t.resumableState,
        c,
        t.rootFormatContext,
        t.progressiveChunkSize,
        h,
        y,
        x,
        m,
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
        bu,
        null,
        null,
        Sl,
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
        bu,
        null,
        null,
        Sl,
        null
      ), zi(e), c.pingedTasks.push(e), c);
    }
    function jn(e, t, c, h, y, x, m, _, J) {
      return e = Kt(
        e,
        t,
        c,
        h,
        y,
        x,
        m,
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
    function Di(e, t, c, h, y) {
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
        fallbackPreamble: y,
        trackedContentKeyPath: null,
        trackedFallbackNode: null,
        errorMessage: null,
        errorStack: null,
        errorComponentStack: null
      }, t !== null && (t.pendingTasks++, h = t.boundaries, h !== null && (e.allPendingTasks++, c.pendingTasks++, h.push(c)), e = t.inheritedHoistables, e !== null && Cn(c.contentState, e)), c;
    }
    function jl(e, t, c, h, y, x, m, _, J, N, U, oe, se, ue, le, Ue, Zn) {
      e.allPendingTasks++, y === null ? e.pendingRootTasks++ : y.pendingTasks++, ue !== null && ue.pendingTasks++;
      var ze = {
        replay: null,
        node: c,
        childIndex: h,
        ping: function() {
          return Pu(e, ze);
        },
        blockedBoundary: y,
        blockedSegment: x,
        blockedPreamble: m,
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
    function Au(e, t, c, h, y, x, m, _, J, N, U, oe, se, ue, le, Ue) {
      e.allPendingTasks++, x === null ? e.pendingRootTasks++ : x.pendingTasks++, se !== null && se.pendingTasks++, c.pendingTasks++;
      var Zn = {
        replay: c,
        node: h,
        childIndex: y,
        ping: function() {
          return Pu(e, Zn);
        },
        blockedBoundary: x,
        blockedSegment: null,
        blockedPreamble: null,
        hoistableState: m,
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
    function Li(e, t, c, h, y, x) {
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
          e.owner || (t += mu(e.type));
        for (; e; )
          c = null, e.debugStack != null ? c = fc(
            e.debugStack
          ) : (x = e, x.stack != null && (c = typeof x.stack != "string" ? x.stack = fc(
            x.stack
          ) : x.stack)), (e = e.owner) && c && (t += `
` + c);
        var m = t;
      } catch (_) {
        m = `
Error generating stack: ` + _.message + `
` + _.stack;
      }
      return m;
    }
    function mo(e, t) {
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
            var c = t.type, h = t._owner, y = t._debugStack;
            Ni(e, t._debugInfo), e.debugTask = t._debugTask, e.componentStack = {
              parent: e.componentStack,
              type: c,
              owner: h,
              stack: y
            };
            break;
          case ya:
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
              c += mu(h.type), h = h.parent;
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
      e.errorDigest = t, c instanceof Error ? (t = String(c.message), c = String(c.stack)) : (t = typeof c == "object" && c !== null ? pn(c) : String(c), c = null), y = y ? `Switched to client rendering because the server rendering aborted due to:

` : `Switched to client rendering because the server rendering errored:

`, e.errorMessage = y + t, e.errorStack = c !== null ? y + c : null, e.errorComponentStack = h.componentStack;
    }
    function Mt(e, t, c, h) {
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
      h ? (h.run(c.bind(null, t)), h.run(y.bind(null, t))) : (c(t), y(t)), e.destination !== null ? (e.status = Ir, tr(e.destination, t)) : (e.status = 13, e.fatalError = t);
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
    function Ha(e, t) {
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
    function Ti(e) {
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
    function Hi(e, t, c, h, y) {
      var x = t.keyPath, m = t.treeContext, _ = t.row, J = t.componentStack, N = t.debugTask;
      Ni(t, t.node.props.children._debugInfo), t.keyPath = c, c = h.length;
      var U = null;
      if (t.replay !== null) {
        var oe = t.replay.slots;
        if (oe !== null && typeof oe == "object")
          for (var se = 0; se < c; se++) {
            var ue = y !== "backwards" && y !== "unstable_legacy-backwards" ? se : c - 1 - se, le = h[ue];
            t.row = U = Ti(
              U
            ), t.treeContext = Na(m, c, ue);
            var Ue = oe[ue];
            typeof Ue == "number" ? (Ba(e, t, Ue, le, ue), delete oe[ue]) : jt(e, t, le, ue), --U.pendingTasks === 0 && Vt(e, U);
          }
        else
          for (oe = 0; oe < c; oe++)
            se = y !== "backwards" && y !== "unstable_legacy-backwards" ? oe : c - 1 - oe, ue = h[se], $l(e, t, ue), t.row = U = Ti(U), t.treeContext = Na(m, c, se), jt(e, t, ue, se), --U.pendingTasks === 0 && Vt(e, U);
      } else if (y !== "backwards" && y !== "unstable_legacy-backwards")
        for (y = 0; y < c; y++)
          oe = h[y], $l(e, t, oe), t.row = U = Ti(U), t.treeContext = Na(
            m,
            c,
            y
          ), jt(e, t, oe, y), --U.pendingTasks === 0 && Vt(e, U);
      else {
        for (y = t.blockedSegment, oe = y.children.length, se = y.chunks.length, ue = c - 1; 0 <= ue; ue--) {
          le = h[ue], t.row = U = Ti(
            U
          ), t.treeContext = Na(m, c, ue), Ue = Li(
            e,
            se,
            null,
            t.formatContext,
            ue === 0 ? y.lastPushedText : !0,
            !0
          ), y.children.splice(oe, 0, Ue), t.blockedSegment = Ue, $l(e, t, le);
          try {
            jt(e, t, le, ue), Ue.lastPushedText && Ue.textEmbedded && Ue.chunks.push(Lt), Ue.status = Un, ei(e, t.blockedBoundary, Ue), --U.pendingTasks === 0 && Vt(e, U);
          } catch (Zn) {
            throw Ue.status = e.status === 12 ? Tt : Tn, Zn;
          }
        }
        t.blockedSegment = y, y.lastPushedText = !1;
      }
      _ !== null && U !== null && 0 < U.pendingTasks && (_.pendingTasks++, U.next = _), t.treeContext = m, t.row = _, t.keyPath = x, t.componentStack = J, t.debugTask = N;
    }
    function It(e, t, c, h, y, x) {
      var m = t.thenableState;
      for (t.thenableState = null, ar = {}, $i = t, Mr = e, Aa = c, oi = !1, _c = zt = 0, wu = -1, bs = 0, Qo = m, e = Qn(h, y, x); ea; )
        ea = !1, _c = zt = 0, wu = -1, bs = 0, Mc += 1, Dn = null, e = h(y, x);
      return za(), e;
    }
    function Bi(e, t, c, h, y, x, m) {
      var _ = !1;
      if (x !== 0 && e.formState !== null) {
        var J = t.blockedSegment;
        if (J !== null) {
          _ = !0, J = J.chunks;
          for (var N = 0; N < x; N++)
            N === m ? J.push(no) : J.push(Pr);
        }
      }
      x = t.keyPath, t.keyPath = c, y ? (c = t.treeContext, t.treeContext = Na(c, 1, 0), jt(e, t, h, -1), t.treeContext = c) : _ ? jt(e, t, h, -1) : Gr(e, t, h, -1), t.keyPath = x;
    }
    function Ui(e, t, c, h, y, x) {
      if (typeof h == "function")
        if (h.prototype && h.prototype.isReactComponent) {
          var m = y;
          if ("ref" in y) {
            m = {};
            for (var _ in y)
              _ !== "ref" && (m[_] = y[_]);
          }
          var J = h.defaultProps;
          if (J) {
            m === y && (m = qn({}, m, y));
            for (var N in J)
              m[N] === void 0 && (m[N] = J[N]);
          }
          var U = m, oe = Sl, se = h.contextType;
          if ("contextType" in h && se !== null && (se === void 0 || se.$$typeof !== it) && !ks.has(h)) {
            ks.add(h);
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
          var Bt = le.state;
          Bt && (typeof Bt != "object" || xi(Bt)) && console.error("%s.state: must be set to an object or null", On), typeof le.getChildContext == "function" && typeof h.childContextTypes != "object" && console.error(
            "%s.getChildContext(): childContextTypes must be defined in order to use getChildContext().",
            On
          );
          var Dr = le.state !== void 0 ? le.state : null;
          le.updater = Ss, le.props = U, le.state = Dr;
          var Vn = { queue: [], replace: !1 };
          le._reactInternals = Vn;
          var ut = h.contextType;
          if (le.context = typeof ut == "object" && ut !== null ? ut._currentValue : Sl, le.state === U) {
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
                var ml = dn(h) || "Unknown";
                gu[ml] || (console.warn(
                  `componentWillMount has been renamed, and is not recommended for use. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move code from componentWillMount to componentDidMount (preferred in most cases) or the constructor.

Please update the following components: %s`,
                  ml
                ), gu[ml] = !0);
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
            )), Vn.queue !== null && 0 < Vn.queue.length) {
              var nr = Vn.queue, pt = Vn.replace;
              if (Vn.queue = null, Vn.replace = !1, pt && nr.length === 1)
                le.state = nr[0];
              else {
                for (var Lr = pt ? nr[0] : le.state, sl = !0, Nr = pt ? 1 : 0; Nr < nr.length; Nr++) {
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
            br[cr] || (console.error(
              "The <%s /> component appears to have a render method, but doesn't extend React.Component. This is likely to cause errors. Change %s to extend React.Component instead.",
              cr,
              cr
            ), br[cr] = !0);
          }
          var Vu = It(
            e,
            t,
            c,
            h,
            y,
            void 0
          );
          if (e.status === 12) throw null;
          var Fi = zt !== 0, Ft = _c, Hl = wu;
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
          var jo = y.children, hl = t.formatContext, Lc = t.keyPath;
          t.formatContext = we(hl, h, y), t.keyPath = c, jt(e, t, jo, -1), t.formatContext = hl, t.keyPath = Lc;
        } else {
          var Qu = rc(
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
          var Bl = t.formatContext, Nc = t.keyPath;
          if (t.keyPath = c, (t.formatContext = we(
            Bl,
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
                if (Bl.insertionMode <= Ta) {
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
                if (Bl.insertionMode <= Ta) break e;
            }
            qo.push(ht(h));
          }
          ci.lastPushedText = !1;
        }
      } else {
        switch (h) {
          case Rs:
          case wc:
          case Tc:
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
              var dl = y.children, Tr = y.revealOrder;
              if (Tr === "forwards" || Tr === "backwards" || Tr === "unstable_legacy-backwards") {
                if (xi(dl)) {
                  Hi(
                    e,
                    t,
                    c,
                    dl,
                    Tr
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
                        Tr
                      );
                    }
                    break e;
                  }
                }
              }
              if (Tr === "together") {
                var ws = t.keyPath, Kr = t.row, ui = t.row = Ti(null);
                ui.boundaries = [], ui.together = !0, t.keyPath = c, Gr(e, t, dl, -1), --ui.pendingTasks === 0 && Vt(e, ui), t.keyPath = ws, t.row = Kr, Kr !== null && 0 < ui.pendingTasks && (Kr.pendingTasks++, ui.next = Kr);
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
              var Tu = t.keyPath, pu = t.formatContext, Xs = t.row;
              t.keyPath = c, t.formatContext = Ne(
                e.resumableState,
                pu
              ), t.row = null;
              var yo = y.children;
              try {
                jt(e, t, yo, -1);
              } finally {
                t.keyPath = Tu, t.formatContext = pu, t.row = Xs;
              }
            } else {
              var $o = t.keyPath, bo = t.formatContext, xu = t.row, Ls = t.blockedBoundary, ms = t.blockedPreamble, jr = t.hoistableState, Mi = t.blockedSegment, wo = y.fallback, Ju = y.children, Yl = /* @__PURE__ */ new Set(), Wt = t.formatContext.insertionMode < kr ? Di(
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
                ), Wt.trackedFallbackNode = Ku, t.blockedSegment = xt, t.blockedPreamble = Wt.fallbackPreamble, t.keyPath = ec, t.formatContext = ke(
                  e.resumableState,
                  bo
                ), t.componentStack = Po(
                  Ps
                ), xt.status = 6;
                try {
                  jt(e, t, wo, -1), xt.lastPushedText && xt.textEmbedded && xt.chunks.push(Lt), xt.status = Un, ei(e, Ls, xt);
                } catch (Vs) {
                  throw xt.status = e.status === 12 ? Tt : Tn, Vs;
                } finally {
                  t.blockedSegment = Mi, t.blockedPreamble = ms, t.keyPath = $o, t.formatContext = bo;
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
                  Sl,
                  t.debugTask
                );
                zi(nc), e.pingedTasks.push(nc);
              } else {
                t.blockedBoundary = Wt, t.blockedPreamble = Wt.contentPreamble, t.hoistableState = Wt.contentState, t.blockedSegment = et, t.keyPath = c, t.formatContext = Ne(
                  e.resumableState,
                  bo
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
                    et.status = Tt;
                    var Hc = e.fatalError;
                  } else
                    et.status = Tn, Hc = Vs;
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
                  t.blockedBoundary = Ls, t.blockedPreamble = ms, t.hoistableState = jr, t.blockedSegment = Mi, t.keyPath = $o, t.formatContext = bo, t.row = xu;
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
                  ke(
                    e.resumableState,
                    t.formatContext
                  ),
                  t.context,
                  t.treeContext,
                  t.row,
                  Po(
                    t.componentStack
                  ),
                  Sl,
                  t.debugTask
                );
                zi(Eu), e.pingedTasks.push(Eu);
              }
            }
            return;
        }
        if (typeof h == "object" && h !== null)
          switch (h.$$typeof) {
            case Sn:
              if ("ref" in y) {
                var Ru = {};
                for (var Ts in y)
                  Ts !== "ref" && (Ru[Ts] = y[Ts]);
              } else Ru = y;
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
                wu
              );
              return;
            case Xa:
              Ui(e, t, c, h.type, y, x);
              return;
            case it:
              var Ns = y.value, qu = y.children, $u = t.context, Uc = t.keyPath, To = h._currentValue;
              h._currentValue = Ns, h._currentRenderer !== void 0 && h._currentRenderer !== null && h._currentRenderer !== Pa && console.error(
                "Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported."
              ), h._currentRenderer = Pa;
              var _a = qi, gl = {
                parent: _a,
                depth: _a === null ? 0 : _a.depth + 1,
                context: h,
                parentValue: To,
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
              var Zs = h._context, Fs = y.children;
              typeof Fs != "function" && console.error(
                "A context consumer was rendered with multiple children, or a child that isn't a function. A context consumer expects a single child that is a function. If you did pass a function, make sure there is no trailing or leading whitespace around it."
              );
              var cf = Fs(Zs._currentValue), ps = t.keyPath;
              t.keyPath = c, Gr(e, t, cf, -1), t.keyPath = ps;
              return;
            case ya:
              var uf = yr(h);
              if (e.status === 12) throw null;
              Ui(e, t, c, uf, y, x);
              return;
          }
        var Hs = "";
        throw (h === void 0 || typeof h == "object" && h !== null && Object.keys(h).length === 0) && (Hs += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports."), Error(
          "Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: " + ((h == null ? h : typeof h) + "." + Hs)
        );
      }
    }
    function Ba(e, t, c, h, y) {
      var x = t.replay, m = t.blockedBoundary, _ = Li(
        e,
        0,
        null,
        t.formatContext,
        !1,
        !1
      );
      _.id = c, _.parentFlushed = !0;
      try {
        t.replay = null, t.blockedSegment = _, jt(e, t, h, y), _.status = Un, ei(e, m, _), m === null ? e.completedRootSegment = _ : (_o(m, _), m.parentFlushed && e.partialBoundaries.push(m));
      } finally {
        t.replay = x, t.blockedSegment = null;
      }
    }
    function sa(e, t, c, h, y, x, m, _, J, N) {
      x = N.nodes;
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
              if (Ui(e, t, c, m, _, J), t.replay.pendingTasks === 1 && 0 < t.replay.nodes.length)
                throw Error(
                  "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                );
              t.replay.pendingTasks--;
            } catch (Le) {
              if (typeof Le == "object" && Le !== null && (Le === ki || typeof Le.then == "function"))
                throw t.node === y ? t.replay = N : x.splice(U, 1), Le;
              t.replay.pendingTasks--, m = $e(t.componentStack), _ = e, e = t.blockedBoundary, c = Le, J = h, h = Mt(_, c, m, t.debugTask), fa(
                _,
                e,
                se,
                J,
                c,
                h,
                m,
                !1
              );
            }
            t.replay = N;
          } else {
            if (m !== va)
              throw Error(
                "Expected the resume to render <Suspense> in this slot but instead it rendered <" + (dn(m) || "Unknown") + ">. The tree doesn't match so React will fallback to client rendering."
              );
            e: {
              N = void 0, h = oe[5], m = oe[2], J = oe[3], y = oe[4] === null ? [] : oe[4][2], oe = oe[4] === null ? null : oe[4][3];
              var ue = t.keyPath, le = t.formatContext, Ue = t.row, Zn = t.replay, ze = t.blockedBoundary, hn = t.hoistableState, At = _.children, Ht = _.fallback, On = /* @__PURE__ */ new Set();
              _ = t.formatContext.insertionMode < kr ? Di(
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
              ), t.row = null, t.replay = { nodes: m, slots: J, pendingTasks: 1 };
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
                { nodes: y, slots: oe, pendingTasks: 0 },
                Ht,
                -1,
                ze,
                _.fallbackState,
                On,
                [c[0], "Suspense Fallback", c[2]],
                ke(
                  e.resumableState,
                  t.formatContext
                ),
                t.context,
                t.treeContext,
                t.row,
                Po(
                  t.componentStack
                ),
                Sl,
                t.debugTask
              ), zi(_), e.pingedTasks.push(_);
            }
          }
          x.splice(U, 1);
          break;
        }
      }
    }
    function Ua(e, t, c, h, y) {
      h === t ? (c !== -1 || e.componentStack === null || typeof e.componentStack.type != "function" || Object.prototype.toString.call(e.componentStack.type) !== "[object GeneratorFunction]" || Object.prototype.toString.call(h) !== "[object Generator]") && (mi || console.error(
        "Using Iterators as children is unsupported and will likely yield unexpected results because enumerating a generator mutates it. You may convert it to an array with `Array.from()` or the `[...spread]` operator before rendering. You can also use an Iterable that can iterate multiple times over the same items."
      ), mi = !0) : t.entries !== y || Pi || (console.error(
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
              var y = c.type, x = c.key;
              c = c.props;
              var m = c.ref;
              m = m !== void 0 ? m : null;
              var _ = t.debugTask, J = dn(y);
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
                  y,
                  c,
                  m,
                  t.replay
                )
              ) : sa(
                e,
                t,
                N,
                J,
                x,
                h,
                y,
                c,
                m,
                t.replay
              ) : _ ? _.run(
                Ui.bind(
                  null,
                  e,
                  t,
                  N,
                  y,
                  c,
                  m
                )
              ) : Ui(e, t, N, y, c, m);
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
        typeof c == "string" ? (t = t.blockedSegment, t !== null && (t.lastPushedText = me(
          t.chunks,
          c,
          e.renderState,
          t.lastPushedText
        ))) : typeof c == "number" || typeof c == "bigint" ? (t = t.blockedSegment, t !== null && (t.lastPushedText = me(
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
            var m = dn(x.type);
            m && (e = `

Check the render method of \`` + m + "`.");
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
      var y = t.keyPath, x = t.componentStack, m = t.debugTask;
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
              if (typeof le == "object" && le !== null && (le === ki || typeof le.then == "function"))
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
        t.keyPath = y, t.componentStack = x, t.debugTask = m;
        return;
      }
      if (_ = t.treeContext, J = c.length, t.replay !== null && (N = t.replay.slots, N !== null && typeof N == "object")) {
        for (h = 0; h < J; h++)
          U = c[h], t.treeContext = Na(
            _,
            J,
            h
          ), se = N[h], typeof se == "number" ? (Ba(e, t, se, U, h), delete N[h]) : jt(e, t, U, h);
        t.treeContext = _, t.keyPath = y, t.componentStack = x, t.debugTask = m;
        return;
      }
      for (N = 0; N < J; N++)
        h = c[N], $l(e, t, h), t.treeContext = Na(_, J, N), jt(e, t, h, N);
      t.treeContext = _, t.keyPath = y, t.componentStack = x, t.debugTask = m;
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
    function _u(e, t, c, h) {
      h.status = tn;
      var y = c.keyPath, x = c.blockedBoundary;
      if (x === null)
        h.id = e.nextSegmentId++, t.rootSlots = h.id, e.completedRootSegment !== null && (e.completedRootSegment.status = tn);
      else {
        if (x !== null && x.status === Bn) {
          var m = Ou(
            e,
            t,
            x
          );
          if (x.trackedContentKeyPath === y && c.childIndex === -1) {
            h.id === -1 && (h.id = h.parentFlushed ? x.rootSegmentID : e.nextSegmentId++), m[3] = h.id;
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
          } else if (x = t.workingMap, m = x.get(y), m === void 0)
            e = {}, m = [y[1], y[2], [], e], x.set(y, m), El(m, y[0], t);
          else if (e = m[3], e === null)
            e = m[3] = {};
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
        Sl,
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
        Sl,
        t.debugTask
      );
    }
    function jt(e, t, c, h) {
      var y = t.formatContext, x = t.context, m = t.keyPath, _ = t.treeContext, J = t.componentStack, N = t.debugTask, U = t.blockedSegment;
      if (U === null) {
        U = t.replay;
        try {
          return Gr(e, t, c, h);
        } catch (ue) {
          if (za(), c = ue === ki ? Su() : ue, e.status !== 12 && typeof c == "object" && c !== null) {
            if (typeof c.then == "function") {
              h = ue === ki ? wl() : null, e = Fo(
                e,
                t,
                h
              ).ping, c.then(e, e), t.formatContext = y, t.context = x, t.keyPath = m, t.treeContext = _, t.componentStack = J, t.replay = U, t.debugTask = N, kn(x);
              return;
            }
            if (c.message === "Maximum call stack size exceeded") {
              c = ue === ki ? wl() : null, c = Fo(e, t, c), e.pingedTasks.push(c), t.formatContext = y, t.context = x, t.keyPath = m, t.treeContext = _, t.componentStack = J, t.replay = U, t.debugTask = N, kn(x);
              return;
            }
          }
        }
      } else {
        var oe = U.children.length, se = U.chunks.length;
        try {
          return Gr(e, t, c, h);
        } catch (ue) {
          if (za(), U.children.length = oe, U.chunks.length = se, c = ue === ki ? Su() : ue, e.status !== 12 && typeof c == "object" && c !== null) {
            if (typeof c.then == "function") {
              U = c, c = ue === ki ? wl() : null, e = Oo(e, t, c).ping, U.then(e, e), t.formatContext = y, t.context = x, t.keyPath = m, t.treeContext = _, t.componentStack = J, t.debugTask = N, kn(x);
              return;
            }
            if (c.message === "Maximum call stack size exceeded") {
              U = ue === ki ? wl() : null, U = Oo(e, t, U), e.pingedTasks.push(U), t.formatContext = y, t.context = x, t.keyPath = m, t.treeContext = _, t.componentStack = J, t.debugTask = N, kn(x);
              return;
            }
          }
        }
      }
      throw t.formatContext = y, t.context = x, t.keyPath = m, t.treeContext = _, kn(x), c;
    }
    function ls(e) {
      var t = e.blockedBoundary, c = e.blockedSegment;
      c !== null && (c.status = Tt, da(this, t, e.row, c));
    }
    function fa(e, t, c, h, y, x, m, _) {
      for (var J = 0; J < c.length; J++) {
        var N = c[J];
        if (N.length === 4)
          fa(
            e,
            t,
            N[2],
            N[3],
            y,
            x,
            m,
            _
          );
        else {
          var U = e;
          N = N[5];
          var oe = y, se = x, ue = m, le = _, Ue = Di(
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
          y,
          m,
          _
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
      var x = $e(e.componentStack), m = e.node;
      if (m !== null && typeof m == "object" && mo(e, m._debugInfo), h === null) {
        if (t.status !== 13 && t.status !== Ir) {
          if (h = e.replay, h === null) {
            t.trackedPostpones !== null && y !== null ? (h = t.trackedPostpones, Mt(t, c, x, e.debugTask), _u(t, h, e, y), da(t, null, e.row, y)) : (Mt(t, c, x, e.debugTask), wi(t, c, x, e.debugTask));
            return;
          }
          h.pendingTasks--, h.pendingTasks === 0 && 0 < h.nodes.length && (y = Mt(t, c, x, null), fa(
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
        if (m = t.trackedPostpones, h.status !== _e) {
          if (m !== null && y !== null)
            return Mt(t, c, x, e.debugTask), _u(t, m, e, y), h.fallbackAbortableTasks.forEach(function(_) {
              return gc(_, t, c);
            }), h.fallbackAbortableTasks.clear(), da(t, h, e.row, y);
          h.status = _e, y = Mt(
            t,
            c,
            x,
            e.debugTask
          ), h.status = _e, ql(h, y, c, x, !0), Ao(t, h), h.parentFlushed && t.clientRenderedBoundaries.push(h);
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
          var y = c.headers;
          if (y) {
            c.headers = null;
            var x = y.preconnects;
            if (y.fontPreloads && (x && (x += ", "), x += y.fontPreloads), y.highImagePreloads && (x && (x += ", "), x += y.highImagePreloads), !t) {
              var m = c.styles.values(), _ = m.next();
              e: for (; 0 < y.remainingCapacity && !_.done; _ = m.next())
                for (var J = _.value.sheets.values(), N = J.next(); 0 < y.remainingCapacity && !N.done; N = J.next()) {
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
                  if (0 <= (y.remainingCapacity -= le.length + 2))
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
        c.id = t.id, c.parentFlushed = !0, c.status !== Un && c.status !== Tt && c.status !== Tn || _o(e, c);
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
          if (t.status === Bn && (t.status = Un), h !== null && h.parentFlushed && (h.status === Un || h.status === Tt) && _o(t, h), t.parentFlushed && e.completedBoundaries.push(t), t.status === Un)
            c = t.row, c !== null && Cn(c.hoistables, t.contentState), Wr(e, t) || (t.fallbackAbortableTasks.forEach(
              ls,
              e
            ), t.fallbackAbortableTasks.clear(), c !== null && --c.pendingTasks === 0 && Vt(e, c)), e.pendingRootTasks === 0 && e.trackedPostpones === null && t.contentPreamble !== null && Ya(e);
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
            --t.pendingTasks === 0 && Vt(e, t);
          }
        } else
          h === null || !h.parentFlushed || h.status !== Un && h.status !== Tt || (_o(t, h), t.completedSegments.length === 1 && t.parentFlushed && e.partialBoundaries.push(t)), t = t.row, t !== null && t.together && Ha(e, t);
      e.allPendingTasks === 0 && ha(e);
    }
    function ga(e) {
      if (e.status !== Ir && e.status !== 13) {
        var t = qi, c = cn.H;
        cn.H = Ic;
        var h = cn.A;
        cn.A = u;
        var y = Wn;
        Wn = e;
        var x = cn.getCurrentStack;
        cn.getCurrentStack = bi;
        var m = n;
        n = e.resumableState;
        try {
          var _ = e.pingedTasks, J;
          for (J = 0; J < _.length; J++) {
            var N = e, U = _[J], oe = U.blockedSegment;
            if (oe === null) {
              var se = void 0, ue = N;
              if (N = U, N.replay.pendingTasks !== 0) {
                kn(N.context), se = r, r = N;
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
                } catch (pt) {
                  za();
                  var le = pt === ki ? Su() : pt;
                  if (typeof le == "object" && le !== null && typeof le.then == "function") {
                    var Ue = N.ping;
                    le.then(Ue, Ue), N.thenableState = pt === ki ? wl() : null;
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
              hn.status = 6, kn(ze.context), ue = r, r = ze;
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
              } catch (pt) {
                za(), hn.children.length = Dr, hn.chunks.length = Vn;
                var ut = pt === ki ? Su() : N.status === 12 ? N.fatalError : pt;
                if (N.status === 12 && N.trackedPostpones !== null) {
                  var cl = N.trackedPostpones, wr = $e(ze.componentStack);
                  ze.abortSet.delete(ze), Mt(
                    N,
                    ut,
                    wr,
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
                  hn.status = Bn, ze.thenableState = pt === ki ? wl() : null;
                  var er = ze.ping;
                  ut.then(er, er);
                } else {
                  var st = $e(
                    ze.componentStack
                  );
                  ze.abortSet.delete(ze), hn.status = Tn;
                  var Jt = ze.blockedBoundary, ul = ze.row, ml = ze.debugTask;
                  if (ul !== null && --ul.pendingTasks === 0 && Vt(N, ul), N.allPendingTasks--, se = Mt(
                    N,
                    ut,
                    st,
                    ml
                  ), Jt === null)
                    wi(
                      N,
                      ut,
                      st,
                      ml
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
          _.splice(0, J), e.destination !== null && Tl(
            e,
            e.destination
          );
        } catch (pt) {
          _ = {}, Mt(e, pt, _, null), wi(e, pt, _, null);
        } finally {
          n = m, cn.H = c, cn.A = h, cn.getCurrentStack = x, c === Ic && kn(t), Wn = y;
        }
      }
    }
    function Mu(e, t, c) {
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
        return Mu(
          e,
          t,
          c
        );
      var y = h.contentPreamble, x = h.fallbackPreamble;
      if (y === null || x === null) return !1;
      switch (h.status) {
        case Un:
          if (po(e.renderState, y), e.byteSize += h.byteSize, t = h.completedSegments[0], !t)
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
            return po(e.renderState, x), Mu(
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
    function Dt(e, t, c, h) {
      switch (c.parentFlushed = !0, c.status) {
        case Bn:
          c.id = e.nextSegmentId++;
        case tn:
          return h = c.id, c.lastPushedText = !1, c.textEmbedded = !1, e = e.renderState, A(t, Ac), A(t, e.placeholderPrefix), e = ee(h.toString(16)), A(t, e), D(t, au);
        case Un:
          c.status = Xn;
          var y = !0, x = c.chunks, m = 0;
          c = c.children;
          for (var _ = 0; _ < c.length; _++) {
            for (y = c[_]; m < y.index; m++)
              A(t, x[m]);
            y = pi(e, t, y, h);
          }
          for (; m < x.length - 1; m++)
            A(t, x[m]);
          return m < x.length && (y = D(t, x[m])), y;
        case Tt:
          return !0;
        default:
          throw Error(
            "Aborted, errored or already flushed boundaries should not be flushed again. This is a bug in React."
          );
      }
    }
    function pi(e, t, c, h) {
      var y = c.boundary;
      if (y === null)
        return Dt(e, t, c, h);
      if (y.parentFlushed = !0, y.status === _e) {
        var x = y.row;
        x !== null && --x.pendingTasks === 0 && Vt(e, x), x = y.errorDigest;
        var m = y.errorMessage, _ = y.errorStack;
        y = y.errorComponentStack, D(t, cs), A(t, Fc), x && (A(t, Ho), A(t, ee(Pe(x))), A(
          t,
          ri
        )), m && (A(t, Ca), A(
          t,
          ee(Pe(m))
        ), A(
          t,
          ri
        )), _ && (A(t, Oc), A(
          t,
          ee(Pe(_))
        ), A(
          t,
          ri
        )), y && (A(t, ka), A(
          t,
          ee(Pe(y))
        ), A(
          t,
          ri
        )), D(t, us), Dt(e, t, c, h);
      } else if (y.status !== Un)
        y.status === Bn && (y.rootSegmentID = e.nextSegmentId++), 0 < y.completedSegments.length && e.partialBoundaries.push(y), el(
          t,
          e.renderState,
          y.rootSegmentID
        ), h && Cn(h, y.fallbackState), Dt(e, t, c, h);
      else if (!or && Wr(e, y) && (Ai + y.byteSize > e.progressiveChunkSize || es(y.contentState)))
        y.rootSegmentID = e.nextSegmentId++, e.completedBoundaries.push(y), el(
          t,
          e.renderState,
          y.rootSegmentID
        ), Dt(e, t, c, h);
      else {
        if (Ai += y.byteSize, h && Cn(h, y.contentState), c = y.row, c !== null && Wr(e, y) && --c.pendingTasks === 0 && Vt(e, c), D(t, cu), c = y.completedSegments, c.length !== 1)
          throw Error(
            "A previously unvisited boundary must have exactly one root segment. This is a bug in React."
          );
        pi(e, t, c[0], h);
      }
      return D(t, to);
    }
    function vc(e, t, c, h) {
      return aa(
        t,
        e.renderState,
        c.parentFormatContext,
        c.id
      ), pi(e, t, c, h), fi(t, c.parentFormatContext);
    }
    function yc(e, t, c) {
      Ai = c.byteSize;
      for (var h = c.completedSegments, y = 0; y < h.length; y++)
        Qc(
          e,
          t,
          c,
          h[y]
        );
      h.length = 0, h = c.row, h !== null && Wr(e, c) && --h.pendingTasks === 0 && Vt(e, h), L(
        t,
        c.contentState,
        e.renderState
      ), h = e.resumableState, e = e.renderState, y = c.rootSegmentID, c = c.contentState;
      var x = e.stylesToHoist;
      return e.stylesToHoist = !1, A(t, e.startInlineScript), A(t, yt), x ? ((h.instructions & In) === vt && (h.instructions |= In, A(t, Ar)), (h.instructions & Rr) === vt && (h.instructions |= Rr, A(t, Ve)), (h.instructions & En) === vt ? (h.instructions |= En, A(
        t,
        bt
      )) : A(t, $n)) : ((h.instructions & Rr) === vt && (h.instructions |= Rr, A(t, Ve)), A(t, bn)), h = ee(y.toString(16)), A(t, e.boundaryPrefix), A(t, h), A(t, gr), A(t, e.segmentPrefix), A(t, h), x ? (A(t, ll), We(t, c)) : A(t, Il), c = D(t, Qe), xo(t, e) && c;
    }
    function Qc(e, t, c, h) {
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
      ) : (vc(e, t, h, y), c = e.resumableState, e = e.renderState, A(t, e.startInlineScript), A(t, yt), (c.instructions & mn) === vt ? (c.instructions |= mn, A(t, K)) : A(t, xe), A(t, e.segmentPrefix), x = ee(x.toString(16)), A(t, x), A(t, Te), A(t, e.placeholderPrefix), A(t, x), t = D(t, yn), t);
    }
    function Tl(e, t) {
      hr = new Uint8Array(2048), ir = 0;
      try {
        if (!(0 < e.pendingRootTasks)) {
          var c, h = e.completedRootSegment;
          if (h !== null) {
            if (h.status === tn) return;
            var y = e.completedPreambleSegments;
            if (y === null) return;
            Ai = e.byteSize;
            var x = e.resumableState, m = e.renderState, _ = m.preamble, J = _.htmlChunks, N = _.headChunks, U;
            if (J) {
              for (U = 0; U < J.length; U++)
                A(t, J[U]);
              if (N)
                for (U = 0; U < N.length; U++)
                  A(t, N[U]);
              else
                A(t, Nn("head")), A(t, yt);
            } else if (N)
              for (U = 0; U < N.length; U++)
                A(t, N[U]);
            var oe = m.charsetChunks;
            for (U = 0; U < oe.length; U++)
              A(t, oe[U]);
            oe.length = 0, m.preconnects.forEach(ne, t), m.preconnects.clear();
            var se = m.viewportChunks;
            for (U = 0; U < se.length; U++)
              A(t, se[U]);
            se.length = 0, m.fontPreloads.forEach(ne, t), m.fontPreloads.clear(), m.highImagePreloads.forEach(ne, t), m.highImagePreloads.clear(), sn = m, m.styles.forEach(Fe, t), sn = null;
            var ue = m.importMapChunks;
            for (U = 0; U < ue.length; U++)
              A(t, ue[U]);
            ue.length = 0, m.bootstrapScripts.forEach(ne, t), m.scripts.forEach(ne, t), m.scripts.clear(), m.bulkPreloads.forEach(ne, t), m.bulkPreloads.clear(), J || N || (x.instructions |= Pn);
            var le = m.hoistableChunks;
            for (U = 0; U < le.length; U++)
              A(t, le[U]);
            for (x = le.length = 0; x < y.length; x++) {
              var Ue = y[x];
              for (m = 0; m < Ue.length; m++)
                pi(e, t, Ue[m], null);
            }
            var Zn = e.renderState.preamble, ze = Zn.headChunks;
            (Zn.htmlChunks || ze) && A(t, ht("head"));
            var hn = Zn.bodyChunks;
            if (hn)
              for (y = 0; y < hn.length; y++)
                A(t, hn[y]);
            pi(e, t, h, null), e.completedRootSegment = null;
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
                A(t, yt), A(t, Pc), D(t, Zi);
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
            var cl = e.resumableState, wr = e.renderState, er = ut.rootSegmentID, st = ut.errorDigest, Jt = ut.errorMessage, ul = ut.errorStack, ml = ut.errorComponentStack;
            A(
              Le,
              wr.startInlineScript
            ), A(Le, yt), (cl.instructions & In) === vt ? (cl.instructions |= In, A(Le, _t)) : A(Le, Vr), A(
              Le,
              wr.boundaryPrefix
            ), A(Le, ee(er.toString(16))), A(Le, ji), (st || Jt || ul || ml) && (A(
              Le,
              wt
            ), A(
              Le,
              ee(
                Zl(st || "")
              )
            )), (Jt || ul || ml) && (A(
              Le,
              wt
            ), A(
              Le,
              ee(
                Zl(Jt || "")
              )
            )), (ul || ml) && (A(
              Le,
              wt
            ), A(
              Le,
              ee(
                Zl(ul || "")
              )
            )), ml && (A(
              Le,
              wt
            ), A(
              Le,
              ee(
                Zl(ml)
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
          var pt = e.completedBoundaries;
          for (c = 0; c < pt.length; c++)
            if (!yc(
              e,
              t,
              pt[c]
            )) {
              e.destination = null, c++, pt.splice(0, c);
              return;
            }
          pt.splice(0, c), Ae(t), hr = new Uint8Array(2048), ir = 0, or = !0;
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
            if (!yc(e, t, Ut[c])) {
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
    function pl(e) {
      e.flushScheduled = e.destination !== null, Va(function() {
        return ga(e);
      }), ie(function() {
        e.status === 10 && (e.status = 11), e.trackedPostpones === null && Vc(e, e.pendingRootTasks === 0);
      });
    }
    function rl(e) {
      e.flushScheduled === !1 && e.pingedTasks.length === 0 && e.destination !== null && (e.flushScheduled = !0, ie(function() {
        var t = e.destination;
        t ? Tl(e, t) : e.flushScheduled = !1;
      }));
    }
    function xl(e, t) {
      if (e.status === 13)
        e.status = Ir, tr(t, e.fatalError);
      else if (e.status !== Ir && e.destination === null) {
        e.destination = t;
        try {
          Tl(e, t);
        } catch (c) {
          t = {}, Mt(e, c, t, null), wi(e, c, t, null);
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
            var x = r, m = cn.getCurrentStack;
            r = y, cn.getCurrentStack = bi;
            try {
              gc(y, e, h);
            } finally {
              r = x, cn.getCurrentStack = m;
            }
          }), c.clear();
        }
        e.destination !== null && Tl(e, e.destination);
      } catch (y) {
        t = {}, Mt(e, y, t, null), wi(e, y, t, null);
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
      var e = Jc.version;
      if (e !== "19.2.6")
        throw Error(
          `Incompatible React versions: The "react" and "react-dom" packages must have the exact same version. Instead got:
  - react:      ` + (e + `
  - react-dom:  19.2.6
Learn more: https://react.dev/warnings/version-mismatch`)
        );
    }
    var Jc = _s(), Kc = yf(), jc = /* @__PURE__ */ Symbol.for("react.transitional.element"), bc = /* @__PURE__ */ Symbol.for("react.portal"), Yi = /* @__PURE__ */ Symbol.for("react.fragment"), wc = /* @__PURE__ */ Symbol.for("react.strict_mode"), Tc = /* @__PURE__ */ Symbol.for("react.profiler"), Xr = /* @__PURE__ */ Symbol.for("react.consumer"), it = /* @__PURE__ */ Symbol.for("react.context"), Sn = /* @__PURE__ */ Symbol.for("react.forward_ref"), va = /* @__PURE__ */ Symbol.for("react.suspense"), Ga = /* @__PURE__ */ Symbol.for("react.suspense_list"), Xa = /* @__PURE__ */ Symbol.for("react.memo"), ya = /* @__PURE__ */ Symbol.for("react.lazy"), Iu = /* @__PURE__ */ Symbol.for("react.scope"), lr = /* @__PURE__ */ Symbol.for("react.activity"), Rs = /* @__PURE__ */ Symbol.for("react.legacy_hidden"), ti = /* @__PURE__ */ Symbol.for("react.memo_cache_sentinel"), is = /* @__PURE__ */ Symbol.for("react.view_transition"), Du = Symbol.iterator, xi = Array.isArray, pc = /* @__PURE__ */ new WeakMap(), fr = /* @__PURE__ */ new WeakMap(), Gi = /* @__PURE__ */ Symbol.for("react.client.reference"), as = new MessageChannel(), Za = [];
    as.port1.onmessage = function() {
      var e = Za.shift();
      e && e();
    };
    var qc = Promise, Va = typeof queueMicrotask == "function" ? queueMicrotask : function(e) {
      qc.resolve(null).then(e).catch(Be);
    }, hr = null, ir = 0, ba = new TextEncoder(), qn = Object.assign, Hn = Object.prototype.hasOwnProperty, Qa = RegExp(
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
    }, g = {}, T = /^on./, k = /^on[^A-Z]/, P = RegExp(
      "^(aria)-[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    ), V = RegExp(
      "^(aria)[A-Z][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
    ), M = /^(?:webkit|moz|o)[A-Z]/, G = /^-ms-/, re = /-(.)/g, $ = /;\s*$/, ve = {}, De = {}, on = !1, Ze = !1, He = /["'&<>]/, je = /([A-Z])/g, Xe = /^ms-/, at = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i, cn = Jc.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, wn = Kc.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, _n = Object.freeze({
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
              (x = c && 0 < c.remainingCapacity) && (x = (y = "<" + La(e) + ">; rel=dns-prefetch", 0 <= (c.remainingCapacity -= y.length + 2))), x ? (h.resets.dns[e] = An, c.preconnects && (c.preconnects += ", "), c.preconnects += y) : (y = [], Ie(y, { href: e, rel: "dns-prefetch" }), h.preconnects.add(y));
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
              var m, _;
              if (_ = h && 0 < h.remainingCapacity) {
                if (_ = "<" + La(e) + ">; rel=preconnect", typeof t == "string") {
                  var J = tl(
                    t,
                    "crossOrigin"
                  );
                  _ += '; crossorigin="' + J + '"';
                }
                _ = (m = _, 0 <= (h.remainingCapacity -= m.length + 2));
              }
              _ ? (y.resets.connect[x][e] = An, h.preconnects && (h.preconnects += ", "), h.preconnects += m) : (x = [], Ie(x, {
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
                  var m = c.imageSrcSet, _ = c.imageSizes, J = c.fetchPriority;
                var N = m ? m + `
` + (_ || "") : e;
                if (y.imageResources.hasOwnProperty(N)) return;
                y.imageResources[N] = qt, y = x.headers;
                var U;
                y && 0 < y.remainingCapacity && typeof m != "string" && J === "high" && (U = oa(e, t, c), 0 <= (y.remainingCapacity -= U.length + 2)) ? (x.resets.image[N] = qt, y.highImagePreloads && (y.highImagePreloads += ", "), y.highImagePreloads += U) : (y = [], Ie(
                  y,
                  qn(
                    {
                      rel: "preload",
                      href: m ? void 0 : e,
                      as: t
                    },
                    c
                  )
                ), J === "high" ? x.highImagePreloads.add(y) : (x.bulkPreloads.add(y), x.preloads.images.set(N, y)));
                break;
              case "style":
                if (y.styleResources.hasOwnProperty(e)) return;
                m = [], Ie(
                  m,
                  qn({ rel: "preload", href: e, as: t }, c)
                ), y.styleResources[e] = !c || typeof c.crossOrigin != "string" && typeof c.integrity != "string" ? qt : [c.crossOrigin, c.integrity], x.preloads.stylesheets.set(e, m), x.bulkPreloads.add(m);
                break;
              case "script":
                if (y.scriptResources.hasOwnProperty(e)) return;
                m = [], x.preloads.scripts.set(e, m), x.bulkPreloads.add(m), Ie(
                  m,
                  qn({ rel: "preload", href: e, as: t }, c)
                ), y.scriptResources[e] = !c || typeof c.crossOrigin != "string" && typeof c.integrity != "string" ? qt : [c.crossOrigin, c.integrity];
                break;
              default:
                if (y.unknownResources.hasOwnProperty(t)) {
                  if (m = y.unknownResources[t], m.hasOwnProperty(e))
                    return;
                } else
                  m = {}, y.unknownResources[t] = m;
                m[e] = qt, (y = x.headers) && 0 < y.remainingCapacity && t === "font" && (N = oa(e, t, c), 0 <= (y.remainingCapacity -= N.length + 2)) ? (x.resets.font[e] = qt, y.fontPreloads && (y.fontPreloads += ", "), y.fontPreloads += N) : (y = [], e = qn(
                  { rel: "preload", href: e, as: t },
                  c
                ), Ie(y, e), t) === "font" ? x.fontPreloads.add(y) : x.bulkPreloads.add(y);
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
                  var m = h.unknownResources[x];
                  if (m.hasOwnProperty(e)) return;
                } else
                  m = {}, h.moduleUnknownResources[x] = m;
                x = [], m[e] = qt;
            }
            Ie(
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
            x !== An && (h.scriptResources[e] = An, t = qn({ src: e, async: !0 }, t), x && (x.length === 2 && hi(t, x), e = y.preloads.scripts.get(e)) && (e.length = 0), e = [], y.scripts.add(e), Da(e, t), rl(c));
          }
        } else en.X(e, t);
      },
      S: function(e, t, c) {
        var h = Wn || null;
        if (h) {
          var y = h.resumableState, x = h.renderState;
          if (e) {
            t = t || "default";
            var m = x.styles.get(t), _ = y.styleResources.hasOwnProperty(e) ? y.styleResources[e] : void 0;
            _ !== An && (y.styleResources[e] = An, m || (m = {
              precedence: ee(Pe(t)),
              rules: [],
              hrefs: [],
              sheets: /* @__PURE__ */ new Map()
            }, x.styles.set(t, m)), t = {
              state: ma,
              props: qn(
                {
                  rel: "stylesheet",
                  href: e,
                  "data-precedence": t
                },
                c
              )
            }, _ && (_.length === 2 && hi(t.props, _), (x = x.preloads.stylesheets.get(e)) && 0 < x.length ? x.length = 0 : t.state = hu), m.sheets.set(e, t), rl(h));
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
            ), x && (x.length === 2 && hi(t, x), e = y.preloads.moduleScripts.get(e)) && (e.length = 0), e = [], y.scripts.add(e), Da(e, t), rl(c));
          }
        } else en.M(e, t);
      }
    };
    var vt = 0, mn = 1, Rr = 2, In = 4, En = 8, Pn = 32, qe = 64, An = null, qt = [];
    Object.freeze(qt);
    var sn = null;
    X('"></template>');
    var wa = X("<script"), Zi = X("<\/script>"), Cr = X('<script src="'), Pl = X('<script type="module" src="'), Al = X(' nonce="'), Fl = X(' integrity="'), Ei = X(' crossorigin="'), Vi = X(' async=""><\/script>'), Qt = X("<style"), Ja = /(<\/|<)(s)(cript)/gi, Ka = X(
      '<script type="importmap">'
    ), xc = X("<\/script>"), eu = {}, Do = 0, Ta = 1, kr = 2, Ec = 3, Sr = 4, Rl = 5, Qi = 6, Rc = 7, Ji = 8, nu = 9, Lt = X("<!-- -->"), Cc = /* @__PURE__ */ new Map(), pa = X(' style="'), Lo = X(":"), ja = X(";"), Ot = X(" "), Cl = X('="'), un = X('"'), Ki = X('=""'), No = X(
      Pe(
        "javascript:throw new Error('React form unexpectedly submitted.')"
      )
    ), xa = X('<input type="hidden"'), yt = X(">"), Zr = X("/>"), Ea = !1, qa = !1, Ol = !1, dr = !1, zo = !1, mr = !1, Nu = !1, $a = !1, kc = !1, tu = !1, ru = !1, Ri = X(' selected=""'), eo = X(
      `addEventListener("submit",function(a){if(!a.defaultPrevented){var c=a.target,d=a.submitter,e=c.action,b=d;if(d){var f=d.getAttribute("formAction");null!=f&&(e=f,b=null)}"javascript:throw new Error('React form unexpectedly submitted.')"===e&&(a.preventDefault(),b?(a=document.createElement("input"),a.name=b.name,a.value=b.value,b.parentNode.insertBefore(a,b),b=new FormData(c),a.parentNode.removeChild(a)):b=new FormData(c),a=c.ownerDocument||c,(a.$$reactFormReplay=a.$$reactFormReplay||[]).push(c,d,b))}});`
    ), no = X("<!--F!-->"), Pr = X("<!--F-->"), Sc = /(<\/|<)(s)(tyle)/gi, mc = X("<!--head-->"), zu = X("<!--body-->"), Hu = X("<!--html-->"), lu = X(`
`), Bu = /^[a-zA-Z][a-zA-Z:_\.\-\d]*$/, Uu = /* @__PURE__ */ new Map(), Nt = X("<!DOCTYPE html>"), iu = /* @__PURE__ */ new Map(), Pc = X(
      "requestAnimationFrame(function(){$RT=performance.now()});"
    ), Ac = X('<template id="'), au = X('"></template>'), Wu = X("<!--&-->"), ou = X("<!--/&-->"), cu = X("<!--$-->"), Ra = X(
      '<!--$?--><template id="'
    ), _l = X('"></template>'), cs = X("<!--$!-->"), to = X("<!--/$-->"), Fc = X("<template"), ri = X('"'), Ho = X(' data-dgst="'), Ca = X(' data-msg="'), Oc = X(' data-stck="'), ka = X(' data-cstck="'), us = X("></template>"), ss = X('<div hidden id="'), li = X('">'), Bo = X("</div>"), kl = X(
      '<svg aria-hidden="true" style="display:none" id="'
    ), Sa = X('">'), ro = X("</svg>"), Ml = X(
      '<math aria-hidden="true" style="display:none" id="'
    ), Yu = X('">'), fs = X("</math>"), Uo = X('<table hidden id="'), l = X('">'), a = X("</table>"), s = X(
      '<table hidden><tbody id="'
    ), v = X('">'), w = X("</tbody></table>"), C = X('<table hidden><tr id="'), S = X('">'), z = X("</tr></table>"), O = X(
      '<table hidden><colgroup id="'
    ), H = X('">'), Z = X("</colgroup></table>"), K = X(
      '$RS=function(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};$RS("'
    ), xe = X('$RS("'), Te = X('","'), yn = X('")<\/script>');
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
    var bn = X('$RC("'), bt = X(
      `$RM=new Map;$RR=function(n,w,p){function u(q){this._p=null;q()}for(var r=new Map,t=document,h,b,e=t.querySelectorAll("link[data-precedence],style[data-precedence]"),v=[],k=0;b=e[k++];)"not all"===b.getAttribute("media")?v.push(b):("LINK"===b.tagName&&$RM.set(b.getAttribute("href"),b),r.set(b.dataset.precedence,h=b));e=0;b=[];var l,a;for(k=!0;;){if(k){var f=p[e++];if(!f){k=!1;e=0;continue}var c=!1,m=0;var d=f[m++];if(a=$RM.get(d)){var g=a._p;c=!0}else{a=t.createElement("link");a.href=d;a.rel=
"stylesheet";for(a.dataset.precedence=l=f[m++];g=f[m++];)a.setAttribute(g,f[m++]);g=a._p=new Promise(function(q,x){a.onload=u.bind(a,q);a.onerror=u.bind(a,x)});$RM.set(d,a)}d=a.getAttribute("media");!g||d&&!matchMedia(d).matches||b.push(g);if(c)continue}else{a=v[e++];if(!a)break;l=a.getAttribute("data-precedence");a.removeAttribute("media")}c=r.get(l)||h;c===h&&(h=a);r.set(l,a);c?c.parentNode.insertBefore(a,c.nextSibling):(c=t.head,c.insertBefore(a,c.firstChild))}if(p=document.getElementById(n))p.previousSibling.data=
"$~";Promise.all(b).then($RC.bind(null,n,w),$RX.bind(null,n,"CSS failed to load"))};$RR("`
    ), $n = X('$RR("'), gr = X('","'), ll = X('",'), Il = X('"'), Qe = X(")<\/script>");
    X('<template data-rci="" data-bid="'), X('<template data-rri="" data-bid="'), X('" data-sid="'), X('" data-sty="');
    var Ar = X(
      '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};'
    ), _t = X(
      '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};;$RX("'
    ), Vr = X('$RX("'), ji = X('"'), wt = X(","), lo = X(")<\/script>");
    X('<template data-rxi="" data-bid="'), X('" data-dgst="'), X('" data-msg="'), X('" data-stck="'), X('" data-cstck="');
    var Dl = /[<\u2028\u2029]/g, Fr = /[&><\u2028\u2029]/g, ii = X(
      ' media="not all" data-precedence="'
    ), Or = X('" data-href="'), io = X('">'), Wo = X("</style>"), Qr = !1, Yo = !0, _r = [], ao = X(' data-precedence="'), Gu = X('" data-href="'), ot = X(" "), Go = X('">'), ai = X("</style>");
    X('<link rel="expect" href="#'), X('" blocking="render"/>');
    var uu = X(' id="'), oo = X("["), su = X(",["), fu = X(","), Xo = X("]"), ma = 0, hu = 1, Ci = 2, co = 3, uo = /[<>\r\n]/g, hs = /["';,\r\n]/g, Ll = Function.prototype.bind, ds = /* @__PURE__ */ Symbol.for("react.client.reference"), Sl = {};
    Object.freeze(Sl);
    var Pa = {}, qi = null, du = {}, gu = {}, vu = /* @__PURE__ */ new Set(), so = /* @__PURE__ */ new Set(), gs = /* @__PURE__ */ new Set(), Xu = /* @__PURE__ */ new Set(), Zo = /* @__PURE__ */ new Set(), vs = /* @__PURE__ */ new Set(), yu = /* @__PURE__ */ new Set(), ks = /* @__PURE__ */ new Set(), Zu = /* @__PURE__ */ new Set(), Ss = {
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
    }, bu = { id: 1, overflow: "" }, Vo = Math.clz32 ? Math.clz32 : Wc, Ms = Math.log, Is = Math.LN2, ki = Error(
      "Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`."
    ), ys = null, Ds = typeof Object.is == "function" ? Object.is : Yc, ar = null, $i = null, Mr = null, Aa = null, Nl = null, Dn = null, il = !1, ea = !1, zt = 0, _c = 0, wu = -1, bs = 0, Qo = null, fo = null, Mc = 0, oi = !1, ho, Ic = {
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
        return ko;
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
    }, d = 0, b, E, F, I, te, B, j;
    sc.__reactDisabledLog = !0;
    var ge, Ce, ye = !1, ae = new (typeof WeakMap == "function" ? WeakMap : Map)(), fn = {
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
    }, yr = vr.react_stack_bottom_frame.bind(vr), Mn = 0;
    if (typeof performance == "object" && typeof performance.now == "function")
      var $t = performance, Si = function() {
        return $t.now();
      };
    else {
      var Jr = Date;
      Si = function() {
        return Jr.now();
      };
    }
    var _e = 4, Bn = 0, Un = 1, Xn = 2, Tt = 3, Tn = 4, tn = 5, Ir = 14, Wn = null, br = {}, ct = {}, al = {}, Jo = {}, ol = !1, mi = !1, Pi = !1, Ai = 0, or = !1;
    ni(), ni(), Gs.prerender = function(e, t) {
      return new Promise(function(c, h) {
        var y = t ? t.onHeaders : void 0, x;
        y && (x = function(U) {
          y(new Headers(U));
        });
        var m = vl(
          t ? t.identifierPrefix : void 0,
          t ? t.unstable_externalRuntimeSrc : void 0,
          t ? t.bootstrapScriptContent : void 0,
          t ? t.bootstrapScripts : void 0,
          t ? t.bootstrapModules : void 0
        ), _ = Yr(
          e,
          m,
          pr(
            m,
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
        pl(_);
      });
    }, Gs.renderToReadableStream = function(e, t) {
      return new Promise(function(c, h) {
        var y, x, m = new Promise(function(ue, le) {
          x = ue, y = le;
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
        ), U = So(
          e,
          N,
          pr(
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
            ue.allReady = m, c(ue);
          },
          function(ue) {
            m.catch(function() {
            }), h(ue);
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
        pl(U);
      });
    }, Gs.resume = function(e, t, c) {
      return new Promise(function(h, y) {
        var x, m, _ = new Promise(function(oe, se) {
          m = oe, x = se;
        }), J = Kt(
          e,
          t,
          pr(
            t.resumableState,
            c ? c.nonce : void 0,
            void 0,
            void 0,
            void 0,
            void 0
          ),
          c ? c.onError : void 0,
          m,
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
            }), y(oe);
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
        pl(J);
      });
    }, Gs.resumeAndPrerender = function(e, t, c) {
      return new Promise(function(h, y) {
        var x = jn(
          e,
          t,
          pr(
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
          y,
          c ? c.onPostpone : void 0
        );
        if (c && c.signal) {
          var m = c.signal;
          if (m.aborted) Gn(x, m.reason);
          else {
            var _ = function() {
              Gn(x, m.reason), m.removeEventListener("abort", _);
            };
            m.addEventListener("abort", _);
          }
        }
        pl(x);
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
function kf(fe) {
  return String(gh?.[fe] ?? "").trim();
}
function vh() {
  return String(kf("VITE_BACKEND_URL") || "http://localhost:3001").trim().replace(/\/+$/, "").replace(/\/api$/i, "") || "http://localhost:3001";
}
function yh() {
  const fe = kf("VITE_SUPABASE_URL"), ce = kf("VITE_SUPABASE_ANON_KEY");
  return !fe || !ce ? null : { url: fe, anonKey: ce };
}
const bh = "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";
vh(), yh();
function wh(fe) {
  const ce = Number(fe);
  return !Number.isFinite(ce) || ce === 0 ? 0 : ce < 0 ? ce : Math.ceil(ce / 5) * 5;
}
const Th = [
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
function ph(fe) {
  const ce = ["Vanity program"], W = fe.colorLabel?.trim();
  W ? ce.push(`Color: ${W}`) : fe.projectColorTbd && ce.push("Color TBD");
  const Se = fe.materialGroup?.trim();
  return Se && ce.push(Se), ce.join(" · ");
}
function xh(fe) {
  const ce = fe.quoteNumber?.trim();
  if (!ce) return null;
  const W = [fe.projectAddress, fe.city, fe.state].filter(Boolean).join(", "), Se = fe.customerDisplay, nn = Se.preparedByDisplayName || fe.preparedBy || "—";
  return /* @__PURE__ */ q.jsxs("div", { className: "customer-estimate-print", "aria-hidden": "true", children: [
    /* @__PURE__ */ q.jsxs("header", { className: "cep-header", children: [
      /* @__PURE__ */ q.jsx("img", { className: "cep-logo", src: bh, alt: "Elite Stone Fabrication" }),
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
        Se.estimateSummaryRows.map((be) => /* @__PURE__ */ q.jsxs("tr", { children: [
          /* @__PURE__ */ q.jsx("td", { children: be.label }),
          /* @__PURE__ */ q.jsx("td", { className: "cep-amt", children: vf(be.displayAmount) })
        ] }, be.key)),
        /* @__PURE__ */ q.jsxs("tr", { className: "cep-summary-total-row", children: [
          /* @__PURE__ */ q.jsx("td", { children: /* @__PURE__ */ q.jsx("strong", { children: "Estimated project total" }) }),
          /* @__PURE__ */ q.jsx("td", { className: "cep-amt cep-summary-total-value", children: /* @__PURE__ */ q.jsx("strong", { children: vf(Se.finalRounded) }) })
        ] })
      ] }) }),
      /* @__PURE__ */ q.jsx("p", { className: "cep-muted cep-round-note", children: "Estimate only — not a contract." })
    ] }),
    Se.showRoomBreakdown ? /* @__PURE__ */ q.jsxs("section", { className: "cep-section cep-room-breakdown cep-section-compact", children: [
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
        /* @__PURE__ */ q.jsx("tbody", { children: Se.roomAreaPrintRows.map((be) => /* @__PURE__ */ q.jsxs(dh.Fragment, { children: [
          /* @__PURE__ */ q.jsxs("tr", { className: "cep-room-breakdown-main-row", children: [
            /* @__PURE__ */ q.jsxs("td", { children: [
              /* @__PURE__ */ q.jsx("strong", { children: be.displayName }),
              be.isVanity ? /* @__PURE__ */ q.jsxs("span", { className: "cep-muted-inline", children: [
                " ",
                "·",
                " ",
                be.vanityProgramLabel ? `${be.vanityProgramLabel} · ` : "",
                ph({
                  materialGroup: be.materialGroup,
                  colorLabel: be.colorLabel,
                  projectColorTbd: fe.colorTbd
                })
              ] }) : /* @__PURE__ */ q.jsxs("span", { className: "cep-muted-inline", children: [
                " ",
                "· ",
                be.materialGroup,
                be.colorLabel ? ` · ${be.colorLabel}` : fe.colorTbd ? " · Color TBD" : ""
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
          be.customerCustomLines.map((Oe, pn) => /* @__PURE__ */ q.jsxs(
            "tr",
            {
              className: "cep-room-breakdown-detail-row",
              children: [
                /* @__PURE__ */ q.jsx("td", { colSpan: 3, className: "cep-room-custom-line", children: Oe.name }),
                /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: vf(wh(Oe.amountExact)) })
              ]
            },
            Oe.lineKey || `${be.roomId}-custom-${pn}-${Oe.amountExact}`
          )),
          be.customerNoteLines.length > 0 ? /* @__PURE__ */ q.jsx("tr", { className: "cep-room-breakdown-detail-row cep-room-note-row", children: /* @__PURE__ */ q.jsx("td", { colSpan: 4, className: "cep-room-note", children: be.customerNoteLines.join(" ") }) }) : null
        ] }, be.roomId)) }),
        Se.unassignedExact !== 0 ? /* @__PURE__ */ q.jsx("tfoot", { children: /* @__PURE__ */ q.jsxs("tr", { children: [
          /* @__PURE__ */ q.jsx("td", { colSpan: 3, children: Se.unassignedExact < 0 ? "Project discount / credit" : "Other project items (see Estimate summary)" }),
          /* @__PURE__ */ q.jsx("td", { className: "cep-num cep-amt", children: vf(Se.unassignedDisplayTotal) })
        ] }) }) : null
      ] })
    ] }) : null,
    Se.roomComparisonTable ? /* @__PURE__ */ q.jsxs("section", { className: "cep-section cep-section-compact cep-comparison cep-comparison-print", children: [
      /* @__PURE__ */ q.jsx("h2", { className: "cep-h2 cep-h2-muted", children: Se.roomComparisonTable.isPerRoomMode ? "Optional material comparison by room" : "Optional material group comparison" }),
      /* @__PURE__ */ q.jsx("p", { className: "cep-muted cep-comparison-note", children: Se.roomComparisonTable.isPerRoomMode ? "Illustrative only — alternate material tier pricing for the rooms shown. Other rooms use the selected material above." : "Illustrative only — shows estimated area totals at alternate material tiers with the same scope and add-ons." }),
      Se.roomComparisonTable.roomBlocks.map((be) => /* @__PURE__ */ q.jsxs("div", { className: "cep-comparison-room-block", children: [
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
        /* @__PURE__ */ q.jsx("p", { className: "cep-comparison-project-totals-label", children: /* @__PURE__ */ q.jsx("strong", { children: Se.roomComparisonTable.isPerRoomMode ? "Subtotal (shown rooms)" : "Estimated project total" }) }),
        Se.roomComparisonTable.selectedGroups.map((be) => /* @__PURE__ */ q.jsxs("p", { className: "cep-comparison-project-total-line", children: [
          be.group,
          be.colorLabel ? ` · ${be.colorLabel}` : "",
          ":",
          " ",
          /* @__PURE__ */ q.jsx("strong", { children: xs(Se.roomComparisonTable.projectDisplayTotals[be.group] ?? 0) })
        ] }, be.group))
      ] })
    ] }) : null,
    Se.customerFacingNoteLines.length > 0 ? /* @__PURE__ */ q.jsxs("section", { className: "cep-section cep-section-compact cep-project-notes", children: [
      /* @__PURE__ */ q.jsx("h2", { className: "cep-h2", children: "Project Notes" }),
      /* @__PURE__ */ q.jsx("ul", { className: "cep-project-notes-list", children: Se.customerFacingNoteLines.map((be, Oe) => /* @__PURE__ */ q.jsx("li", { children: be }, `note-${Oe}-${be.slice(0, 24)}`)) })
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
      /* @__PURE__ */ q.jsx("div", { className: "cep-branches", children: Th.map((be) => /* @__PURE__ */ q.jsxs("address", { className: "cep-branch", children: [
        /* @__PURE__ */ q.jsx("strong", { children: be.city }),
        be.lines.map((Oe) => /* @__PURE__ */ q.jsx("span", { children: Oe }, Oe))
      ] }, be.city)) }),
      /* @__PURE__ */ q.jsx("p", { className: "cep-website", children: "www.elitestonefabrication.com" })
    ] })
  ] });
}
const Eh = ".cep-header{display:flex;align-items:center;gap:14px;margin-bottom:10px;padding-bottom:10px;border-bottom:2px solid #b91c1c}.cep-header-text{flex:1;min-width:0}.cep-comparison-room-block{margin-bottom:8px}.cep-comparison-group-block{margin-bottom:6px}.cep-comparison-group-heading{margin:0 0 4px;font-size:.72rem}.cep-comparison-detail-table{margin-bottom:4px}.cep-comparison-project-totals{margin-top:6px}.cep-comparison-project-totals-label{margin:0 0 4px;font-size:.66rem}.cep-comparison-project-total-line{margin:2px 0;font-size:.66rem}.cep-logo{width:108px;height:auto;flex-shrink:0}.cep-title{margin:0;font-size:1.2rem;font-weight:700;letter-spacing:-.01em;line-height:1.2;color:#0f172a}.cep-date{margin:4px 0 0;font-size:.8rem;font-weight:500;color:#475569}.cep-section{margin-bottom:8px}.cep-section-compact{margin-bottom:6px}.cep-muted-inline{font-weight:500;color:#64748b;font-size:.66rem}.cep-h2{margin:0 0 5px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#64748b}.cep-h2-muted{color:#94a3b8;font-weight:600}.cep-h3{margin:0 0 4px;font-size:.8rem;font-weight:700;color:#0f172a}.cep-muted{margin:0 0 5px;font-size:.72rem;line-height:1.35;color:#64748b}.cep-overview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 12px;margin:0;padding:8px 10px;border:1px solid #e2e8f0;border-radius:4px;background:#fafbfc}.cep-overview-item{margin:0;min-width:0}.cep-overview-item dt{margin:0;font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748b;line-height:1.2}.cep-overview-item dd{margin:1px 0 0;font-size:.74rem;font-weight:600;color:#0f172a;line-height:1.25}.cep-overview-span-2{grid-column:span 2}.cep-overview-span-3{grid-column:1 / -1}.cep-material-group{margin-bottom:5px}.cep-material-group:last-of-type{margin-bottom:4px}.cep-table-scope tfoot th,.cep-table-scope tfoot td{font-size:.68rem}.cep-material-scope-foot td{font-weight:600;font-size:.68rem;background:#f8fafc;border-top:1px solid #cbd5e1}.cep-material-group-amt{vertical-align:bottom;padding-left:10px!important;white-space:nowrap}.cep-group-material-label{display:block;font-weight:500;font-size:.58rem;color:#64748b;text-transform:none;letter-spacing:normal;line-height:1.2;margin-bottom:1px}.cep-group-material-value{display:block;font-weight:700;font-size:.72rem;color:#475569;font-variant-numeric:tabular-nums}.cep-vanity-group-amt{margin:2px 0 0;text-align:right;font-size:.66rem}.cep-scope-grand{margin:6px 0 0;padding-top:5px;border-top:1px solid #e2e8f0;font-size:.7rem;font-weight:600;color:#475569}.cep-room-breakdown-lead{margin:0 0 8px;max-width:52rem}.cep-room-breakdown-table{page-break-inside:auto}.cep-room-breakdown-main-row td{vertical-align:top;padding-top:6px;padding-bottom:4px}.cep-room-breakdown-detail-row td{padding-top:0;padding-bottom:6px;border-top:none;font-size:.62rem;color:#64748b}.cep-room-addon-list{margin:0;padding:0 0 0 14px;list-style:disc}.cep-room-custom-line{padding-left:14px!important}.cep-addon-room{color:#64748b;font-weight:500}.cep-subtotal-row td{border-top:1px solid #cbd5e1;background:#f8fafc}.cep-num{text-align:right;font-variant-numeric:tabular-nums}.cep-comparison{opacity:.92;padding:6px 8px;border:1px dashed #e2e8f0;border-radius:4px;background:#fafbfc}.cep-comparison-note{margin-bottom:4px;font-size:.66rem}.cep-comparison-table{font-size:.66rem}.cep-comparison-table th{background:#f1f5f9;font-weight:600}.cep-estimate-summary{border:1px solid #cbd5e1;border-radius:4px;padding:8px 10px 6px;background:#fff}.cep-summary-total-row td{border-top:2px solid #0f172a;padding-top:6px}.cep-summary-total-value{font-size:1rem;color:#b91c1c}.cep-round-note{margin-top:4px;font-size:.62rem}.cep-closing{margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0}.cep-terms-box{padding:8px 10px;border:1px solid #cbd5e1;border-radius:4px;background:#fafbfc}.cep-terms-title{margin:0 0 4px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#334155}.cep-terms-list{margin:0;padding-left:1rem;font-size:.64rem;line-height:1.35;color:#334155}.cep-terms-list li{margin-bottom:2px}.cep-project-notes-list{margin:0;padding-left:1rem;font-size:.72rem;line-height:1.4;color:#334155}.cep-project-notes-list li{margin-bottom:3px}.cep-signature-block{margin:8px 0;padding:6px 0 4px}.cep-sig-line-inline{display:grid;grid-template-columns:auto minmax(2rem,1fr) auto 5rem;align-items:flex-end;column-gap:8px;row-gap:0;margin-bottom:9px}.cep-sig-line-inline:last-child{margin-bottom:0}.cep-sig-role{font-size:.66rem;font-weight:600;color:#374151;white-space:nowrap;padding-bottom:2px;line-height:1.2}.cep-sig-role-date{padding-left:4px}.cep-sig-under{border-bottom:1.5px solid #0f172a;min-height:.95em;margin-bottom:1px}.cep-sig-under-main{min-width:0}.cep-sig-under-date{width:100%;max-width:5rem}.cep-branches{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:6px}.cep-branch{margin:0;font-style:normal;font-size:.62rem;line-height:1.35;color:#334155;text-align:center}.cep-branch strong{display:block;margin-bottom:2px;font-size:.66rem;color:#0f172a}.cep-branch span{display:block}.cep-website{margin:0;text-align:center;font-size:.7rem;font-weight:700;letter-spacing:.02em;color:#b91c1c}.cep-table-compact{font-size:.72rem}.cep-table-compact th,.cep-table-compact td{padding:3px 6px}.cep-meta{width:100%;border-collapse:collapse;font-size:.9rem}.cep-meta th{text-align:left;font-weight:600;color:var(--text-secondary);padding:6px 12px 6px 0;width:140px;vertical-align:top}.cep-meta td{padding:6px 0;color:var(--text)}.cep-table{width:100%;border-collapse:collapse;font-size:.86rem}.cep-table th,.cep-table td{border:1px solid var(--border);padding:8px 10px;text-align:left}.cep-table th{background:#f8fafc;font-weight:700;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em}.cep-summary-table tbody tr td{padding-top:3px;padding-bottom:3px}.cep-table-amounts .cep-amt{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}.cep-measure-notes ul{margin:0;padding-left:1.15rem;font-size:.84rem}.cep-round-note{margin:8px 0 0;font-size:.78rem;color:var(--text-secondary)}.cep-total-block{text-align:center;padding:16px;border:2px solid var(--elite-red);border-radius:var(--radius-sm);background:var(--elite-red-soft)}.cep-total-label{margin:0;font-size:.82rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary)}.cep-total-value{margin:6px 0 0;font-size:2rem;font-weight:800;color:var(--elite-red)}.cep-terms ul{margin:0;padding-left:1.2rem;font-size:.84rem;line-height:1.5}";
function tc(fe) {
  return fe && typeof fe == "object" ? fe : null;
}
function St(fe, ce = "") {
  return String(fe ?? "").trim() || ce;
}
function af(fe) {
  return !!fe;
}
function Ma(fe, ce = 0) {
  const W = Number(fe);
  return Number.isFinite(W) ? W : ce;
}
function Rh(fe) {
  const ce = tc(fe);
  if (!ce) return null;
  const W = tc(ce.header), Se = tc(ce.display);
  if (!W || !Se) return null;
  const nn = St(W.quoteNumber);
  if (!nn) return null;
  const be = Array.isArray(Se.estimateSummaryRows) ? Se.estimateSummaryRows.map((A) => {
    const D = tc(A);
    return {
      key: St(D?.key, "row"),
      label: St(D?.label),
      displayAmount: Ma(D?.displayAmount)
    };
  }) : [], Oe = Array.isArray(Se.roomAreaPrintRows) ? Se.roomAreaPrintRows.map((A) => {
    const D = tc(A), Ae = Array.isArray(D?.addonLines) ? D.addonLines.map((ft) => ({ label: St(tc(ft)?.label) })) : [], ee = Array.isArray(D?.customerCustomLines) ? D.customerCustomLines.map((ft) => {
      const tr = tc(ft);
      return {
        lineKey: St(tr?.lineKey) || void 0,
        name: St(tr?.name),
        amountExact: Ma(tr?.amountExact)
      };
    }) : [], X = Array.isArray(D?.customerNoteLines) ? D.customerNoteLines.map((ft) => St(ft)).filter(Boolean) : [];
    return {
      roomId: St(D?.roomId, "room"),
      displayName: St(D?.displayName),
      isVanity: af(D?.isVanity),
      vanityProgramLabel: St(D?.vanityProgramLabel) || void 0,
      materialGroup: St(D?.materialGroup),
      colorLabel: St(D?.colorLabel) || void 0,
      displayedMaterial: Ma(D?.displayedMaterial),
      displayedAddOns: Ma(D?.displayedAddOns),
      displayedAreaTotal: Ma(D?.displayedAreaTotal),
      addonLines: Ae,
      customerCustomLines: ee,
      customerNoteLines: X
    };
  }) : [];
  let pn = null;
  const Re = tc(Se.roomComparisonTable);
  if (Re && Array.isArray(Re.roomBlocks)) {
    const A = Re.roomBlocks.map((ee) => {
      const X = tc(ee), ft = Array.isArray(X?.groupBlocks) ? X.groupBlocks.map((tr) => {
        const Yt = tc(tr);
        return {
          group: St(Yt?.group),
          colorLabel: St(Yt?.colorLabel) || void 0,
          countertopDisplay: Ma(Yt?.countertopDisplay),
          backsplashDisplay: Ma(Yt?.backsplashDisplay),
          fhbDisplay: Ma(Yt?.fhbDisplay),
          addonsDisplay: Ma(Yt?.addonsDisplay),
          roomTotalDisplay: Ma(Yt?.roomTotalDisplay)
        };
      }) : [];
      return {
        roomId: St(X?.roomId, "room"),
        roomDisplayName: St(X?.roomDisplayName),
        isVanity: af(X?.isVanity),
        groupBlocks: ft
      };
    }), D = tc(Re.projectDisplayTotals) != null ? Object.fromEntries(
      Object.entries(tc(Re.projectDisplayTotals)).map(([ee, X]) => [ee, Ma(X)])
    ) : {}, Ae = Array.isArray(Re.selectedGroups) ? Re.selectedGroups.map((ee) => {
      const X = tc(ee);
      return {
        group: St(X?.group),
        colorLabel: St(X?.colorLabel) || void 0
      };
    }) : [];
    pn = {
      roomBlocks: A,
      roomRows: Array.isArray(Re.roomRows) ? Re.roomRows : [],
      projectDisplayTotals: D,
      selectedGroups: Ae,
      isPerRoomMode: af(Re.isPerRoomMode)
    };
  }
  const ie = Array.isArray(Se.customerFacingNoteLines) ? Se.customerFacingNoteLines.map((A) => St(A)).filter(Boolean) : [], Be = {
    estimateSummaryRows: be,
    finalRounded: Ma(Se.finalRounded),
    showRoomBreakdown: af(Se.showRoomBreakdown),
    roomAreaPrintRows: Oe,
    unassignedExact: Ma(Se.unassignedExact),
    unassignedDisplayTotal: Ma(Se.unassignedDisplayTotal),
    roomComparisonTable: pn,
    customerFacingNoteLines: ie,
    preparedByDisplayName: St(Se.preparedByDisplayName)
  };
  return {
    accountName: St(W.accountName),
    customerName: St(W.customerName),
    projectName: St(W.projectName),
    projectAddress: St(W.projectAddress),
    city: St(W.city),
    state: St(W.state),
    branch: St(W.branch),
    salesRep: St(W.salesRep),
    preparedBy: Be.preparedByDisplayName,
    quoteNumber: nn,
    primaryGroup: St(W.primaryGroup),
    primaryColorLabel: St(W.primaryColorLabel),
    colorTbd: af(W.colorTbd),
    estimateTotalExact: Ma(ce.finalRounded),
    customerDisplay: Be,
    estimateDate: St(W.estimateDate)
  };
}
function Ch(fe) {
  const ce = Rh(fe);
  return ce ? fh.renderToStaticMarkup(/* @__PURE__ */ q.jsx(xh, { ...ce })) : "";
}
function kh(fe) {
  const ce = Ch(fe);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Elite Stone Fabrication Estimate</title>
  <style>
    @page { margin: 0.45in; size: letter; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .customer-estimate-print {
      display: block !important;
      color: #0f172a;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 8pt;
      line-height: 1.28;
    }
    ${Eh}
  </style>
</head>
<body>${ce}</body>
</html>`;
}
export {
  kh as buildCustomerEstimatePrintHtml,
  Ch as renderCustomerEstimateDocumentMarkup
};
