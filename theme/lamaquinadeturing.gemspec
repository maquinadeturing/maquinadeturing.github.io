# frozen_string_literal: true

Gem::Specification.new do |spec|
  spec.name          = "lamaquinadeturing"
  spec.version       = "0.1.0"
  spec.authors       = ["Oriol Arcas"]
  spec.email         = ["oriol.arcas@gmail.com"]

  spec.summary       = "Tema de Jekyll per a lamaquinadeturing.su."
  spec.homepage      = "https://lamaquinadeturing.su"
  spec.license       = "MIT"

  spec.files         = `git ls-files -z`.split("\x0").select { |f| f.match(%r!^(assets|_data|_layouts|_includes|_sass|LICENSE|README|_config\.yml)!i) }

  spec.add_runtime_dependency "jekyll", "~> 4.3"
end
