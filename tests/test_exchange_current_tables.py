import pybamm
import pytest

from backend.parameters.exchange_current_tables import (
    ELECTRODES,
    exchange_current_interpolant,
    validate_exchange_current_tables,
)
from backend.simulation.runner import prepare

EXPERIMENT = {
    "type": "discharge",
    "current_mode": "c_rate",
    "c_rate": 1,
    "duration_s": 30,
    "temperature_K": 298.15,
}

TABLES = {
    "negative": [
        {"sto": 0.0, "j0": 2.0},
        {"sto": 0.5, "j0": 6.0},
        {"sto": 1.0, "j0": 10.0},
    ]
}


def test_exchange_current_interpolates_by_stoichiometry():
    function = exchange_current_interpolant(TABLES["negative"], "negative")
    result = function(
        pybamm.Scalar(1000),
        pybamm.Scalar(0.25),
        pybamm.Scalar(1),
        pybamm.Scalar(298.15),
    )
    assert float(result.evaluate().item()) == pytest.approx(4.0)


def test_validation_rejects_non_increasing_sto_and_nonpositive_density():
    duplicate_sto = {
        "negative": [
            {"sto": 0.5, "j0": 2.0},
            {"sto": 0.5, "j0": 1.0},
        ]
    }
    errors = validate_exchange_current_tables(duplicate_sto)
    assert any("creciente" in error for error in errors)

    nonpositive_density = {
        "negative": [
            {"sto": 0.0, "j0": 2.0},
            {"sto": 1.0, "j0": 0.0},
        ]
    }
    errors = validate_exchange_current_tables(nonpositive_density)
    assert any("j0" in error and "> 0" in error for error in errors)


def test_prepare_replaces_only_the_uploaded_electrode_function():
    prepared, errors, _warnings = prepare(
        "sodium_ion",
        {},
        EXPERIMENT,
        exchange_current_tables=TABLES,
    )
    assert errors == []
    assert prepared is not None
    parameter_values, _spec, _merged = prepared
    assert callable(parameter_values[ELECTRODES["negative"]])
    assert callable(parameter_values[ELECTRODES["positive"]])
    original = pybamm.ParameterValues("Chayambuka2022")
    assert parameter_values[ELECTRODES["positive"]] is original[ELECTRODES["positive"]]


def test_prepare_rejects_one_point_table():
    invalid = {"positive": [{"sto": 0.2, "j0": 2.0}]}
    prepared, errors, _warnings = prepare(
        "sodium_ion",
        {},
        EXPERIMENT,
        exchange_current_tables=invalid,
    )
    assert prepared is None
    assert any("al menos 2 puntos" in error for error in errors)
