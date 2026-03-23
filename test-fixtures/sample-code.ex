# implementation
defmodule RowParser do
  def parse(input) do
    input
    |> String.split("\n", trim: true)
    |> Stream.map(&String.trim_leading/1)
    |> Stream.map(fn str ->
      [left, right] = String.split(str, ~r/\s{3}/)
      [String.to_integer(left), String.to_integer(right)]
    end)
    |> Enum.to_list()
    |> Enum.reduce(%{left: [], right: []}, fn [left, right], acc ->
      acc
      |> Map.put(:left, [ left | acc[:left]])
      |> Map.put(:right, [ right | acc[:right]])
    end)
  end
end

# test
ExUnit.start(autorun: false)

defmodule RowParserTest do
  use ExUnit.Case, async: true

  @test_input """
  3   4
  4   3
  2   5
  1   3
  3   9
  3   3
  """

  test "row parse test" do
    assert RowParser.parse(@test_input) ==
             %{left: [3, 3, 1, 2, 4, 3], right: [3, 9, 3, 5, 3, 4]}
  end
end

ExUnit.run()
