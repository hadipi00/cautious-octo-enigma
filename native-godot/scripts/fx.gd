class_name Fx
extends Node3D
## افکت‌های انفجار و جرقه

var audio: GameAudio

func explosion(pos: Vector3, scale_f := 1.0) -> void:
	var p := CPUParticles3D.new()
	p.amount = 46
	p.lifetime = 1.3
	p.one_shot = true
	p.explosiveness = 1.0
	p.spread = 180.0
	p.gravity = Vector3(0, -18, 0)
	p.initial_velocity_min = 12.0 * scale_f
	p.initial_velocity_max = 45.0 * scale_f
	p.scale_amount_min = 2.0 * scale_f
	p.scale_amount_max = 5.0 * scale_f
	p.mesh = _chunk_mesh()
	var g := Gradient.new()
	g.colors = PackedColorArray([
		Color(1.0, 0.85, 0.4), Color(1.0, 0.45, 0.1), Color(0.25, 0.2, 0.18, 0.0),
	])
	p.color_ramp = g
	add_child(p)
	p.global_position = pos
	p.emitting = true

	var light := OmniLight3D.new()
	light.light_color = Color(1.0, 0.6, 0.25)
	light.light_energy = 14.0 * scale_f
	light.omni_range = 120.0 * scale_f
	add_child(light)
	light.global_position = pos
	var tw := create_tween()
	tw.tween_property(light, "light_energy", 0.0, 0.9)
	tw.tween_callback(light.queue_free)

	get_tree().create_timer(2.6).timeout.connect(p.queue_free)
	if audio:
		audio.explosion()

func spark(pos: Vector3) -> void:
	var p := CPUParticles3D.new()
	p.amount = 12
	p.lifetime = 0.4
	p.one_shot = true
	p.explosiveness = 1.0
	p.spread = 180.0
	p.gravity = Vector3(0, -25, 0)
	p.initial_velocity_min = 20.0
	p.initial_velocity_max = 50.0
	p.scale_amount_min = 0.5
	p.scale_amount_max = 1.2
	p.mesh = _chunk_mesh()
	var g := Gradient.new()
	g.colors = PackedColorArray([Color(1.0, 0.9, 0.5), Color(1.0, 0.5, 0.1, 0.0)])
	p.color_ramp = g
	add_child(p)
	p.global_position = pos
	p.emitting = true
	get_tree().create_timer(0.8).timeout.connect(p.queue_free)

func _chunk_mesh() -> Mesh:
	var sm := SphereMesh.new()
	sm.radius = 1.0
	sm.height = 2.0
	sm.radial_segments = 6
	sm.rings = 3
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(1, 1, 1)
	m.emission_enabled = true
	m.emission = Color(1.0, 0.5, 0.15)
	m.emission_energy_multiplier = 2.0
	m.vertex_color_use_as_albedo = true
	sm.material = m
	return sm
