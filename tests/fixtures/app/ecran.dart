// Écran Flutter de test : cibles Semantics(identifier: …).
import 'package:flutter/material.dart';

Widget ecran(List<String> ids) => Column(children: [
      Semantics(identifier: 'dart-titre', child: const Text('Titre')),
      Semantics(identifier: "dart-recherche", child: const TextField()),
      for (final id in ids) Semantics(identifier: 'dart-carte-$id', child: Text(id)),
    ]);
