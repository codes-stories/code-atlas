%% @doc
%% Utility module with local function calls — used to verify
%% that the parser correctly extracts local call edges.
-module(math_utils).

-export([factorial/1, fibonacci/1, sum/1]).

%% Computes n! recursively.
factorial(0) -> 1;
factorial(N) when N > 0 -> N * factorial(N - 1).

%% Computes the Nth Fibonacci number.
fibonacci(0) -> 0;
fibonacci(1) -> 1;
fibonacci(N) when N > 1 -> fibonacci(N - 1) + fibonacci(N - 2).

%% Sums a list of numbers.
sum([])     -> 0;
sum([H|T])  -> H + sum(T).
