# ============================================================
# controls.gd — کنترل: موس = اهرم (اینستراکتور مجازی) + Ctrl = سر خلبان
# + اسکرول گاز + کلیدها — حس وارتاندر
# ============================================================
class_name Controls
extends Node

const AutopilotG = preload("res://scripts/core/autopilot.gd")

var sensitivity := 1.0
var cursor := Vector2.ZERO          # فاصله نشانگر از مرکز (پیکسل)
var cursor_max := 500.0
var look := Vector2.ZERO            # نگاه سر خلبان (yaw, pitch)
var look_mode := false
var locked := false
var throttle := 0.0
var ab := false
var gear := true
var flap_stage := 0
var last_move_ms := 0

var _keys: Dictionary = {}
var _main = null                    # Main
var _cam: Camera3D

func setup(main, cam: Camera3D) -> void:
	_main = main
	_cam = cam
	if is_inside_tree():
		_update_radius()
		get_viewport().size_changed.connect(_update_radius)

func _update_radius() -> void:
	cursor_max = minf(get_viewport().get_visible_rect().size.x,
			get_viewport().get_visible_rect().size.y) * 0.46

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		_keys[event.keycode] = true
		_on_key(event.keycode)
	elif event is InputEventKey and not event.pressed:
		_keys.erase(event.keycode)
	elif event is InputEventMouseMotion:
		if locked:
			if look_mode:
				look.x = clampf(look.x - event.relative.x * 0.0021 * sensitivity, -2.5, 2.5)
				look.y = clampf(look.y - event.relative.y * 0.0021 * sensitivity, -1.15, 1.15)
			else:
				cursor += event.relative * sensitivity
				cursor = cursor.limit_length(cursor_max)
			last_move_ms = Time.get_ticks_msec()
	elif event is InputEventMouseButton and locked:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
			throttle = clampf(throttle + 0.06, 0.0, 1.0)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
			throttle = clampf(throttle - 0.06, 0.0, 1.0)
		elif event.button_index == MOUSE_BUTTON_LEFT:
			pass  # fire در poll

func _on_key(keycode: int) -> void:
	if _main == null:
		return
	match keycode:
		KEY_Z:
			ab = not ab
		KEY_G:
			gear = not gear
		KEY_V:
			flap_stage = (flap_stage + 1) % 3
		KEY_F:
			_main.player_action("missile")
		KEY_B:
			_main.player_action("bomb")
		KEY_R:
			_main.player_action("rocket")
		KEY_C:
			_main.player_action("flares")
		KEY_N:
			_main.player_action("radar")
		KEY_1:
			_main.set_cam_mode(0)
		KEY_2:
			_main.set_cam_mode(1)
		KEY_3:
			_main.set_cam_mode(2)
		KEY_HOME:
			recenter()
		KEY_ESCAPE:
			_main.on_escape()

func recenter() -> void:
	cursor = Vector2.ZERO
	look = Vector2.ZERO

func reset() -> void:
	ab = false
	gear = true
	flap_stage = 0
	throttle = 0.0
	recenter()

func capture() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	locked = true

func release() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	locked = false

# ---------- تولید ورودی هر فریم فیزیک ----------
func build_input(player: Aircraft, dt: float) -> Dictionary:
	var inp := {"pitch": 0.0, "roll": 0.0, "yaw": 0.0, "throttle": throttle,
			"ab": ab, "gear": gear, "flaps": [0.0, 0.5, 1.0][flap_stage],
			"brake": _keys.get(KEY_X, false), "fire": false}
	if _keys.get(KEY_W, false):
		throttle = clampf(throttle + dt * 0.45, 0.0, 1.0)
		inp.throttle = throttle
	if _keys.get(KEY_S, false):
		throttle = clampf(throttle - dt * 0.45, 0.0, 1.0)
		inp.throttle = throttle
	inp.fire = Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) or _keys.get(KEY_SPACE, false)
	look_mode = _keys.get(KEY_CTRL, false)
	# اینستراکتور
	if look_mode:
		AutopilotG.level_hold(player.st, inp)
	else:
		_instructor(player, inp)
	# کیبورد کمکی
	if _keys.get(KEY_UP, false):
		inp.pitch += 0.85
	if _keys.get(KEY_DOWN, false):
		inp.pitch -= 0.85
	if _keys.get(KEY_A, false):
		inp.roll -= 0.7
	if _keys.get(KEY_D, false):
		inp.roll += 0.7
	if _keys.get(KEY_Q, false):
		inp.yaw += 0.6
	if _keys.get(KEY_E, false):
		inp.yaw -= 0.6
	inp.pitch = clampf(inp.pitch, -1.0, 1.0)
	inp.roll = clampf(inp.roll, -1.0, 1.0)
	inp.yaw = clampf(inp.yaw, -1.0, 1.0)
	return inp

# ---------- اینستراکتور مجازی (قلب کنترل موس) ----------
func _instructor(player: Aircraft, inp: Dictionary) -> void:
	var st: Dictionary = player.st
	var cr := cursor.length()
	# نشانگر نزدیک مرکز → پرواز صاف (رها کردن اهرم)
	if cr < cursor_max * 0.055:
		AutopilotG.level_hold(st, inp)
		return
	# جهت هدف از نشانگر روی صفحه
	var vp := _cam.get_viewport().get_visible_rect().size
	var ndc := Vector2(cursor.x / (vp.x / 2.0), -cursor.y / (vp.y / 2.0))
	var from := _cam.project_ray_origin(Vector2(vp.x / 2.0, vp.y / 2.0) + cursor)
	var dir := _cam.project_ray_normal(Vector2(vp.x / 2.0, vp.y / 2.0) + cursor)
	dir = (from + dir * 10000.0 - player.global_position).normalized()
	var loc: Vector3 = st.quat.inverse() * dir
	var azim := atan2(loc.x, -loc.z)
	var elev := atan2(loc.y, maxf(sqrt(loc.x * loc.x + loc.z * loc.z), 0.01))
	# بانک مطلوب — هرچه هدف جوانب‌تر، بانک تندتر
	var want_bank := clampf(azim * 1.5, -1.42, 1.42)
	var err: float = want_bank - AutopilotG.signed_bank(st)
	inp.roll = clampf(err * 1.9 + st.ang.z * 0.14, -1.0, 1.0)
	inp.pitch = clampf(elev * 2.3 - st.ang.x * 0.08, -1.0, 1.0)
	inp.yaw = clampf(azim * 0.28, -0.5, 0.5)
