class_name PlayerJet
extends Node3D
## جت بازیکن: ورودی، فلایت‌مدل، برخورد زمین، دوربین، تسلیحات

signal crashed(reason: String)
signal hit_taken

var terrain: AirdomTerrain
var hud: AirdomHud
var audio: GameAudio
var bullets: BulletPool
var missiles: MissileManager
var enemies: Array = []

var spec := {
	"mass": 8600.0, "fuel_cap": 3200.0, "thrust_mil": 79000.0, "thrust_ab": 129000.0,
	"burn_mil": 1.15, "burn_ab": 5.5, "wing_area": 27.9, "cl0": 0.02, "cla": 4.6,
	"a_stall": 15.0, "cd0": 0.021, "k_ind": 0.13, "max_g": 9.0,
	"roll_rate": 270.0, "pitch_rate": 22.0, "yaw_rate": 9.0,
}
var st: Dictionary = FlightModel.make_state()
var fuel := 3200.0

var _jet: Dictionary
var _cam: Camera3D
var _look := Vector2.ZERO
var _last_move := 0.0
var _cam_mode := 1
var _flap_stage := 0
var _fire_cd := 0.0
var _gun_time := 0.0
var _lock_t := 0.0
var _locked: Node3D = null
var _missiles_left := 4
var _flares_left := 60
var _hp := 5
var _sens := 0.0022

func _ready() -> void:
	_jet = JetBuilder.build({
		"len": 15.0, "span": 9.96, "wing_type": "swept", "tail_type": "single",
		"engines": 1, "body": Color("#7f8d9d"),
	})
	add_child(_jet.node)
	st.fuel = fuel

	_cam = Camera3D.new()
	_cam.fov = 70.0
	_cam.near = 0.3
	_cam.far = 45000.0
	_cam.top_level = true
	add_child(_cam)
	_cam.current = true

func spawn_air(alt := 1500.0, heading_deg := 90.0) -> void:
	st.pos = Vector3(-2600, terrain.height_at(-2600, 300) + alt, 300)
	st.basis = Basis.from_euler(Vector3(0, -deg_to_rad(heading_deg), 0))
	st.vel = -st.basis.z * 220.0
	st.throttle = 0.75
	st.gear = false
	st.alive = true
	visible = true

func spawn_runway() -> void:
	var gy := terrain.height_at(AirdomTerrain.F_BASE.x, AirdomTerrain.F_BASE.y + 1000.0)
	st.pos = Vector3(AirdomTerrain.F_BASE.x, gy + 2.1, AirdomTerrain.F_BASE.y + 1000.0)
	st.basis = Basis()
	st.vel = Vector3.ZERO
	st.throttle = 0.0
	st.gear = true
	st.flaps = 1.0
	_flap_stage = 2
	st.alive = true
	visible = true

func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		_look.x = clampf(_look.x - e.relative.x * _sens, -2.6, 2.6)
		_look.y = clampf(_look.y - e.relative.y * _sens, -1.15, 1.15)
		_last_move = Time.get_ticks_msec()
	elif e is InputEventKey and e.pressed and not e.echo:
		match e.keycode:
			KEY_Z: st.ab = not st.ab
			KEY_G: st.gear = not st.gear
			KEY_V: _flap_stage = (_flap_stage + 1) % 3
			KEY_1: _cam_mode = 0
			KEY_2: _cam_mode = 1
			KEY_3: _cam_mode = 2
			KEY_F: _fire_missile()
			KEY_C: _drop_flares()

func _physics_process(dt: float) -> void:
	if not st.alive:
		return
	var inp := _read_input(dt)

	# ضعف کنترل هنگام blackout
	var bo: float = maxf(st.blackout, st.redout)
	if bo > 0.0:
		inp.pitch *= 1.0 - bo * 0.7
		inp.roll *= 1.0 - bo * 0.5
		inp.yaw *= 1.0 - bo * 0.5

	var steps := clampi(ceili(dt / (1.0 / 120.0)), 1, 5)
	var h := dt / steps
	for i in steps:
		FlightModel.step(st, spec, inp, h)
		_ground(h, inp)
		if not st.alive:
			return

	# ظاهر
	position = st.pos
	global_transform.basis = st.basis
	_jet.gear.visible = st.gear
	for m in _jet.ab:
		m.visible = st.afterburner

	_lock_logic(dt)
	_weapons(dt, inp)
	_camera(dt)
	if audio:
		audio.update_engine(st.throttle, st.afterburner, st.v)
	if hud:
		hud.update_player(self)

func _read_input(dt: float) -> Dictionary:
	var k := Input
	if k.is_key_pressed(KEY_W):
		st.throttle = clampf(st.throttle + dt * 0.45, 0.0, 1.0)
	if k.is_key_pressed(KEY_S):
		st.throttle = clampf(st.throttle - dt * 0.45, 0.0, 1.0)
	st.flaps = [0.0, 0.5, 1.0][_flap_stage]
	st.brake = k.is_key_pressed(KEY_X)
	return {
		"pitch": (1.0 if k.is_key_pressed(KEY_DOWN) else 0.0) - (1.0 if k.is_key_pressed(KEY_UP) else 0.0),
		"roll": (1.0 if k.is_key_pressed(KEY_D) else 0.0) - (1.0 if k.is_key_pressed(KEY_A) else 0.0),
		"yaw": (1.0 if k.is_key_pressed(KEY_E) else 0.0) - (1.0 if k.is_key_pressed(KEY_Q) else 0.0),
		"fbw": true,
		"fire": k.is_key_pressed(KEY_SPACE) or k.is_mouse_button_pressed(MOUSE_BUTTON_LEFT),
	}

func _ground(dt: float, inp: Dictionary) -> void:
	var gy: float = terrain.height_at(st.pos.x, st.pos.z)
	st.ground_y = gy
	var gh: float = 2.1 if st.gear else 1.05
	if st.pos.y < gy + gh + 0.05:
		if not st.on_ground:
			var right: Vector3 = st.basis.x
			var up_y: float = st.basis.y.y
			var bank: float = absf(asin(clampf(right.y, -1.0, 1.0)))
			var sink: float = -st.vel.y
			if not st.gear:
				_die("بدون چرخ فرود به زمین خوردی!")
				return
			if sink > 9.0:
				_die("فرود سخت — نرخ فرود %.0f متر بر ثانیه بود (حداکثر ۹)" % sink)
				return
			if bank > 0.5 or up_y < 0.55:
				_die("وضعیت هواپیما هنگام تماس نامناسب بود")
				return
			st.on_ground = true
		st.pos.y = gy + gh
		if st.vel.y < 0.0:
			st.vel.y = 0.0
		var hspd: float = Vector2(st.vel.x, st.vel.z).length()
		if hspd > 0.05:
			var dec: float = (3.8 if st.brake else 0.3) * dt
			var ns := maxf(0.0, hspd - dec)
			st.vel.x *= ns / hspd
			st.vel.z *= ns / hspd
		var right2: Vector3 = st.basis.x
		var lat: float = st.vel.dot(right2)
		st.vel -= right2 * lat * minf(1.0, 5.0 * dt)
		var steer: float = inp.yaw * clampf(0.9 - hspd * 0.011, 0.04, 0.9)
		st.basis = st.basis.rotated(Vector3.UP, -steer * dt).orthonormalized()
		# صاف کردن غلت روی زمین
		var rx: float = asin(clampf(st.basis.x.y, -1.0, 1.0))
		st.basis = st.basis.rotated(st.basis.z, rx * 3.0 * dt).orthonormalized()
		# نشستن دماغه (وقتی خلبان نمی‌کشد)
		var fwd2: Vector3 = -st.basis.z
		if (hspd < 45.0 or inp.pitch <= 0.0) and fwd2.y < 0.25:
			st.basis = (st.basis * Basis.from_euler(Vector3(-fwd2.y * 2.5 * dt, 0, 0))).orthonormalized()
		if st.lift > (spec.mass + st.fuel) * FlightModel.G0 * 1.03:
			st.on_ground = false
	elif st.on_ground and st.pos.y > gy + gh + 0.3:
		st.on_ground = false

func _camera(dt: float) -> void:
	if Time.get_ticks_msec() - _last_move > 1600:
		_look = _look.lerp(Vector2.ZERO, 1.0 - exp(-4.0 * dt))
	var fwd: Vector3 = -st.basis.z
	var target_fov := 70.0
	if _cam_mode == 0:
		_cam.global_position = st.pos + fwd * 4.2 + st.basis.y * 0.85
		var look_basis := Basis.from_euler(Vector3(_look.y, _look.x, 0), EULER_ORDER_YXZ)
		_cam.global_transform.basis = (st.basis * look_basis).orthonormalized()
		target_fov = 76.0
	else:
		var back := 17.0 if _cam_mode == 1 else 34.0
		var up_o := 4.6 if _cam_mode == 1 else 9.0
		var off: Vector3 = st.basis * Vector3(0, up_o, back)
		if _look.x != 0.0:
			off = off.rotated(Vector3.UP, _look.x)
		if _look.y != 0.0:
			off = off.rotated(st.basis.x, -_look.y)
		var desired: Vector3 = st.pos + off
		_cam.global_position = _cam.global_position.lerp(desired, 1.0 - exp(-6.5 * dt))
		var aim: Vector3 = st.pos + fwd * 45.0
		_cam.look_at(aim, Vector3.UP)
	var shake: float = (0.22 if st.stalled else 0.0) + maxf(0.0, st.g - 6.5) * 0.05
	if shake > 0.001:
		_cam.global_position += Vector3(randf() - 0.5, randf() - 0.5, randf() - 0.5) * shake
	if absf(_cam.fov - target_fov) > 0.1:
		_cam.fov = lerpf(_cam.fov, target_fov, 1.0 - exp(-6.0 * dt))

func _lock_logic(dt: float) -> void:
	var fwd: Vector3 = -st.basis.z
	var best: Node3D = null
	var best_score := 1e9
	for e in enemies:
		if not is_instance_valid(e) or not e.alive:
			continue
		var to: Vector3 = e.global_position - st.pos
		var d := to.length()
		if d > 9000.0:
			continue
		if fwd.dot(to.normalized()) < cos(deg_to_rad(28.0)):
			continue
		if d < best_score:
			best_score = d
			best = e
	if best != null:
		if _locked == best:
			_lock_t = minf(_lock_t + dt, 1.2)
		else:
			_locked = best
			_lock_t = 0.0
		if _lock_t >= 1.2 and audio:
			audio.beep(1200.0, 0.06, 0.12)
	else:
		_locked = null
		_lock_t = 0.0

func _weapons(dt: float, inp: Dictionary) -> void:
	_fire_cd -= dt
	_gun_time -= dt
	if inp.fire and _fire_cd <= 0.0 and fuel > 0.0:
		_fire_cd = 0.02
		var fwd: Vector3 = -st.basis.z
		var spread := Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * 0.006
		var dir := (fwd + spread).normalized()
		bullets.spawn(st.pos + fwd * 7.0, st.vel + dir * 1050.0, true)
		if _gun_time <= 0.0:
			_gun_time = 0.09
			if audio:
				audio.gun()
			if hud:
				hud.muzzle_flash()

func _fire_missile() -> void:
	if _missiles_left <= 0 or _locked == null or _lock_t < 1.2:
		if audio:
			audio.beep(400.0, 0.1, 0.15)
		return
	_missiles_left -= 1
	missiles.launch(st.pos - st.basis.z * 2.0 + st.basis.y * -1.5, st.vel + -st.basis.z * 60.0, _locked, true)
	if audio:
		audio.missile()
	if hud:
		hud.banner("موشک شلیک شد")

func _drop_flares() -> void:
	if _flares_left < 8:
		return
	_flares_left -= 8
	missiles.drop_flares(st.pos, st.vel)
	if audio:
		audio.beep(700.0, 0.08, 0.12)

func take_hit() -> void:
	_hp -= 1
	if hud:
		hud.flash_damage()
	if audio:
		audio.beep(220.0, 0.15, 0.3)
	if hud:
		hud.banner("اصابت! سلامتی: %d" % _hp)
	if _hp <= 0:
		_die("هواپیمایت سرنگون شد")

func _die(reason: String) -> void:
	if not st.alive:
		return
	st.alive = false
	visible = false
	crashed.emit(reason)

func lock_progress() -> float:
	return clampf(_lock_t / 1.2, 0.0, 1.0)
func locked_target() -> Node3D:
	return _locked
func missiles_left() -> int:
	return _missiles_left
func flares_left() -> int:
	return _flares_left
func hp_left() -> int:
	return _hp
