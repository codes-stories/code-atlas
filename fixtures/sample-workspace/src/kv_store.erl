%% @doc
%% A simple key-value store implemented as a gen_server.
%% Used as a parser fixture for Code Atlas tests.
-module(kv_store).
-behaviour(gen_server).

-export([start_link/0, stop/0, get/1, put/2, delete/1]).
-export([init/1, handle_call/3, handle_cast/2, handle_info/2,
         terminate/2, code_change/3]).

-define(SERVER, ?MODULE).

%% Public API

start_link() ->
    gen_server:start_link({local, ?SERVER}, ?MODULE, [], []).

stop() ->
    gen_server:cast(?SERVER, stop).

get(Key) ->
    gen_server:call(?SERVER, {get, Key}).

put(Key, Value) ->
    gen_server:cast(?SERVER, {put, Key, Value}).

delete(Key) ->
    gen_server:cast(?SERVER, {delete, Key}).

%% gen_server callbacks

init([]) ->
    {ok, #{}}.

handle_call({get, Key}, _From, State) ->
    case maps:find(Key, State) of
        {ok, Value} -> {reply, {ok, Value}, State};
        error       -> {reply, {error, not_found}, State}
    end;
handle_call(_Request, _From, State) ->
    {reply, {error, unknown_request}, State}.

handle_cast({put, Key, Value}, State) ->
    {noreply, maps:put(Key, Value, State)};
handle_cast({delete, Key}, State) ->
    {noreply, maps:remove(Key, State)};
handle_cast(stop, State) ->
    {stop, normal, State};
handle_cast(_Msg, State) ->
    {noreply, State}.

handle_info(_Info, State) ->
    {noreply, State}.

terminate(_Reason, _State) ->
    ok.

code_change(_OldVsn, State, _Extra) ->
    {ok, State}.
