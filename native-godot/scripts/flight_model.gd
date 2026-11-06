class_name FlightModel
extends RefCounted
## فلایت‌مدل سمی‌رئال — برآر/پسا/استال/G/افتربرنر؛ انتگرال‌گیری گام ثابت

const G0 := 9.80665

static func air_density(h: float) -> float:
	return 1.225 * exp(-maxf(h, 0.0) / 8500.0)

static func speed_of_sound(h: float) -> float:
	return 340.3 - 0.0038 * maxf(h, 0.0)

static func make_state() -> Dictionary:
	return {
		"pos": Vector3.ZERO, "vel": Vector3.ZERO, "basis": Basis(),
		"ang": Vector3.ZERO,
		"throttle": 0.0, "ab": false, "gear": true, "flaps": 0.0, "brake": false,
		"fuel": 1e9, "on_ground": false, "alive": true,
		"g": 1.0, "alpha": 0.0, "mach": 0.0, "v": 0.0, "lift": 0.0,
		"ground_y": 0.0,
		"stalled": false, "blackout": 0.0, "redout": 0.0, "afterburner": false,
	}

static func step(st: Dictionary, spec: Dictionary, inp: Dictionary, dt: float) -> void:
	var mass: float = spec.mass + st.fuel
	var fwd: Vector3 = -st.basis.z
	var up: Vector3 = st.basis.y
	var right: Vector3 = st.basis.x

	var V: float = st.vel.length()
	st.v = V
	var vf: float = st.vel.dot(fwd)
	var vu: float = st.vel.dot(up)
	var vr: float = st.vel.dot(right)

	var rho: float = air_density(st.pos.y)
	var q := 0.5 * rho * V * V
	var S: float = spec.wing_area

	var alpha := atan2(-vu, maxf(vf, 2.0)) if V > 8.0 else 0.0
	var beta := atan2(vr, maxf(vf, 2.0)) if V > 8.0 else 0.0
	st.alpha = alpha
	st.mach = V / speed_of_sound(st.pos.y)

	var a_stall: float = deg_to_rad(spec.a_stall)
	var cl_max: float = spec.cl0 + spec.cla * a_stall
	var cl: float = spec.cl0 + spec.cla * alpha
	st.stalled = false
	if not st.on_ground and absf(alpha) > a_stall:
		st.stalled = true
		var over := absf(alpha) - a_stall
		cl = signf(alpha) * cl_max * maxf(0.3, 1.0 - over / 0.45)

	var cd: float = spec.cd0 + spec.k_ind * cl * cl
	cd += 0.022 * st.flaps + (0.020 if st.gear else 0.0) + (0.055 if st.brake else 0.0)
	if st.mach > 0.92:
		cd += 0.045 * clampf((st.mach - 0.92) / 0.16, 0.0, 1.0)

	var thrust := 0.0
	if st.fuel > 0.0:
		thrust = st.throttle * (spec.thrust_ab if st.ab else spec.thrust_mil)
		st.fuel = maxf(0.0, st.fuel - (spec.burn_ab if st.ab else spec.burn_mil) * st.throttle * dt)
	st.afterburner = st.ab and st.throttle > 0.98 and st.fuel > 0.0

	var L := q * S * cl
	var D := q * S * cd
	var Yf := -q * S * 1.15 * beta
	st.lift = L

	var vel_dir: Vector3 = fwd if V < 0.5 else st.vel / V
	var lift_dir: Vector3 = up - vel_dir * up.dot(vel_dir)
	lift_dir = lift_dir.normalized() if lift_dir.length_squared() > 1e-6 else up

	var aero := fwd * thrust - vel_dir * D + lift_dir * L + right * Yf
	var g_raw := aero.dot(up) / (mass * G0)
	st.g = lerpf(st.g, g_raw, 1.0 - exp(-dt / 0.25))

	if st.g > 6.5:
		st.blackout = clampf(st.blackout + (st.g - 6.5) * 0.10 * dt, 0.0, 1.0)
	else:
		st.blackout = clampf(st.blackout - 0.35 * dt, 0.0, 1.0)
	if st.g < -1.2:
		st.redout = clampf(st.redout + (-1.2 - st.g) * 0.12 * dt, 0.0, 1.0)
	else:
		st.redout = clampf(st.redout - 0.5 * dt, 0.0, 1.0)

	# ---------- کنترل ----------
	var ctrl_eff := 0.12 if st.on_ground else clampf(q / 26000.0, 0.10, 1.0)
	var fbw: bool = inp.get("fbw", true)
	var pitch_t: float = inp.pitch * deg_to_rad(spec.pitch_rate) * ctrl_eff   # مثبت = دماغه بالا (rotX+)
	var roll_t: float = -inp.roll * deg_to_rad(spec.roll_rate) * ctrl_eff     # منفی rotZ = غلت راست
	var yaw_t: float = -inp.yaw * deg_to_rad(spec.yaw_rate) * ctrl_eff        # منفی rotY = دماغه راست

	if fbw and V > 40.0 and not st.on_ground:
		var n_max: float = spec.max_g * 0.92
		var alpha_max: float = clampf((n_max * mass * G0 / maxf(q * S, 1.0) - spec.cl0) / spec.cla, -0.05, a_stall * 1.08)
		var alpha_min: float = clampf((-2.5 * mass * G0 / maxf(q * S, 1.0) - spec.cl0) / spec.cla, -0.30, 0.05)
		var lead := 0.32
		var a_fut := alpha + pitch_t * lead
		if a_fut > alpha_max:
			pitch_t = (alpha_max - alpha) / lead
		if a_fut < alpha_min:
			pitch_t = (alpha_min - alpha) / lead

	if st.stalled:
		st.ang.x += randf_range(-1.0, 0.6) * 0.35 * dt * 10.0
		st.ang.z += randf_range(-1.0, 1.0) * 0.35 * dt * 14.0
		if alpha > a_stall * 1.2:
			pitch_t = minf(pitch_t, -0.20)   # دماغه می‌خواهد بیفتد

	# دستیار نگه‌داشتن ارتفاع وقتی خلبان کاری نمی‌کند (FBW روشن)
	if fbw and inp.pitch == 0.0 and not st.on_ground and V > 40.0:
		pitch_t += clampf(-st.vel.y * 0.0025, -0.10, 0.10) * ctrl_eff

	if not fbw and V > 40.0 and not st.on_ground:
		pitch_t -= alpha * 1.1 * ctrl_eff
		yaw_t -= beta * 2.2 * ctrl_eff

	var k := 1.0 - exp(-dt / 0.12)
	st.ang.x = lerpf(st.ang.x, pitch_t, k)
	st.ang.y = lerpf(st.ang.y, yaw_t, k)
	st.ang.z = lerpf(st.ang.z, roll_t, k)

	st.basis = (st.basis * Basis.from_euler(st.ang * dt)).orthonormalized()

	st.vel += aero * (dt / mass)
	st.vel.y -= G0 * dt
	st.pos += st.vel * dt
