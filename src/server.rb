$LOAD_PATH.unshift "s:/solargraph/lib"
require 'solargraph'
require 'json'
require 'sinatra'

set :port, 56527

api_map = Solargraph::ApiMap.new
api_map.merge(Parser::CurrentRuby.parse(File.read("#{Solargraph::STUB_PATH}/ruby/2.3.0/core.rb")))
api_map.freeze

post '/suggest' do
  content_type :json
  begin
    map = Solargraph::CodeMap.new(params['script'], api_map: api_map)
    sugg = map.suggest_at(params['index'].to_i, with_snippets: true, filtered: true)
    result = { "status" => "ok", "suggestions" => sugg }
    result.to_json
  rescue Exception => e
    STDERR.puts e
    STDERR.puts e.backtrace.join("\n")
    { "status" => "err", "message" => e.message }.to_json
  end
end
