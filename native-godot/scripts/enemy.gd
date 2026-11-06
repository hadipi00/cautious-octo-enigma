class_name EnemyJet
extends Node3D
## خلبان AI — تعقیب، فرار، شلیک توپ و گاهی موشک

var player
var terrain: AirdomTerrain
var bullets: BulletPool
var missiles: MissileManager

var alive := true
var hp := 3
var speed := 210.0
var _turn_rate := 0.9
var _evade_t := 0.0
var _evade_dir := Vector3.UP
var _gun_cd := 0.0
var _msl_cd := randf_range(9.0, 16.0)
var _skill := 1.0

func _ready() -> void:
	var jet := JetBuilder.build({
		"len": 15.5, "span": 10.5, "wing_type": "swept", "tail_type": "twin",
		"engines": 2, "body": Color(0.40, 0.36, 0.32),
	})
	add_child(jet.node)
	jet.gear.visible = false
	_skill = randf_range(0.75, 1.15)
	_turn_rate *= _skill

func setup(pos: Vector3, heading_deg: float, spd: float) -> void:
	global_position = pos
	rotation.y = -deg_to_rad(heading_deg)
	speed = spd

func _physics_process(dt: float) -> void:
	if not alive or player == null or not player.st.alive:
		return
	_gun_cd -= dt
	_msl_cd -= dt
	_evade_t -= dt

	var to_p: Vector3 = player.global_position - global_position
	var dist := to_p.length()
	var fwd: Vector3 = -global_transform.basis.z

	# انتخاب هدف پرواز
	var target_point: Vector3
	if _evade_t > 0.0:
		target_point = global_position + _evade_dir * 500.0
	elif fwd.dot(to_p.normalized()) < -0.3 and dist < 900.0:
		_evade_t = randf_range(1.8, 2.8)
		_evade_dir = Vector3(randf_range(-1, 1), randf_range(-0.4, 0.8), randf_range(-1, 1)).normalized()
		target_point = global_position + _evade_dir * 500.0
	else:
		# تعقیب با پیش‌بینی
		var closing := clampf(dist / 1200.0, 0.4, 1.6)
		target_point = player.global_position + player.st.vel * closing * 0.7

	# دور شدن از زمین
	var gy := terrain.height_at(global_position.x, global_position.z)
	if global_position.y < gy + 220.0:
		target_point.y = maxf(target_point.y, gy + 450.0)

	var desired := (target_point - global_position).normalized()
	var axis := fwd.cross(desired)
	if axis.length_squared() > 1e-6:
		var ang := fwd.angle_to(desired)
		rotate_object_local(axis.normalized(), minf(ang, _turn_rate * dt))
	global_position += -global_transform.basis.z * speed * dt

	# شلیک توپ
	if _evade_t <= 0.0 and dist < 1400.0 and fwd.dot(to_p.normalized()) > 0.965 and _gun_cd <= 0.0:
		_gun_cd = randf_range(0.6, 1.4) / _skill
		for i in 3:
			var dir: Vector3 = (player.global_position - global_position).normalized()
			dir += Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * 0.012
			bullets.spawn(global_position - global_transform.basis.z * 8.0,
				-global_transform.basis.z * 950.0, false)

	# موشک گاه‌به‌گاه
	if _msl_cd <= 0.0 and dist > 1200.0 and dist < 6000.0 and fwd.dot(to_p.normalized()) > 0.6:
		_msl_cd = randf_range(10.0, 18.0) / _skill
		missiles.launch(global_position, -global_transform.basis.z * speed, player, false)

func take_hit() -> void:
	hp -= 1
	if hp <= 0:
		die()

func die() -> void:
	if not alive:
		return
	alive = false
	queue_free()

func eye_pos() -> Vector3:
	return global_position
