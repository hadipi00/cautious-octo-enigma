# ============================================================
# hangar_scene.gd — آشیانه سه‌بعدی وارتاندر-سبک
# سکو + جت نمایشی + نورپردازی استودیویی + درِ باز + گردوغبار
# دوربین مداری: درگ = چرخش، اسکرول = زوم
# ============================================================
class_name HangarScene
extends Node3D

const JetBuilderG = preload("res://scripts/planes/jet_builder.gd")

var cam_az := 0.9
var cam_az_target := 0.9
var cam_pol := 0.30
var cam_pol_target := 0.30
var cam_r := 26.0
var cam_r_target := 26.0
var _drag := false
var _last_mouse := Vector2.ZERO
var _jet: Node3D = null
var _t := 0.0
var key_light: SpotLight3D

func _ready() -> void:
	_build()

func _build() -> void:
	var W := 44.0
	var D := 52.0
	var H := 16.0
	# کف
	var floor_mesh := MeshInstance3D.new()
	var fp := PlaneMesh.new()
	fp.size = Vector2(W + 24, D + 24)
	floor_mesh.mesh = fp
	var fmat := StandardMaterial3D.new()
	fmat.albedo_color = Color(0.36, 0.37, 0.39)
	fmat.roughness = 0.85
	fmat.metallic = 0.05
	floor_mesh.material_override = fmat
	add_child(floor_mesh)
	# دیوارها
	var wmat := StandardMaterial3D.new()
	wmat.albedo_color = Color(0.30, 0.33, 0.36)
	wmat.metallic = 0.45
	wmat.roughness = 0.7
	for cfg in [[Vector3(0, H / 2, -D / 2), Vector2(W, H)],
			[Vector3(-W / 2, H / 2, 0), Vector2(D, H)],
			[Vector3(W / 2, H / 2, 0), Vector2(D, H)]]:
		var wall := MeshInstance3D.new()
		var wb := BoxMesh.new()
		wb.size = Vector3(cfg[1].x, cfg[1].y, 0.5)
		wall.mesh = wb
		wall.position = cfg[0]
		wall.material_override = wmat
		add_child(wall)
	# جلو: دو پنل + بالای در
	for cfg in [[Vector3(-W * 0.36, H / 2, D / 2), Vector2(W * 0.28, H)],
			[Vector3(W * 0.36, H / 2, D / 2), Vector2(W * 0.28, H)],
			[Vector3(0, H * 0.85, D / 2), Vector2(W * 0.44, H * 0.3)]]:
		var wall2 := MeshInstance3D.new()
		var wb2 := BoxMesh.new()
		wb2.size = Vector3(cfg[1].x, cfg[1].y, 0.5)
		wall2.mesh = wb2
		wall2.position = cfg[0]
		wall2.material_override = wmat
		add_child(wall2)
	# درِ باز رو به آسمان
	var door := MeshInstance3D.new()
	var dq := PlaneMesh.new()
	dq.size = Vector2(W * 0.42, H * 0.7)
	door.mesh = dq
	door.position = Vector3(0, H * 0.35, D / 2 - 0.1)
	door.rotation.x = -PI / 2
	var dmat := StandardMaterial3D.new()
	dmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	dmat.albedo_color = Color(0.62, 0.78, 0.93)
	dmat.emission_enabled = true
	dmat.emission = Color(0.62, 0.78, 0.93)
	dmat.emission_energy_multiplier = 1.6
	door.material_override = dmat
	add_child(door)
	# سقف
	var roof := MeshInstance3D.new()
	var rb := BoxMesh.new()
	rb.size = Vector3(W + 2, 0.6, D + 2)
	roof.mesh = rb
	roof.position = Vector3(0, H + 0.3, 0)
	roof.material_override = wmat
	add_child(roof)
	# اسکای‌لایت
	var skylight := MeshInstance3D.new()
	var sq := PlaneMesh.new()
	sq.size = Vector2(W * 0.5, D * 0.5)
	skylight.mesh = sq
	skylight.position = Vector3(0, H - 0.25, 0)
	skylight.rotation.x = PI / 2
	var skmat := StandardMaterial3D.new()
	skmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	skmat.albedo_color = Color(0.87, 0.92, 1.0)
	skmat.emission_enabled = true
	skmat.emission = Color(0.87, 0.92, 1.0)
	skmat.emission_energy_multiplier = 2.2
	skylight.material_override = skmat
	add_child(skylight)
	# چراغ‌های سقفی
	for lamp_pos in [Vector3(-12, H - 1.6, -14), Vector3(12, H - 1.6, -14), Vector3(-12, H - 1.6, 8), Vector3(12, H - 1.6, 8), Vector3(0, H - 1.6, -2)]:
		var lamp := MeshInstance3D.new()
		var lc := CylinderMesh.new()
		lc.top_radius = 0.9
		lc.bottom_radius = 1.1
		lc.height = 0.4
		lamp.mesh = lc
		lamp.position = lamp_pos
		var lmat := StandardMaterial3D.new()
		lmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		lmat.albedo_color = Color(1.0, 0.95, 0.85)
		lmat.emission_enabled = true
		lmat.emission = Color(1.0, 0.95, 0.85)
		lmat.emission_energy_multiplier = 2.5
		lamp.material_override = lmat
		add_child(lamp)
	# نورها
	add_child(_mk_hemi())
	key_light = _mk_spot(Color(1.0, 0.9, 0.75), 32000.0, Vector3(14, 15, 16))
	key_light.position = Vector3(14, 15, 16)
	add_child(key_light)
	var rim := _mk_spot(Color(0.5, 0.64, 1.0), 16000.0, Vector3(-16, 12, -14))
	rim.position = Vector3(-16, 12, -14)
	add_child(rim)
	var fill := OmniLight3D.new()
	fill.light_color = Color(1.0, 0.85, 0.65)
	fill.light_energy = 3200.0
	fill.omni_range = 60.0
	fill.position = Vector3(-10, 8, 10)
	add_child(fill)
	# سکو
	var pod := MeshInstance3D.new()
	var pc := CylinderMesh.new()
	pc.top_radius = 11.5
	pc.bottom_radius = 12.2
	pc.height = 0.55
	pod.mesh = pc
	pod.position.y = 0.28
	var pmat := StandardMaterial3D.new()
	pmat.albedo_color = Color(0.23, 0.25, 0.27)
	pmat.roughness = 0.8
	pod.material_override = pmat
	add_child(pod)
	var ring := MeshInstance3D.new()
	var rt := TorusMesh.new()
	rt.inner_radius = 11.8
	rt.outer_radius = 12.0
	ring.mesh = rt
	ring.position.y = 0.56
	var rmat := StandardMaterial3D.new()
	rmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	rmat.albedo_color = Color(0.53, 0.77, 1.0)
	rmat.emission_enabled = true
	rmat.emission = Color(0.53, 0.77, 1.0)
	rmat.emission_energy_multiplier = 1.8
	ring.material_override = rmat
	add_child(ring)
	# اکسسوری
	var drum_mat := StandardMaterial3D.new()
	drum_mat.albedo_color = Color(0.48, 0.23, 0.16)
	drum_mat.metallic = 0.5
	drum_mat.roughness = 0.55
	for dp in [Vector3(-17, 1.1, -18), Vector3(-15.6, 1.1, -18.8), Vector3(-16.4, 1.1, -16.9)]:
		var drum := MeshInstance3D.new()
		var dc := CylinderMesh.new()
		dc.top_radius = 0.85
		dc.bottom_radius = 0.85
		dc.height = 2.2
		drum.mesh = dc
		drum.position = dp
		drum.material_override = drum_mat
		add_child(drum)
	var crate_mat := StandardMaterial3D.new()
	crate_mat.albedo_color = Color(0.42, 0.35, 0.24)
	crate_mat.roughness = 0.9
	var crate := MeshInstance3D.new()
	var cb := BoxMesh.new()
	cb.size = Vector3(2.4, 1.4, 1.6)
	crate.mesh = cb
	crate.position = Vector3(16.5, 0.7, -16)
	crate.material_override = crate_mat
	add_child(crate)
	# گردوغبار
	var dust := GPUParticles3D.new()
	dust.amount = 70
	dust.lifetime = 6.0
	dust.position = Vector3(0, 6, 0)
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(16, 6, 16)
	pm.direction = Vector3(0, 1, 0)
	pm.initial_velocity_min = 0.05
	pm.initial_velocity_max = 0.25
	pm.gravity = Vector3.ZERO
	pm.scale_min = 0.03
	pm.scale_max = 0.09
	pm.color = Color(1.0, 0.95, 0.85, 0.35)
	dust.process_material = pm
	var qm := QuadMesh.new()
	qm.size = Vector2(0.6, 0.6)
	var qmat := StandardMaterial3D.new()
	qmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	qmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	qmat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	qmat.albedo_color = Color(1, 1, 1, 0.4)
	qmat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	qm.material = qmat
	dust.draw_pass_1 = qm
	add_child(dust)
	dust.emitting = true

func _mk_hemi() -> Light3D:
	var h := OmniLight3D.new()
	h.omni_range = 80.0
	h.light_color = Color(0.61, 0.71, 0.85)
	h.light_energy = 0.5
	return h

func _mk_spot(c: Color, energy: float, pos: Vector3) -> SpotLight3D:
	var s := SpotLight3D.new()
	s.light_color = c
	s.light_energy = energy
	s.spot_range = 90.0
	s.spot_angle = 32.0
	s.spot_attenuation = 1.6
	s.shadow_enabled = true
	s.look_at_from_position(pos, Vector3(0, 2.5, 0), Vector3.UP)
	return s

func set_jet(spec: Dictionary) -> void:
	if _jet != null:
		_jet.queue_free()
	var built: Dictionary = JetBuilderG.build(spec)
	_jet = built.node
	var s: float = spec.get("len", 15.0) / 15.0
	_jet.position = Vector3(0, 0.56 + 2.12 * s, 0)
	_jet.rotation.y = 0.35
	add_child(_jet)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		_drag = event.pressed
		_last_mouse = event.position
	elif event is InputEventMouseMotion and _drag:
		var rel: Vector2 = event.position - _last_mouse
		_last_mouse = event.position
		cam_az_target += rel.x * 0.006
		cam_pol_target = clampf(cam_pol_target - rel.y * 0.003, 0.10, 0.58)
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			cam_r_target = clampf(cam_r_target - 2.0, 15.0, 40.0)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			cam_r_target = clampf(cam_r_target + 2.0, 15.0, 40.0)

func update_cam(dt: float, cam: Camera3D) -> void:
	_t += dt
	cam_az_target += dt * 0.05
	cam_az += (cam_az_target - cam_az) * minf(1.0, dt * 4.0)
	cam_pol += (cam_pol_target - cam_pol) * minf(1.0, dt * 4.0)
	cam_r += (cam_r_target - cam_r) * minf(1.0, dt * 4.0)
	var y := sin(cam_pol) * cam_r
	var r := cos(cam_pol) * cam_r
	cam.position = Vector3(cos(cam_az) * r, y, sin(cam_az) * r)
	cam.look_at(Vector3(0, 3.2, 0))
	if key_light != null:
		key_light.light_energy = 32000.0 * (0.97 + sin(_t * 7.3) * 0.02)
