class_name MissileManager
extends Node3D
## موشک‌های هدایت‌شونده + فلرها

signal enemy_killed(enemy: Node3D)

var player
var enemies: Array = []
var fx: Node3D
var audio: GameAudio
var warning := false   # موشک دشمن در راه است

var _missiles: Array = []
var _flares: Array = []

func launch(pos: Vector3, vel: Vector3, target: Node3D, friendly: bool) -> void:
	var node := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.16
	mesh.bottom_radius = 0.16
	mesh.height = 2.2
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.85, 0.85, 0.88)
	mat.metallic = 0.6
	mat.roughness = 0.4
	mesh.material = mat
	node.mesh = mesh

	var flame := StandardMaterial3D.new()
	flame.albedo_color = Color(1.0, 0.6, 0.2)
	flame.emission_enabled = true
	flame.emission = Color(1.0, 0.55, 0.15)
	flame.emission_energy_multiplier = 3.0

	# دنباله دود
	var trail := CPUParticles3D.new()
	trail.amount = 90
	trail.lifetime = 1.4
	trail.local_coords = false
	trail.mesh = _puff_mesh()
	trail.gravity = Vector3(0, 3, 0)
	trail.initial_velocity_min = 0.5
	trail.initial_velocity_max = 1.5
	trail.scale_amount_min = 1.5
	trail.scale_amount_max = 3.5
	var g := Gradient.new()
	g.colors = PackedColorArray([Color(0.9, 0.9, 0.9, 0.55), Color(0.6, 0.6, 0.6, 0.0)])
	trail.color_ramp = g
	node.add_child(trail)

	add_child(node)
	node.global_position = pos
	node.global_transform.basis = Basis.looking_at(vel.normalized(), Vector3.UP)
	_missiles.append({
		"node": node, "vel": vel.normalized() * minf(vel.length() + 120.0, 500.0),
		"life": 15.0, "target": target, "friendly": friendly, "motor": 3.0,
	})
	if not friendly and target == player:
		warning = true
		if audio:
			audio.beep(1400.0, 0.12, 0.25)

func drop_flares(pos: Vector3, vel: Vector3) -> void:
	for i in 8:
		var node := Node3D.new()
		var s := SphereMesh.new()
		s.radius = 0.5
		s.height = 1.0
		var m := StandardMaterial3D.new()
		m.albedo_color = Color(1.0, 0.85, 0.4)
		m.emission_enabled = true
		m.emission = Color(1.0, 0.8, 0.3)
		m.emission_energy_multiplier = 5.0
		s.material = m
		node.add_child(_wrap(s))
		var light := OmniLight3D.new()
		light.light_color = Color(1.0, 0.7, 0.3)
		light.light_energy = 6.0
		light.omni_range = 60.0
		node.add_child(light)
		add_child(node)
		node.global_position = pos
		_flares.append({
			"node": node, "life": 4.5,
			"vel": vel * 0.5 + Vector3(randf_range(-40, 40), randf_range(-20, 10), randf_range(-40, 40)),
		})
	# گول‌زنی: موشک‌های دشمن با شانس به فلر می‌روند
	for m in _missiles:
		if not m.friendly and m.target == player and randf() < 0.75:
			var newest: Node3D = _flares[_flares.size() - 1 - randi() % mini(8, _flares.size())].node
			m.target = newest

func _wrap(mesh: Mesh) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi

func _puff_mesh() -> Mesh:
	var bm := SphereMesh.new()
	bm.radius = 1.0
	bm.height = 2.0
	bm.radial_segments = 6
	bm.rings = 4
	var m := StandardMaterial3D.new()
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.albedo_color = Color(0.85, 0.85, 0.85, 0.4)
	bm.material = m
	return bm

func _physics_process(dt: float) -> void:
	warning = false
	var p_alive: bool = player != null and player.st.alive

	for m in _missiles.duplicate():
		m.life -= dt
		m.motor -= dt
		var node: MeshInstance3D = m.node
		var speed: float = m.vel.length()
		if m.motor > 0.0:
			speed = minf(speed + 260.0 * dt, 1000.0)
		else:
			speed = maxf(speed - 40.0 * dt, 300.0)

		if is_instance_valid(m.target) and (m.target != player or p_alive):
			var tp: Vector3 = m.target.global_position
			# پیش‌بینی هدف
			if m.target == player:
				tp += player.st.vel * node.global_position.distance_to(tp) / maxf(speed, 1.0) * 0.8
			var desired := (tp - node.global_position).normalized()
			var cur: Vector3 = m.vel.normalized()
			var axis := cur.cross(desired)
			if axis.length_squared() > 1e-6:
				var max_turn := 3.2 * dt
				var ang := cur.angle_to(desired)
				var new_dir := cur.rotated(axis.normalized(), minf(ang, max_turn))
				m.vel = new_dir * speed
			# برخورد نزدیک
			if node.global_position.distance_to(m.target.global_position) < 11.0:
				_boom(m)
				continue
			if m.target == player:
				warning = true
		else:
			m.vel = m.vel.normalized() * speed

		node.global_position += m.vel * dt
		node.global_transform.basis = Basis.looking_at(m.vel.normalized(), Vector3.UP)
		if m.life <= 0.0 or node.global_position.y < 5.0:
			_boom(m)

	for f in _flares.duplicate():
		f.life -= dt
		f.vel.y -= 6.0 * dt
		f.node.global_position += f.vel * dt
		if f.life <= 0.0:
			f.node.queue_free()
			_flares.erase(f)

func _boom(m: Dictionary) -> void:
	if fx:
		fx.explosion(m.node.global_position, 1.0)
	if m.friendly and is_instance_valid(m.target) and m.target.has_method("take_hit"):
		m.target.take_hit()
		if m.target is EnemyJet:
			enemy_killed.emit(m.target)
	elif not m.friendly and m.target == player and player.st.alive:
		player.take_hit()
	m.node.queue_free()
	_missiles.erase(m)

func missiles_left_check() -> void:
	pass
