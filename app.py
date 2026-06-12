from flask import Flask, render_template, jsonify, request
import traceback
import io
import sys
import json

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/run', methods=['POST'])
def run_workflow():
    """执行工作流"""
    try:
        data = request.json
        nodes = data.get('nodes', [])
        edges = data.get('edges', [])

        # 构建节点映射
        node_map = {node['id']: node for node in nodes}

        # 构建邻接表和入度表
        adj = {node['id']: [] for node in nodes}
        in_degree = {node['id']: 0 for node in nodes}

        for edge in edges:
            source = edge['source']
            target = edge['target']
            adj[source].append(target)
            in_degree[target] += 1

        # 找到输入节点（入度为0的节点）
        queue = [nid for nid, deg in in_degree.items() if deg == 0]

        if not queue:
            return jsonify({'success': False, 'error': '工作流存在循环依赖'})

        # 拓扑排序执行
        execution_order = []
        temp_queue = queue.copy()

        while temp_queue:
            current = temp_queue.pop(0)
            execution_order.append(current)
            for neighbor in adj[current]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    temp_queue.append(neighbor)

        if len(execution_order) != len(nodes):
            return jsonify({'success': False, 'error': '工作流存在循环依赖'})

        # 执行节点
        node_outputs = {}
        execution_log = []

        for node_id in execution_order:
            node = node_map[node_id]
            node_type = node['type']

            # 收集上游输入
            upstream_data = []
            for edge in edges:
                if edge['target'] == node_id:
                    upstream_id = edge['source']
                    upstream_data.append(node_outputs.get(upstream_id, ''))

            # 合并上游输入（如果有多个上游，用换行分隔）
            input_data = '\n'.join(str(d) for d in upstream_data) if upstream_data else ''

            try:
                if node_type == 'input':
                    result = node.get('config', {}).get('value', '')

                elif node_type == 'code':
                    code = node.get('config', {}).get('code', '')
                    # 创建安全的执行环境
                    local_vars = {'input_data': input_data, 'result': None}

                    # 执行用户代码
                    exec_globals = {
                        '__builtins__': {
                            'len': len, 'str': str, 'int': int, 'float': float,
                            'range': range, 'list': list, 'dict': dict, 'set': set,
                            'tuple': tuple, 'print': print, 'sum': sum, 'min': min,
                            'max': max, 'abs': abs, 'round': round, 'sorted': sorted,
                            'enumerate': enumerate, 'zip': zip, 'map': map, 'filter': filter,
                            'any': any, 'all': all, 'type': type, 'isinstance': isinstance,
                            'hasattr': hasattr, 'getattr': getattr, 'setattr': setattr,
                            'open': open, 'Exception': Exception, 'True': True, 'False': False,
                            'None': None, 'bool': bool, 'chr': chr, 'ord': ord,
                            'pow': pow, 'divmod': divmod, 'hex': hex, 'oct': oct, 'bin': bin,
                            'format': format, 'repr': repr, 'ascii': ascii,
                            'input_data': input_data
                        }
                    }

                    # 捕获标准输出
                    old_stdout = sys.stdout
                    sys.stdout = io.StringIO()

                    try:
                        exec(code, exec_globals, local_vars)
                        captured_output = sys.stdout.getvalue()
                    finally:
                        sys.stdout = old_stdout

                    # 优先返回 result 变量，其次捕获的输出，最后返回 input_data
                    if local_vars.get('result') is not None:
                        result = str(local_vars['result'])
                    elif captured_output.strip():
                        result = captured_output.strip()
                    else:
                        result = input_data

                elif node_type == 'output':
                    result = input_data

                else:
                    result = ''

                node_outputs[node_id] = result
                execution_log.append({
                    'nodeId': node_id,
                    'nodeType': node_type,
                    'input': input_data,
                    'output': result,
                    'status': 'success'
                })

            except Exception as e:
                error_msg = str(e)
                node_outputs[node_id] = f"Error: {error_msg}"
                execution_log.append({
                    'nodeId': node_id,
                    'nodeType': node_type,
                    'input': input_data,
                    'output': f"Error: {error_msg}",
                    'status': 'error',
                    'error': error_msg
                })

        # 找到输出节点的结果
        output_result = ''
        for node in nodes:
            if node['type'] == 'output':
                output_result = node_outputs.get(node['id'], '')
                break

        return jsonify({
            'success': True,
            'result': output_result,
            'executionLog': execution_log,
            'nodeOutputs': node_outputs
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        })

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
