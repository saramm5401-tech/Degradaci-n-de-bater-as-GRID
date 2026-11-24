"""Tablas opcionales de densidad de corriente de intercambio por estequiometría."""

from __future__ import annotations

import math

import numpy as np
import pybamm

ELECTRODES = {
    "negative": "Negative electrode exchange-current density [A.m-2]",
    "positive": "Positive electrode exchange-current density [A.m-2]",
}


def _finite_number(value) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    if not math.isfinite(number):
        return None
    return number


def validate_exchange_current_tables(tables) -> list[str]:
    errors: list[str] = []
    if tables is None:
        return errors
    if not isinstance(tables, dict):
        return ["exchange_current_tables tiene que ser un objeto con claves 'negative' y 'positive'."]

    for electrode in tables:
        if electrode not in ELECTRODES:
            errors.append(
                f"exchange_current_tables: electrodo desconocido '{electrode}'. "
                "Use 'negative' o 'positive'."
            )

    for electrode in ELECTRODES:
        points = tables.get(electrode)
        if points is None or points == []:
            continue
        if not isinstance(points, list):
            errors.append(
                f"exchange_current_tables.{electrode} tiene que ser una lista de puntos {{sto, j0}}."
            )
            continue
        if len(points) < 2:
            errors.append(
                f"exchange_current_tables.{electrode} necesita al menos 2 puntos; "
                f"llegaron {len(points)}."
            )
            continue

        sto_values: list[float] = []
        valid = True
        for index, point in enumerate(points):
            if not isinstance(point, dict):
                errors.append(
                    f"exchange_current_tables.{electrode}[{index}] tiene que ser "
                    "un objeto con sto y j0."
                )
                valid = False
                continue
            sto = _finite_number(point.get("sto"))
            density = _finite_number(point.get("j0"))
            if sto is None:
                errors.append(
                    f"exchange_current_tables.{electrode}[{index}].sto "
                    "tiene que ser un número finito."
                )
                valid = False
            if density is None or density <= 0:
                errors.append(
                    f"exchange_current_tables.{electrode}[{index}].j0 "
                    "tiene que ser un número finito > 0."
                )
                valid = False
            if sto is not None:
                sto_values.append(sto)

        if not valid or len(sto_values) != len(points):
            continue
        for previous, current in zip(sto_values, sto_values[1:]):
            if current <= previous:
                errors.append(
                    f"exchange_current_tables.{electrode}: sto tiene que ser "
                    f"estrictamente creciente ({previous} seguido de {current})."
                )
                break

    return errors


def exchange_current_interpolant(points, electrode: str):
    """Construye j0(sto); la tabla sustituye la función completa del conjunto."""
    sto = np.asarray([point["sto"] for point in points], dtype=float)
    density = np.asarray([point["j0"] for point in points], dtype=float)

    def exchange_current(_c_e, c_s_surf, c_s_max, _temperature):
        return pybamm.Interpolant(
            sto,
            density,
            c_s_surf / c_s_max,
            f"Uploaded {electrode} exchange-current density",
        )

    return exchange_current
