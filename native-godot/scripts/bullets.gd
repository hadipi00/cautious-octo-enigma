class_name BulletPool
extends Node3D
## استخر ترکش‌های توپ — بدون تخصیص حین بازی (Object Pooling)

signal enemy_hit(enemy: Node3D)
signal player_hit

const N := 160
var player: Node3D
var enemies: Array = []
var fx: Node3D

var _items: Array = []

func _ready() -> void:
	var mesh_f := BoxMesh.new()
	mesh_f.size = Vector3(0.14, 0.14, 8.0)
	var mf := StandardMaterial3D.new()
	mf.albedo_color = Color(1.0, 0.95, 0.5)
	mf.emission_enabled = true
	mf.emission = Color(1.0, 0.9, 0.4)
	mf.emission_energy_multiplier = 3.0
	mesh_f.material = mf

	var mesh_e := BoxMesh.new()
	mesh_e.size = Vector3(0.16, 0.16, 8.0)
	var me := StandardMaterial3D.new()
	me.albedo_color = Color(1.0, 0.45, 0.3)
	me.emission_enabled = true
	me.emission = Color(1.0, 0.4, 0.2)
	me.emission_energy_multiplier = 3.0
	mesh_e.material = me

	for i in N:
		var mi := MeshInstance3D.new()
		mi.mesh = mesh_f
		mi.visible = false
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mi)
		_items.append({"node": mi, "vel": Vector3.ZERO, "life": 0.0, "friendly": true, "active": false})

func spawn(pos: Vector3, vel: Vector3, friendly: bool) -> void:
	for it in _items:
		if not it.active:
			it.active = true
			it.life = 1.6
			it.friendly = friendly
			it.vel = vel
			it.node.visible = true
			it.node.global_position = pos
			it.node.global_transform.basis = Basis.looking_at(vel.normalized(), Vector3.UP)
			return

func _physics_process(dt: float) -> void:
	for it in _items:
		if not it.active:
			continue
		var a: Vector3 = it.node.global_position
		it.vel.y -= 3.0 * dt
		var b: Vector3 = a + it.vel * dt
		it.life -= dt
		if it.life <= 0.0:
			_kill(it)
			continue
		if it.friendly:
			for e in enemies:
				if is_instance_valid(e) and e.alive:
					if _seg_sphere(a, b, e.global_position, 7.0):
						enemy_hit.emit(e)
						if fx: fx.spark(e.global_position)
						_kill(it)
						break
		else:
			if player != null and player.st.alive:
				if _seg_sphere(a, b, player.global_position, 5.0):
					player_hit.emit()
					_kill(it)
		if it.active:
			it.node.global_position = b
			it.node.global_transform.basis = Basis.looking_at(it.vel.normalized(), Vector3.UP)

func _kill(it: Dictionary) -> void:
	it.active = false
	it.node.visible = false

func _seg_sphere(a: Vector3, b: Vector3, c: Vector3, r: float) -> bool:
	var ab := b - a
	var t := clampf((c - a).dot(ab) / maxf(ab.length_squared(), 0.001), 0.0, 1.0)
	var p := a + ab * t
	return p.distance_to(c) <= r
