import pytest

from app.cli import parse_selection


def test_ranges_and_singles_keep_the_order_given():
    assert parse_selection("5,1-3", 5) == [4, 0, 1, 2]


def test_duplicates_and_spaces_are_ignored():
    assert parse_selection(" 2, 1-3 ,2", 3) == [1, 0, 2]


@pytest.mark.parametrize("spec", ["0", "4", "3-2", "x", "1-", ","])
def test_bad_specs_are_refused(spec):
    with pytest.raises(ValueError):
        parse_selection(spec, 3)
