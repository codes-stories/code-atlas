%% @doc
%% Top-level supervisor that starts the kv_store worker.
-module(kv_sup).
-behaviour(supervisor).

-export([start_link/0]).
-export([init/1]).

start_link() ->
    supervisor:start_link({local, ?MODULE}, ?MODULE, []).

init([]) ->
    Worker = #{
        id      => kv_store,
        start   => {kv_store, start_link, []},
        restart => permanent,
        type    => worker
    },
    {ok, {{one_for_one, 5, 10}, [Worker]}}.
